/**
 * OCX CLI - add command
 * Install components from registries
 */

import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { Command } from "commander"
import { ocxConfigSchema, ocxLockSchema, type OcxLock } from "../schemas/config.js"
import type { ComponentManifest } from "../schemas/registry.js"
import { fetchRegistryIndex, fetchFileContent } from "../registry/fetcher.js"
import { resolveDependencies, type ResolvedDependencies, type ResolvedComponent } from "../registry/resolver.js"
import { updateOpencodeConfig } from "../registry/opencode-config.js"
import { logger, createSpinner, handleError } from "../utils/index.js"
import { ConfigError } from "../utils/errors.js"

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
	const configPath = join(cwd, "ocx.jsonc")
	const lockPath = join(cwd, "ocx.lock")

	// Load config
	if (!existsSync(configPath)) {
		throw new ConfigError("No ocx.jsonc found. Run 'ocx init' first.")
	}

	const configContent = await readFile(configPath, "utf-8")
	const config = ocxConfigSchema.parse(JSON.parse(configContent))

	// Load or create lock
	let lock: OcxLock = { lockVersion: 1, installed: {} }
	if (existsSync(lockPath)) {
		const lockContent = await readFile(lockPath, "utf-8")
		lock = ocxLockSchema.parse(JSON.parse(lockContent))
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
			await installComponent(component, component.baseUrl, cwd)
			
			// Fetch registry index to get version for lockfile
			const index = await fetchRegistryIndex(component.baseUrl)

			// Update lock
			lock.installed[component.name] = {
				registry: component.registryName,
				version: index.version,
				hash: await hashContent(JSON.stringify(component)),
				target: getTargetPath(component),
				installedAt: new Date().toISOString(),
			}
		}

		installSpin?.succeed(`Installed ${resolved.components.length} components`)

		// Apply opencode.json changes
		if (Object.keys(resolved.mcpServers).length > 0) {
			const result = await updateOpencodeConfig(cwd, {
				mcpServers: resolved.mcpServers,
			})
			
			if (result.mcpSkipped.length > 0 && !options.quiet) {
				for (const name of result.mcpSkipped) {
					logger.warn(`MCP server "${name}" already configured, skipped`)
				}
			}
			
			if (!options.quiet && result.mcpAdded.length > 0) {
				logger.info(`Configured ${result.mcpAdded.length} MCP servers`)
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
	component: ComponentManifest,
	baseUrl: string,
	cwd: string,
): Promise<void> {
	for (const file of component.files) {
		const targetPath = join(cwd, file.target)
		const targetDir = dirname(targetPath)

		// Create directory if needed
		if (!existsSync(targetDir)) {
			await mkdir(targetDir, { recursive: true })
		}

		// Fetch actual file content
		const content = await fetchFileContent(baseUrl, component.name, file.path)
		await writeFile(targetPath, content, "utf-8")
	}
}

function getTargetPath(component: ComponentManifest): string {
	return component.files[0]?.target ?? `.opencode/${component.type}/${component.name}`
}

async function hashContent(content: string): Promise<string> {
	const encoder = new TextEncoder()
	const data = encoder.encode(content)
	const hashBuffer = await crypto.subtle.digest("SHA-256", data)
	const hashArray = Array.from(new Uint8Array(hashBuffer))
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
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
}
