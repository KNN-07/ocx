/**
 * Symlink Farm Utility
 *
 * Creates a temporary directory with symlinks to project files,
 * filtered by include/exclude patterns. Used by ghost mode to isolate
 * from project-level OpenCode configuration.
 */

import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { mkdir, readdir, rename, rm, stat, symlink } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { dirname, isAbsolute, join, posix, relative } from "node:path"
import ignore, { type Ignore } from "ignore"
import { FileLimitExceededError } from "./errors"
import { createPathMatcher, normalizeForMatching, type PathMatcher } from "./pattern-filter"

/**
 * Pre-computed symlink plan - parsed once, executed without re-evaluation.
 * Makes illegal states unrepresentable (Law 2: Parse Don't Validate).
 */
export interface SymlinkPlan {
	/** Directories to symlink as-is (full inclusion) */
	wholeDirs: string[]
	/** Individual files to symlink */
	files: string[]
	/** Directories needing partial expansion - recursive structure */
	partialDirs: Map<string, SymlinkPlan>
}

/**
 * Result of creating a symlink farm.
 */
export interface SymlinkFarmResult {
	/** Path to the temporary directory containing symlinks */
	tempDir: string
	/** Set of relative paths that are symlinks (for containment checks). Uses forward slashes only. */
	symlinkRoots: Set<string>
}

/** Age threshold for stale ghost sessions (24 hours) */
const STALE_SESSION_THRESHOLD_MS = 24 * 60 * 60 * 1000

/** Age threshold for interrupted deletions (1 hour) */
const REMOVING_THRESHOLD_MS = 60 * 60 * 1000

/** Prefix for ghost temp directories */
export const GHOST_DIR_PREFIX = "ocx-ghost-"

/** Suffix for directories being removed */
export const REMOVING_SUFFIX = "-removing"

/** Marker file to identify ghost temp directories */
export const GHOST_MARKER_FILE = ".ocx-ghost-marker"

/**
 * Symlink operation representing an action to perform.
 * Files are added to plan.files, directories can be whole or partial.
 */
interface SymlinkOperation {
	type: "directory"
	source: string
	target: string
}

/**
 * Mutable state passed through recursive traversal.
 * Tracks total entries processed for file limit enforcement.
 * Also tracks directory symlinks for gitignored directories.
 */
type TraversalState = {
	count: number
	plan: SymlinkOperation[]
}

/**
 * Creates a temporary directory with symlinks to the source directory contents,
 * respecting include/exclude patterns for filtering.
 *
 * Uses plan-based approach: compute plan first, then execute.
 * This separates decision logic from I/O for testability and clarity.
 *
 * @param sourceDir - The source directory to create symlinks from
 * @param options - Optional include/exclude patterns for fine-grained control
 * @returns Path to the temporary directory containing symlinks
 */
/**
 * Options for creating a symlink farm.
 */
export interface SymlinkFarmOptions {
	includePatterns?: string[]
	excludePatterns?: string[]
	maxFiles?: number
	/** Project directory for loading git ignore stack (defaults to sourceDir) */
	projectDir?: string
}

export async function createSymlinkFarm(
	sourceDir: string,
	options?: SymlinkFarmOptions,
): Promise<SymlinkFarmResult> {
	// Guard: sourceDir must be absolute (Law 1: Early Exit)
	if (!isAbsolute(sourceDir)) {
		throw new Error(`sourceDir must be an absolute path, got: ${sourceDir}`)
	}

	const suffix = randomBytes(4).toString("hex")
	const tempDir = join(tmpdir(), `${GHOST_DIR_PREFIX}${suffix}`)

	// Create temp directory manually (mkdtemp adds random suffix, we already have one)
	await Bun.write(join(tempDir, GHOST_MARKER_FILE), "")

	try {
		// Load git ignore stack for respecting .gitignore patterns
		const projectDir = options?.projectDir ?? sourceDir
		const gitIgnore = await loadGitIgnoreStack(projectDir)

		// Create PathMatcher once with patterns (Law 2: Parse at boundary)
		const matcher = createPathMatcher(
			options?.includePatterns ?? [],
			options?.excludePatterns ?? [],
		)

		// Initialize traversal state for file limit tracking
		const maxFiles = options?.maxFiles ?? 10000
		const state: TraversalState = { count: 0, plan: [] }

		// Compute plan (decision phase - pure logic)
		const plan = await computeSymlinkPlan(
			sourceDir,
			sourceDir,
			matcher,
			state,
			maxFiles,
			gitIgnore,
			projectDir,
		)

		// Execute plan (I/O phase - creates symlinks)
		// Track all symlinked paths for containment checks during overlay
		const symlinkRoots = new Set<string>()
		await executeSymlinkPlan(plan, sourceDir, tempDir, "", symlinkRoots)

		// Execute gitignored directory symlinks (from state.plan)
		for (const op of state.plan) {
			const relPath = normalizePath(relative(sourceDir, op.source))
			const targetPath = join(tempDir, relPath)
			const parentDir = dirname(targetPath)
			if (parentDir !== tempDir) {
				await mkdir(parentDir, { recursive: true })
			}
			await symlink(op.source, targetPath)
			symlinkRoots.add(relPath)
		}

		return { tempDir, symlinkRoots }
	} catch (error) {
		// Cleanup on failure (Law 4: Fail Fast)
		await rm(tempDir, { recursive: true, force: true }).catch(() => {})
		throw error
	}
}

/**
 * Inject files from a source directory into an existing symlink farm.
 * Used by ghost mode to add ghost config files after farm creation.
 *
 * @param tempDir - The symlink farm directory
 * @param sourceDir - Directory containing files to inject (e.g., ~/.config/ocx/)
 * @param injectPaths - Set of absolute paths to inject
 */
export async function injectGhostFiles(
	tempDir: string,
	sourceDir: string,
	injectPaths: Set<string>,
): Promise<void> {
	// Guard: Validate paths (Law 1: Early Exit)
	if (!isAbsolute(tempDir)) {
		throw new Error(`tempDir must be an absolute path, got: ${tempDir}`)
	}
	if (!isAbsolute(sourceDir)) {
		throw new Error(`sourceDir must be an absolute path, got: ${sourceDir}`)
	}

	for (const injectPath of injectPaths) {
		// Compute relative path from sourceDir
		const relativePath = relative(sourceDir, injectPath)

		// Guard: injectPath must be within sourceDir (Law 1: Early Exit)
		if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
			throw new Error(`injectPath must be within sourceDir: ${injectPath}`)
		}

		const targetPath = join(tempDir, relativePath)

		// Ensure parent directory exists
		const parentDir = dirname(targetPath)
		if (parentDir !== tempDir) {
			await mkdir(parentDir, { recursive: true })
		}

		// Create symlink (skip if already exists - defensive)
		try {
			await symlink(injectPath, targetPath)
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
				throw new Error(`Failed to inject ${injectPath} → ${targetPath}: ${(err as Error).message}`)
			}
		}
	}
}

/**
 * Clean up a symlink farm temp directory using rename-to-removing pattern.
 * This pattern ensures SIGKILL resilience: if the process dies mid-deletion,
 * the -removing directory will be cleaned up on next startup.
 *
 * @param tempDir - Path to the temp directory to remove
 */
export async function cleanupSymlinkFarm(tempDir: string): Promise<void> {
	const removingPath = `${tempDir}${REMOVING_SUFFIX}`

	try {
		await rename(tempDir, removingPath)
	} catch {
		// Directory may already be gone or renamed - that's fine
		return
	}

	await rm(removingPath, { recursive: true, force: true })
}

/**
 * Cleans up orphaned ghost temp directories from interrupted sessions.
 * Uses rename-to-removing pattern for SIGKILL resilience.
 *
 * Scans for:
 * - Directories ending in `-removing` (interrupted deletions, 1 hour threshold)
 * - Directories matching `ocx-ghost-*` (stale sessions, 24 hour threshold)
 *
 * @param tempBase - Base temp directory to scan (defaults to system tmpdir)
 * @returns Count of cleaned directories
 */
export async function cleanupOrphanedGhostDirs(tempBase: string = tmpdir()): Promise<number> {
	let cleanedCount = 0

	// Guard: tempBase must be absolute (Law 1: Early Exit)
	if (!isAbsolute(tempBase)) {
		throw new Error(`tempBase must be an absolute path, got: ${tempBase}`)
	}

	let dirNames: string[]
	try {
		dirNames = await readdir(tempBase)
	} catch {
		// Can't read temp dir - nothing to clean
		return 0
	}

	for (const dirName of dirNames) {
		const dirPath = join(tempBase, dirName)

		// Check for interrupted deletions (ends with -removing)
		const isRemovingDir = dirName.endsWith(REMOVING_SUFFIX)
		const isGhostDir = dirName.startsWith(GHOST_DIR_PREFIX) && !isRemovingDir

		// Skip unrelated entries (Law 1: Early Exit)
		if (!isRemovingDir && !isGhostDir) continue

		// Check if it's a directory and get stats
		let stats: Awaited<ReturnType<typeof stat>>
		try {
			stats = await stat(dirPath)
		} catch {
			// Can't stat - skip this entry
			continue
		}

		// Skip non-directories (Law 1: Early Exit)
		if (!stats.isDirectory()) continue

		// Determine threshold based on directory type
		const threshold = isRemovingDir ? REMOVING_THRESHOLD_MS : STALE_SESSION_THRESHOLD_MS
		const ageMs = Date.now() - stats.mtimeMs

		// Skip if not stale enough (Law 1: Early Exit)
		if (ageMs <= threshold) continue

		// Clean up the stale directory
		try {
			if (isGhostDir) {
				// Use rename-to-removing pattern for normal ghost dirs
				const removingPath = `${dirPath}${REMOVING_SUFFIX}`
				await rename(dirPath, removingPath)
				await rm(removingPath, { recursive: true, force: true })
			} else {
				// Already a -removing dir, just delete it
				await rm(dirPath, { recursive: true, force: true })
			}
			cleanedCount++
		} catch {
			// Best effort cleanup - continue with others
		}
	}

	return cleanedCount
}

/**
 * Compute symlink plan by walking source directory and applying pattern filters.
 * Pure function - no I/O side effects except reading directory.
 *
 * @param sourceDir - Current directory being processed (absolute path)
 * @param projectRoot - Root of the project (for normalizing paths)
 * @param matcher - Pre-compiled PathMatcher for efficient pattern matching
 * @param state - Mutable traversal state for counting and gitignored directory symlinks
 * @param maxFiles - Maximum number of files to process (0 = unlimited)
 * @param gitIgnore - Git ignore instance for respecting .gitignore patterns (null if not a git repo)
 * @param projectDir - Project directory for computing relative paths for gitignore matching
 * @returns Pre-computed symlink plan
 */
export async function computeSymlinkPlan(
	sourceDir: string,
	projectRoot: string,
	matcher: PathMatcher,
	state: TraversalState,
	maxFiles: number,
	gitIgnore: Ignore | null,
	projectDir: string,
): Promise<SymlinkPlan> {
	// Guard: sourceDir must be absolute (Law 1: Early Exit)
	if (!isAbsolute(sourceDir)) {
		throw new Error(`sourceDir must be an absolute path, got: ${sourceDir}`)
	}

	const plan: SymlinkPlan = {
		wholeDirs: [],
		files: [],
		partialDirs: new Map(),
	}

	// Load nested .gitignore if present (gitignore rules are directory-scoped)
	const relativeDirPath = normalizePath(relative(projectDir, sourceDir))
	const nestedGitignorePath = join(sourceDir, ".gitignore")
	if (gitIgnore && existsSync(nestedGitignorePath)) {
		try {
			addScopedRules(gitIgnore, readFileSync(nestedGitignorePath, "utf-8"), relativeDirPath)
		} catch {
			// Nested .gitignore unreadable - continue without it
		}
	}

	const entries = await readdir(sourceDir, { withFileTypes: true })

	for (const entry of entries) {
		// CRITICAL: Never traverse .git directory
		if (entry.name === ".git") continue

		const sourcePath = join(sourceDir, entry.name)
		const targetPath = join(projectRoot, relative(projectRoot, sourceDir), entry.name)
		const relativePath = normalizePath(relative(projectDir, sourcePath))

		// Check if gitignored (with trailing slash for directories per gitignore spec)
		const checkPath = entry.isDirectory() ? `${relativePath}/` : relativePath
		const isGitignored = gitIgnore?.ignores(checkPath) ?? false

		// Law 1: Early Exit - check patterns FIRST for all paths
		const matcherRelativePath = normalizeForMatching(sourcePath, projectRoot)
		const disposition = matcher.getDisposition(matcherRelativePath)

		if (disposition.type === "excluded") {
			continue // Skip this path entirely
		}

		if (entry.isDirectory()) {
			if (isGitignored) {
				// Gitignored directory → symlink atomically, count as 1
				state.plan.push({ type: "directory", source: sourcePath, target: targetPath })
				state.count += 1
				// Check file limit after counting
				if (maxFiles > 0 && state.count > maxFiles) {
					throw new FileLimitExceededError(state.count, maxFiles)
				}
				continue // Don't enter gitignored directories
			}

			if (disposition.type === "included") {
				// Fully included - symlink as-is
				plan.wholeDirs.push(entry.name)
				state.count += 1
				// Check file limit after counting
				if (maxFiles > 0 && state.count > maxFiles) {
					throw new FileLimitExceededError(state.count, maxFiles)
				}
				continue
			}

			// disposition.type === "partial" - directory needs recursive expansion
			const nestedPlan = await computeSymlinkPlan(
				sourcePath,
				projectRoot,
				matcher,
				state,
				maxFiles,
				gitIgnore,
				projectDir,
			)
			plan.partialDirs.set(entry.name, nestedPlan)
		} else {
			// File handling - skip gitignored files
			if (isGitignored) continue

			if (disposition.type === "included") {
				plan.files.push(entry.name)
				state.count += 1
				// Check file limit after counting
				if (maxFiles > 0 && state.count > maxFiles) {
					throw new FileLimitExceededError(state.count, maxFiles)
				}
				continue
			}

			// Files with "partial" disposition: when there are no include patterns,
			// this means we're in default exclude-only mode and the file should be included
			// (it wasn't matched by any exclude pattern, just marked partial due to directory
			// traversal optimization for nested excludes like **/AGENTS.md)
			plan.files.push(entry.name)
			state.count += 1
			// Check file limit after counting
			if (maxFiles > 0 && state.count > maxFiles) {
				throw new FileLimitExceededError(state.count, maxFiles)
			}
		}
	}

	return plan
}

/**
 * Execute a pre-computed symlink plan.
 * I/O phase - creates directories and symlinks.
 *
 * @param plan - Pre-computed symlink plan to execute
 * @param sourceRoot - Source directory (absolute path)
 * @param targetRoot - Target directory to create symlinks in (absolute path)
 */
export async function executeSymlinkPlan(
	plan: SymlinkPlan,
	sourceRoot: string,
	targetRoot: string,
	relativePath: string = "",
	symlinkRoots?: Set<string>,
): Promise<void> {
	// Guard: paths must be absolute (Law 1: Early Exit)
	if (!isAbsolute(sourceRoot)) {
		throw new Error(`sourceRoot must be an absolute path, got: ${sourceRoot}`)
	}
	if (!isAbsolute(targetRoot)) {
		throw new Error(`targetRoot must be an absolute path, got: ${targetRoot}`)
	}

	// Symlink all whole directories
	for (const dirName of plan.wholeDirs) {
		const sourcePath = join(sourceRoot, dirName)
		const targetPath = join(targetRoot, dirName)
		await symlink(sourcePath, targetPath)
		symlinkRoots?.add(relativePath ? `${relativePath}/${dirName}` : dirName)
	}

	// Symlink all files
	for (const fileName of plan.files) {
		const sourcePath = join(sourceRoot, fileName)
		const targetPath = join(targetRoot, fileName)
		await symlink(sourcePath, targetPath)
		symlinkRoots?.add(relativePath ? `${relativePath}/${fileName}` : fileName)
	}

	// Handle partial directories - create real directory and recurse
	for (const [dirName, nestedPlan] of plan.partialDirs) {
		const sourcePath = join(sourceRoot, dirName)
		const targetPath = join(targetRoot, dirName)

		// Create real directory (not symlink)
		await mkdir(targetPath, { recursive: true })

		// Recursively execute nested plan
		const nestedRelativePath = relativePath ? `${relativePath}/${dirName}` : dirName
		await executeSymlinkPlan(nestedPlan, sourcePath, targetPath, nestedRelativePath, symlinkRoots)
	}
}

// ============================================================================
// Git Ignore Utilities
// ============================================================================

/**
 * Normalize path separators for cross-platform gitignore matching.
 */
export function normalizePath(p: string): string {
	return p.replace(/\\/g, "/").replace(/\/$/, "")
}

/**
 * Get the actual .git directory, handling worktrees where .git is a file.
 * Returns null if not a git repo.
 */
export function getGitDir(projectDir: string): string | null {
	const gitPath = join(projectDir, ".git")
	try {
		const stats = statSync(gitPath)
		if (stats.isDirectory()) return gitPath
		if (stats.isFile()) {
			// Worktree: .git is a file containing "gitdir: <path>"
			const content = readFileSync(gitPath, "utf-8").trim()
			const match = content.match(/^gitdir:\s*(.+)$/)
			if (match?.[1]) {
				const gitdir = match[1]
				return isAbsolute(gitdir) ? gitdir : join(projectDir, gitdir)
			}
		}
	} catch {
		// .git doesn't exist or can't be read
	}
	return null
}

/**
 * Get global gitignore path from git config.
 * Falls back to XDG location if not configured.
 */
export function getGlobalGitignore(): string | null {
	const gitconfigPath = join(homedir(), ".gitconfig")
	try {
		const content = readFileSync(gitconfigPath, "utf-8")
		const match = content.match(/excludesfile\s*=\s*(.+)/i)
		if (match?.[1]) {
			const p = match[1].trim().replace(/^~/, homedir())
			if (existsSync(p)) return p
		}
	} catch {
		// .gitconfig doesn't exist or can't be read
	}
	const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
	const xdgIgnore = join(xdgConfig, "git", "ignore")
	return existsSync(xdgIgnore) ? xdgIgnore : null
}

/**
 * Add gitignore rules scoped to a subdirectory.
 * Rewrites patterns to be root-relative.
 */
export function addScopedRules(ig: Ignore, content: string, subdir: string): void {
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith("#")) continue

		let pattern = trimmed
		let isNegation = false

		if (pattern.startsWith("!")) {
			isNegation = true
			pattern = pattern.slice(1)
		}
		if (pattern.startsWith("/")) {
			pattern = pattern.slice(1) // Rooted pattern
		}

		const scoped = subdir ? posix.join(subdir, pattern) : pattern
		ig.add(isNegation ? `!${scoped}` : scoped)
	}
}

/**
 * Load complete git ignore stack for a project.
 * Returns null if not a git repo (.git not found at root).
 */
export async function loadGitIgnoreStack(projectDir: string): Promise<Ignore | null> {
	const gitDir = getGitDir(projectDir)
	if (!gitDir) return null // Not a git repo

	const ig = ignore()

	// 1. Global gitignore
	const globalPath = getGlobalGitignore()
	if (globalPath) {
		try {
			addScopedRules(ig, readFileSync(globalPath, "utf-8"), "")
		} catch {
			// Global gitignore unreadable - continue without it
		}
	}

	// 2. .git/info/exclude
	const excludePath = join(gitDir, "info", "exclude")
	try {
		if (existsSync(excludePath)) {
			addScopedRules(ig, readFileSync(excludePath, "utf-8"), "")
		}
	} catch {
		// Exclude file unreadable - continue without it
	}

	// 3. Root .gitignore
	const rootGitignore = join(projectDir, ".gitignore")
	try {
		if (existsSync(rootGitignore)) {
			addScopedRules(ig, readFileSync(rootGitignore, "utf-8"), "")
		}
	} catch {
		// Root .gitignore unreadable - continue without it
	}

	return ig
}
