/**
 * Ghost OpenCode Command
 *
 * Launch OpenCode with ghost mode configuration. Uses environment variables
 * to inject profile settings without modifying project files.
 */

import { existsSync, statSync } from "node:fs"
import path, { join, relative } from "node:path"
import { Glob } from "bun"
import type { Command } from "commander"
import { ProfileManager } from "../../profile/manager.js"
import { getProfileDir, getProfileOpencodeConfig } from "../../profile/paths.js"
import { NotFoundError, ProfilesNotInitializedError, ValidationError } from "../../utils/errors.js"
import { getGitInfo } from "../../utils/git-context.js"
import { handleError, logger } from "../../utils/index.js"
import { isAbsolutePath } from "../../utils/path-helpers.js"
import { sharedOptions } from "../../utils/shared-options.js"
import {
	formatTerminalName,
	restoreTerminalTitle,
	saveTerminalTitle,
	setTerminalName,
} from "../../utils/terminal-title.js"

// =============================================================================
// PATH RESOLUTION TYPES AND UTILITIES
// =============================================================================

/**
 * Filesystem operations interface for dependency injection.
 * Enables pure unit testing by decoupling from real fs.
 */
export interface FsOperations {
	existsSync: (path: string) => boolean
	statSync: (path: string) => { isDirectory: () => boolean }
}

/**
 * Default filesystem operations using node:fs.
 * Used in production; tests can inject mocks.
 */
export const defaultFs: FsOperations = {
	existsSync,
	statSync,
}

/**
 * Resolved project path with remaining args for command passthrough.
 * Parse-don't-validate: data is in trusted state after resolution.
 */
export interface ResolvedProjectPath {
	/** Absolute path to the project directory (validated to exist and be a directory) */
	readonly projectDir: string
	/** Args to pass through to OpenCode (excludes consumed path argument) */
	readonly remainingArgs: string[]
	/** Original path input if explicitly provided (for logging), null if using cwd */
	readonly explicitPath: string | null
}

/**
 * Resolves and validates a project path from CLI arguments.
 *
 * Follows the 5 Laws of Elegant Defense:
 * - Law 1 (Early Exit): Guard clauses handle edge cases at top
 * - Law 2 (Parse Don't Validate): Returns trusted ResolvedProjectPath type
 * - Law 4 (Fail Fast): Throws clear errors for invalid states
 * - Law 5 (Intentional Naming): Names describe exact purpose
 *
 * @param args - CLI arguments array, may contain `--` sentinel
 * @param cwd - Current working directory for relative path resolution
 * @param fs - Filesystem operations (injectable for testing)
 * @returns Resolved project path with remaining args for passthrough
 * @throws NotFoundError - Path does not exist
 * @throws ValidationError - Path exists but is not a directory
 *
 * @example
 * // No path argument - use cwd
 * resolveProjectPath([], '/home/user')
 * // => { projectDir: '/home/user', remainingArgs: [], explicitPath: null }
 *
 * @example
 * // Absolute path
 * resolveProjectPath(['/projects/foo'], '/home/user')
 * // => { projectDir: '/projects/foo', remainingArgs: [], explicitPath: '/projects/foo' }
 *
 * @example
 * // Relative path with extra args
 * resolveProjectPath(['./myproject', '--help'], '/home/user')
 * // => { projectDir: '/home/user/myproject', remainingArgs: ['--help'], explicitPath: './myproject' }
 *
 * @example
 * // POSIX sentinel - first arg after '--' is path
 * resolveProjectPath(['--', '/projects/foo', '--help'], '/home/user')
 * // => { projectDir: '/projects/foo', remainingArgs: ['--help'], explicitPath: '/projects/foo' }
 */
export function resolveProjectPath(
	args: string[],
	cwd: string,
	fs: FsOperations = defaultFs,
): ResolvedProjectPath {
	// Law 1: Early Exit - no arguments means use cwd
	if (args.length === 0) {
		return { projectDir: cwd, remainingArgs: [], explicitPath: null }
	}

	const firstArg = args[0]

	// Law 1: Early Exit - undefined first arg (shouldn't happen but satisfies TS)
	if (firstArg === undefined) {
		return { projectDir: cwd, remainingArgs: [], explicitPath: null }
	}

	// Law 1: Early Exit - handle POSIX `--` sentinel
	// Pattern: `ocx ghost opencode -- /path/to/project`
	// The `--` signals end of options; next arg is the path
	let pathArg: string
	let remainingArgs: string[]

	if (firstArg === "--") {
		// After `--`, the next argument is the path
		const secondArg = args[1]
		if (secondArg === undefined) {
			// `--` with no following arg means use cwd
			return { projectDir: cwd, remainingArgs: [], explicitPath: null }
		}
		pathArg = secondArg
		remainingArgs = args.slice(2) // Skip `--` and path
	} else {
		// Check if first arg looks like a path (exists as directory)
		const potentialPath = isAbsolutePath(firstArg) ? firstArg : path.resolve(cwd, firstArg)

		// If first arg doesn't exist or isn't a directory, treat all args as passthrough
		if (!fs.existsSync(potentialPath)) {
			return { projectDir: cwd, remainingArgs: args, explicitPath: null }
		}

		const stat = fs.statSync(potentialPath)
		if (!stat.isDirectory()) {
			// First arg exists but isn't a directory - pass all args through
			return { projectDir: cwd, remainingArgs: args, explicitPath: null }
		}

		// First arg is a valid directory path
		pathArg = firstArg
		remainingArgs = args.slice(1) // Skip path
	}

	// Resolve to absolute path (Law 2: Parse at boundary)
	const projectDir = isAbsolutePath(pathArg) ? pathArg : path.resolve(cwd, pathArg)

	// Law 4: Fail Fast - validate path exists (already checked above for non-sentinel case)
	if (!fs.existsSync(projectDir)) {
		throw new NotFoundError(`Project path does not exist: ${pathArg}`)
	}

	// Law 4: Fail Fast - validate path is a directory
	const stat = fs.statSync(projectDir)
	if (!stat.isDirectory()) {
		throw new ValidationError(`Project path is not a directory: ${pathArg}`)
	}

	// Law 2: Return parsed, trusted state
	return {
		projectDir,
		remainingArgs,
		explicitPath: pathArg,
	}
}

// =============================================================================
// INSTRUCTION FILE DISCOVERY
// =============================================================================

const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"] as const

/**
 * Find git root by looking for .git (file or directory).
 * Returns null if not in a git repo.
 */
export function detectGitRoot(startDir: string): string | null {
	let currentDir = startDir

	while (true) {
		const gitPath = join(currentDir, ".git")
		if (existsSync(gitPath)) {
			return currentDir
		}

		const parentDir = join(currentDir, "..")
		if (parentDir === currentDir) return null // filesystem root
		currentDir = parentDir
	}
}

/**
 * Discover instruction files by walking UP from projectDir to gitRoot.
 * Returns repo-relative paths, deepest first, alphabetical within each depth.
 */
export function discoverInstructionFiles(projectDir: string, gitRoot: string | null): string[] {
	const root = gitRoot ?? projectDir
	const discovered: string[] = []
	let currentDir = projectDir

	// Walk up from projectDir to root
	while (true) {
		// Check for each instruction file (alphabetical order)
		for (const filename of INSTRUCTION_FILES) {
			const filePath = join(currentDir, filename)
			if (existsSync(filePath) && statSync(filePath).isFile()) {
				// Store as relative to root
				const relativePath = relative(root, filePath)
				discovered.push(relativePath)
			}
		}

		// Stop if we've reached the root
		if (currentDir === root) break

		// Move up one directory
		const parentDir = join(currentDir, "..")
		if (parentDir === currentDir) break // filesystem root
		currentDir = parentDir
	}

	// Walk starts at deepest (projectDir) and goes up to root,
	// so discovered array is already in deepest-first order
	return discovered
}

/**
 * Normalize a glob pattern by stripping leading "./" for consistent matching.
 * Discovered paths are repo-relative (e.g. "src/AGENTS.md") so patterns
 * with "./" prefix (e.g. "./src/AGENTS.md") need normalization to match.
 */
function normalizePattern(pattern: string): string {
	return pattern.startsWith("./") ? pattern.slice(2) : pattern
}

/**
 * Filter files using TypeScript/Vite style include/exclude.
 * Include overrides exclude, order is preserved.
 */
export function filterByPatterns(files: string[], exclude: string[], include: string[]): string[] {
	return files.filter((file) => {
		// Check include first - include overrides exclude
		for (const pattern of include) {
			const glob = new Glob(normalizePattern(pattern))
			if (glob.match(file)) return true
		}

		// Check exclude
		for (const pattern of exclude) {
			const glob = new Glob(normalizePattern(pattern))
			if (glob.match(file)) return false
		}

		// Not matched by include or exclude - keep it
		return true
	})
}

interface GhostOpenCodeOptions {
	json?: boolean
	quiet?: boolean
	profile?: string
	rename?: boolean
}

export function registerGhostOpenCodeCommand(parent: Command): void {
	parent
		.command("opencode")
		.description("Launch OpenCode with ghost mode configuration (first arg can be project path)")
		.option("-p, --profile <name>", "Use specific profile")
		.option("--no-rename", "Disable terminal/tmux window renaming")
		.addOption(sharedOptions.json())
		.addOption(sharedOptions.quiet())
		.allowUnknownOption()
		.allowExcessArguments(true)
		.action(async (options: GhostOpenCodeOptions, command: Command) => {
			try {
				await runGhostOpenCode(command.args, options)
			} catch (error) {
				handleError(error, { json: options.json })
			}
		})
}

async function runGhostOpenCode(args: string[], options: GhostOpenCodeOptions): Promise<void> {
	// Guard: Check profiles are initialized (Law 1: Early Exit)
	const manager = ProfileManager.create()
	if (!(await manager.isInitialized())) {
		throw new ProfilesNotInitializedError()
	}

	// Resolve current profile (respects --profile flag, OCX_PROFILE env, or symlink)
	const profileName = await manager.getCurrent(options.profile)
	const profile = await manager.get(profileName)

	// Get the profile's config directory
	const profileDir = getProfileDir(profileName)

	// Check for profile's opencode.jsonc (optional)
	const profileOpencodePath = getProfileOpencodeConfig(profileName)
	const profileOpencodeFile = Bun.file(profileOpencodePath)
	const hasOpencodeConfig = await profileOpencodeFile.exists()

	// Guard: Warn if opencode config is empty/missing (but still proceed)
	// Suppress warning in quiet mode
	if (!hasOpencodeConfig && !options.quiet) {
		logger.warn(
			`No opencode.jsonc found at ${profileOpencodePath}. Create one to customize OpenCode settings.`,
		)
	}

	// Resolve project path from args (Law 2: Parse at boundary)
	// If user provided a path, use it; otherwise fall back to cwd
	const { projectDir, remainingArgs, explicitPath } = resolveProjectPath(args, process.cwd())

	// Log explicit path usage (Law 5: Intentional Naming - user knows what happened)
	if (explicitPath && !options.quiet) {
		logger.info(`Using project directory: ${projectDir}`)
	}

	// Determine if terminal should be renamed (Law 1: compute once, use in closure)
	// Precedence: CLI flag > config > default(true)
	const ghostConfig = profile.ghost
	const shouldRename = options.rename !== false && ghostConfig.renameWindow !== false

	// Discover and filter project instruction files
	const gitRoot = detectGitRoot(projectDir)
	const discoveredFiles = discoverInstructionFiles(projectDir, gitRoot)
	const filteredFiles = filterByPatterns(
		discoveredFiles,
		ghostConfig.exclude ?? [],
		ghostConfig.include ?? [],
	)

	// Convert to absolute paths (relative to git root or project dir)
	const root = gitRoot ?? projectDir
	const projectInstructions = filteredFiles.map((f) => join(root, f))

	// Merge with profile instructions (profile comes LAST = highest priority)
	const profileInstructionsRaw = profile.opencode?.instructions
	const profileInstructions: string[] = Array.isArray(profileInstructionsRaw)
		? profileInstructionsRaw
		: []
	const allInstructions = [...projectInstructions, ...profileInstructions]

	// Build the config to pass to OpenCode (only if we have instructions or existing config)
	const configToPass =
		allInstructions.length > 0 || profile.opencode
			? {
					...profile.opencode,
					instructions: allInstructions.length > 0 ? allInstructions : undefined,
				}
			: undefined

	// Setup signal handlers BEFORE spawn to avoid race condition
	let proc: ReturnType<typeof Bun.spawn> | null = null

	const sigintHandler = () => proc?.kill("SIGINT")
	const sigtermHandler = () => proc?.kill("SIGTERM")

	process.on("SIGINT", sigintHandler)
	process.on("SIGTERM", sigtermHandler)

	// Exit handler for terminal title restoration
	const exitHandler = () => {
		if (shouldRename) {
			restoreTerminalTitle()
		}
	}
	process.on("exit", exitHandler)

	// Set terminal name only if enabled (Law 1: Early Exit pattern)
	if (shouldRename) {
		saveTerminalTitle()
		const gitInfo = await getGitInfo(projectDir)
		setTerminalName(formatTerminalName(projectDir, profileName, gitInfo))
	}

	// Spawn OpenCode directly in the project directory with config via environment
	proc = Bun.spawn({
		cmd: [ghostConfig.bin ?? process.env.OPENCODE_BIN ?? "opencode", ...remainingArgs],
		cwd: projectDir,
		env: {
			...process.env,
			OPENCODE_DISABLE_PROJECT_CONFIG: "true",
			OPENCODE_CONFIG_DIR: profileDir,
			...(configToPass && { OPENCODE_CONFIG_CONTENT: JSON.stringify(configToPass) }),
			OCX_PROFILE: profileName,
		},
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	})

	try {
		// Wait for child to exit
		const exitCode = await proc.exited

		// Cleanup signal handlers
		process.off("SIGINT", sigintHandler)
		process.off("SIGTERM", sigtermHandler)
		process.off("exit", exitHandler)

		// Restore terminal title if we renamed it
		if (shouldRename) {
			restoreTerminalTitle()
		}

		process.exit(exitCode)
	} catch (error) {
		// Error during spawn/wait - cleanup handlers
		process.off("SIGINT", sigintHandler)
		process.off("SIGTERM", sigtermHandler)
		process.off("exit", exitHandler)

		if (shouldRename) {
			restoreTerminalTitle()
		}

		throw error
	}
}
