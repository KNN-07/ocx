/**
 * OCX CLI - add command
 * Install components from registries
 */

import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { parseNi, run } from "@antfu/ni"
import type { Command } from "commander"
import { fetchFileContent, fetchRegistryIndex } from "../registry/fetcher.js"
import type { ResolvedComponent } from "../registry/resolver.js"
import { type ResolvedDependencies, resolveDependencies } from "../registry/resolver.js"
import { type OcxLock, readOcxConfig, readOcxLock } from "../schemas/config.js"
import type { ComponentFileObject } from "../schemas/registry.js"
import { updateOpencodeConfig } from "../updaters/update-opencode-config.js"
import { ConfigError, IntegrityError } from "../utils/errors.js"
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

			// Verify integrity if already in lock
			const existingEntry = lock.installed[component.name]
			if (existingEntry && existingEntry.hash !== computedHash) {
				throw new IntegrityError(component.name, existingEntry.hash, computedHash)
			}

			// Install components
			await installComponent(component, files, cwd)

			// Fetch registry index to get version for lockfile
			const index = await fetchRegistryIndex(component.baseUrl)

			// Update lock
			lock.installed[component.name] = {
				registry: component.registryName,
				version: index.version,
				hash: computedHash,
				target: getTargetPath(component),
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

		// Install npm dependencies
		const hasNpmDeps = resolved.npmDependencies.length > 0
		const hasNpmDevDeps = resolved.npmDevDependencies.length > 0

		if (hasNpmDeps || hasNpmDevDeps) {
			const npmSpin = options.quiet
				? null
				: createSpinner({ text: "Installing npm dependencies..." })
			npmSpin?.start()

			try {
				await installNpmDependencies(
					resolved.npmDependencies,
					resolved.npmDevDependencies,
					cwd,
					options,
				)
				const totalDeps = resolved.npmDependencies.length + resolved.npmDevDependencies.length
				npmSpin?.succeed(`Installed ${totalDeps} npm dependencies`)
			} catch (error) {
				npmSpin?.fail("Failed to install npm dependencies")
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

function getTargetPath(component: ResolvedComponent): string {
	// Strip 'ocx:' prefix from type for fallback path (e.g., 'ocx:agent' -> 'agent')
	const typeDir = component.type.replace(/^ocx:/, "")
	return component.files[0]?.target ?? `.opencode/${typeDir}/${component.name}`
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

async function installNpmDependencies(
	dependencies: string[],
	devDependencies: string[],
	cwd: string,
	options: AddOptions,
): Promise<void> {
	// Install regular dependencies
	if (dependencies.length > 0) {
		if (options.verbose) {
			logger.info(`Installing: ${dependencies.join(", ")}`)
		}
		await run(parseNi, dependencies, { cwd })
	}

	// Install dev dependencies
	if (devDependencies.length > 0) {
		if (options.verbose) {
			logger.info(`Installing dev: ${devDependencies.join(", ")}`)
		}
		await run(parseNi, [...devDependencies, "-D"], { cwd })
	}
}
