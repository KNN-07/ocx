/**
 * OCX CLI - add command
 * Install components from registries
 */

import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import type { Command } from "commander"
import { fetchFileContent, fetchRegistryIndex } from "../registry/fetcher.js"
import type { ResolvedComponent } from "../registry/resolver.js"
import { type ResolvedDependencies, resolveDependencies } from "../registry/resolver.js"
import { type OcxLock, readOcxConfig, readOcxLock } from "../schemas/config.js"
import type { ComponentFileObject } from "../schemas/registry.js"
import { updateOpencodeConfig } from "../updaters/update-opencode-config.js"
import { ConfigError, ConflictError, IntegrityError, ValidationError } from "../utils/errors.js"
import { createSpinner, handleError, logger } from "../utils/index.js"

interface AddOptions {
	yes?: boolean
	dryRun?: boolean
	cwd?: string
	quiet?: boolean
	verbose?: boolean
	json?: boolean
}

export function registerAddCommand(program: Command): void {
	program
		.command("add")
		.description("Add components to your project")
		.argument("<components...>", "Components to install")
		.option("-y, --yes", "Skip prompts")
		.option("--dry-run", "Show what would be installed without making changes")
		.option("--cwd <path>", "Working directory", process.cwd())
		.option("-q, --quiet", "Suppress output")
		.option("-v, --verbose", "Verbose output")
		.option("--json", "Output as JSON")
		.action(async (components: string[], options: AddOptions) => {
			try {
				await runAdd(components, options)
			} catch (error) {
				handleError(error, { json: options.json })
			}
		})
}

async function runAdd(componentNames: string[], options: AddOptions): Promise<void> {
	const cwd = options.cwd ?? process.cwd()
	const lockPath = join(cwd, "ocx.lock")

	// Load config
	const config = await readOcxConfig(cwd)
	if (!config) {
		throw new ConfigError("No ocx.jsonc found. Run 'ocx init' first.")
	}

	// Load or create lock
	let lock: OcxLock = { lockVersion: 1, installed: {} }
	const existingLock = await readOcxLock(cwd)
	if (existingLock) {
		lock = existingLock
	}

	const spin = options.quiet ? null : createSpinner({ text: "Resolving dependencies..." })
	spin?.start()

	try {
		// Resolve all dependencies across all configured registries
		const resolved = await resolveDependencies(config.registries, componentNames)

		spin?.succeed(`Resolved ${resolved.components.length} components`)

		if (options.verbose) {
			logger.info("Install order:")
			for (const name of resolved.installOrder) {
				logger.info(`  - ${name}`)
			}
		}

		if (options.dryRun) {
			logger.info("")
			logger.info("Dry run - no changes made")
			logResolved(resolved)
			return
		}

		// Install components
		const installSpin = options.quiet ? null : createSpinner({ text: "Installing components..." })
		installSpin?.start()

		for (const component of resolved.components) {
			// Fetch component files and compute bundle hash
			const files: { path: string; content: Buffer }[] = []
			for (const file of component.files) {
				const content = await fetchFileContent(component.baseUrl, component.name, file.path)
				files.push({ path: file.path, content: Buffer.from(content) })
			}

			const computedHash = await hashBundle(files)

			// Verify integrity if already in lock (use qualifiedName as key)
			const existingEntry = lock.installed[component.qualifiedName]
			if (existingEntry && existingEntry.hash !== computedHash) {
				throw new IntegrityError(component.qualifiedName, existingEntry.hash, computedHash)
			}

			// Check for file conflicts with components from other namespaces
			for (const file of component.files) {
				const targetPath = join(cwd, file.target)
				if (existsSync(targetPath)) {
					// File exists - check if it's from the same component (re-install) or different (conflict)
					const conflictingComponent = findComponentByFile(lock, file.target)
					if (conflictingComponent && conflictingComponent !== component.qualifiedName) {
						throw new ConflictError(
							`File conflict: ${file.target} already exists (installed by '${conflictingComponent}').\n\n` +
								`To resolve:\n` +
								`  1. Remove existing: rm ${file.target}\n` +
								`  2. Or rename it manually and update references\n` +
								`  3. Then run: ocx add ${component.qualifiedName}`,
						)
					}
				}
			}

			// Install component
			await installComponent(component, files, cwd)

			// Fetch registry index to get version for lockfile
			const index = await fetchRegistryIndex(component.baseUrl)

			// Update lock with qualifiedName as key (namespace/component format)
			lock.installed[component.qualifiedName] = {
				registry: component.registryName,
				version: index.version,
				hash: computedHash,
				files: component.files.map((f) => f.target),
				installedAt: new Date().toISOString(),
			}
		}

		installSpin?.succeed(`Installed ${resolved.components.length} components`)

		// Apply opencode.json changes (MCP servers, plugins, agent configs, instructions, disabled tools)
		const hasMcpChanges =
			Object.keys(resolved.mcpServers).length > 0 || resolved.agentMcpBindings.length > 0
		const hasDisabledTools = resolved.disabledTools.length > 0
		const hasPlugins = resolved.plugins.length > 0
		const hasAgentConfigs = Object.keys(resolved.agentConfigs).length > 0
		const hasInstructions = resolved.instructions.length > 0

		if (hasMcpChanges || hasDisabledTools || hasPlugins || hasAgentConfigs || hasInstructions) {
			const result = await updateOpencodeConfig(cwd, {
				mcpServers: resolved.mcpServers,
				agentMcpBindings: resolved.agentMcpBindings,
				disabledTools: resolved.disabledTools,
				plugins: resolved.plugins,
				agentConfigs: resolved.agentConfigs,
				instructions: resolved.instructions,
			})

			if (result.mcpSkipped.length > 0 && !options.quiet) {
				for (const name of result.mcpSkipped) {
					logger.warn(`MCP server "${name}" already configured, skipped`)
				}
			}

			if (!options.quiet && result.mcpAdded.length > 0) {
				logger.info(`Configured ${result.mcpAdded.length} MCP servers`)

				// Log agent-scoped bindings
				for (const binding of resolved.agentMcpBindings) {
					logger.info(`  Scoped to agent "${binding.agentName}": ${binding.serverNames.join(", ")}`)
				}
			}

			if (!options.quiet && result.toolsDisabled.length > 0) {
				logger.info(
					`Disabled ${result.toolsDisabled.length} tools: ${result.toolsDisabled.join(", ")}`,
				)
			}

			if (!options.quiet && result.pluginsAdded.length > 0) {
				logger.info(
					`Added ${result.pluginsAdded.length} plugins: ${result.pluginsAdded.join(", ")}`,
				)
			}

			if (!options.quiet && result.agentsConfigured.length > 0) {
				logger.info(
					`Configured ${result.agentsConfigured.length} agents: ${result.agentsConfigured.join(", ")}`,
				)
			}

			if (!options.quiet && result.instructionsAdded.length > 0) {
				logger.info(`Added ${result.instructionsAdded.length} instructions`)
			}
		}

		// Update .opencode/package.json with npm dependencies
		const hasNpmDeps = resolved.npmDependencies.length > 0
		const hasNpmDevDeps = resolved.npmDevDependencies.length > 0

		if (hasNpmDeps || hasNpmDevDeps) {
			const npmSpin = options.quiet
				? null
				: createSpinner({ text: "Updating .opencode/package.json..." })
			npmSpin?.start()

			try {
				await updateOpencodeDevDependencies(
					cwd,
					resolved.npmDependencies,
					resolved.npmDevDependencies,
				)
				const totalDeps = resolved.npmDependencies.length + resolved.npmDevDependencies.length
				npmSpin?.succeed(`Added ${totalDeps} dependencies to .opencode/package.json`)
			} catch (error) {
				npmSpin?.fail("Failed to update .opencode/package.json")
				throw error
			}
		}

		// Save lock file
		await writeFile(lockPath, JSON.stringify(lock, null, 2), "utf-8")

		if (options.json) {
			console.log(
				JSON.stringify(
					{
						success: true,
						installed: resolved.installOrder,
						mcpServers: Object.keys(resolved.mcpServers),
					},
					null,
					2,
				),
			)
		} else if (!options.quiet) {
			logger.info("")
			logger.success(`Done! Installed ${resolved.components.length} components.`)
		}
	} catch (error) {
		spin?.fail("Failed to resolve dependencies")
		throw error
	}
}

async function installComponent(
	component: ResolvedComponent,
	files: { path: string; content: Buffer }[],
	cwd: string,
): Promise<void> {
	for (const file of files) {
		const componentFile = component.files.find((f: ComponentFileObject) => f.path === file.path)
		if (!componentFile) continue

		const targetPath = join(cwd, componentFile.target)
		const targetDir = dirname(targetPath)

		// Create directory if needed
		if (!existsSync(targetDir)) {
			await mkdir(targetDir, { recursive: true })
		}

		await writeFile(targetPath, file.content)
	}
}

async function hashContent(content: string | Buffer): Promise<string> {
	return createHash("sha256").update(content).digest("hex")
}

async function hashBundle(files: { path: string; content: Buffer }[]): Promise<string> {
	// Sort files for deterministic hashing
	const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))

	// Create a manifest of file hashes
	const manifestParts: string[] = []
	for (const file of sorted) {
		const hash = await hashContent(file.content)
		manifestParts.push(`${file.path}:${hash}`)
	}

	// Hash the manifest itself
	return hashContent(manifestParts.join("\n"))
}

function logResolved(resolved: ResolvedDependencies): void {
	logger.info("")
	logger.info("Would install:")
	for (const component of resolved.components) {
		logger.info(`  ${component.name} (${component.type}) from ${component.registryName}`)
	}

	if (Object.keys(resolved.mcpServers).length > 0) {
		logger.info("")
		logger.info("Would configure MCP servers:")
		for (const name of Object.keys(resolved.mcpServers)) {
			logger.info(`  ${name}`)
		}
	}

	if (resolved.npmDependencies.length > 0) {
		logger.info("")
		logger.info("Would install npm dependencies:")
		for (const dep of resolved.npmDependencies) {
			logger.info(`  ${dep}`)
		}
	}

	if (resolved.npmDevDependencies.length > 0) {
		logger.info("")
		logger.info("Would install npm dev dependencies:")
		for (const dep of resolved.npmDevDependencies) {
			logger.info(`  ${dep}`)
		}
	}
}

// ============================================================================
// NPM Dependency Management
// ============================================================================

interface NpmDependency {
	name: string
	version: string
}

interface OpencodePackageJson {
	name?: string
	private?: boolean
	type?: string
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
}

const DEFAULT_PACKAGE_JSON: OpencodePackageJson = {
	name: "opencode-plugins",
	private: true,
	type: "module",
}

/**
 * Parses an npm dependency spec into name and version.
 * Handles: "lodash", "lodash@4.0.0", "@types/node", "@types/node@1.0.0"
 */
function parseNpmDependency(spec: string): NpmDependency {
	// Guard: invalid input
	if (!spec?.trim()) {
		throw new ValidationError(`Invalid npm dependency: expected non-empty string, got "${spec}"`)
	}

	const trimmed = spec.trim()
	const lastAt = trimmed.lastIndexOf("@")

	// Has version: "lodash@4.0.0" or "@types/node@1.0.0"
	if (lastAt > 0) {
		const name = trimmed.slice(0, lastAt)
		const version = trimmed.slice(lastAt + 1)
		if (!version) {
			throw new ValidationError(`Invalid npm dependency: missing version after @ in "${spec}"`)
		}
		return { name, version }
	}

	// No version: "lodash" or "@types/node" → use "*"
	return { name: trimmed, version: "*" }
}

/**
 * Merges new dependencies into existing package.json structure.
 * Pure function: same inputs always produce same output.
 */
function mergeDevDependencies(
	existing: OpencodePackageJson,
	newDeps: NpmDependency[],
): OpencodePackageJson {
	const merged: Record<string, string> = { ...existing.devDependencies }
	for (const dep of newDeps) {
		merged[dep.name] = dep.version
	}
	return { ...existing, devDependencies: merged }
}

/**
 * Reads .opencode/package.json or returns default structure if missing.
 */
async function readOpencodePackageJson(opencodeDir: string): Promise<OpencodePackageJson> {
	const pkgPath = join(opencodeDir, "package.json")

	// Guard: file doesn't exist - return default
	if (!existsSync(pkgPath)) {
		return { ...DEFAULT_PACKAGE_JSON }
	}

	// Try to parse, fail fast on invalid JSON
	try {
		const content = await Bun.file(pkgPath).text()
		return JSON.parse(content) as OpencodePackageJson
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e)
		throw new ConfigError(`Invalid .opencode/package.json: ${message}`)
	}
}

/**
 * Modifies .opencode/.gitignore to ensure package.json and bun.lock are tracked.
 * Creates the file with sensible defaults if missing.
 */
async function ensureManifestFilesAreTracked(opencodeDir: string): Promise<void> {
	const gitignorePath = join(opencodeDir, ".gitignore")
	const filesToTrack = new Set(["package.json", "bun.lock"])
	const requiredIgnores = ["node_modules"]

	// Read existing lines or start fresh
	let lines: string[] = []
	if (existsSync(gitignorePath)) {
		const content = await Bun.file(gitignorePath).text()
		lines = content
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean)
	}

	// Remove entries that should be tracked (not ignored)
	lines = lines.filter((line) => !filesToTrack.has(line))

	// Ensure required ignores are present
	for (const ignore of requiredIgnores) {
		if (!lines.includes(ignore)) {
			lines.push(ignore)
		}
	}

	await Bun.write(gitignorePath, `${lines.join("\n")}\n`)
}

/**
 * Updates .opencode/package.json with new devDependencies and ensures
 * manifest files are tracked by git.
 */
async function updateOpencodeDevDependencies(
	cwd: string,
	npmDeps: string[],
	npmDevDeps: string[],
): Promise<void> {
	// Guard: no deps to process
	const allDepSpecs = [...npmDeps, ...npmDevDeps]
	if (allDepSpecs.length === 0) return

	const opencodeDir = join(cwd, ".opencode")

	// Ensure directory exists
	await mkdir(opencodeDir, { recursive: true })

	// Parse all deps - fails fast on invalid
	const parsedDeps = allDepSpecs.map(parseNpmDependency)

	// Read → merge → write
	const existing = await readOpencodePackageJson(opencodeDir)
	const updated = mergeDevDependencies(existing, parsedDeps)
	await Bun.write(join(opencodeDir, "package.json"), `${JSON.stringify(updated, null, 2)}\n`)

	// Ensure manifest files are tracked by git
	await ensureManifestFilesAreTracked(opencodeDir)
}

/**
 * Find which component installed a given file path
 */
function findComponentByFile(lock: OcxLock, filePath: string): string | null {
	for (const [qualifiedName, entry] of Object.entries(lock.installed)) {
		if (entry.files.includes(filePath)) {
			return qualifiedName
		}
	}
	return null
}
