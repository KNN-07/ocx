/**
 * Add command - Add packages from the registry
 * Downloads to .agentcn/ and creates symlinks to runtime dir
 */

import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { RegistryItem, Runtime } from "@agentcn/shared"
import { AGENTCN_DIR, RUNTIME_DIRS } from "@agentcn/shared"
import chalk from "chalk"
import ora from "ora"
import prompts from "prompts"
import { getProjectRoot, isInitialized, readConfig } from "../utils/config"
import { updateOpencodeConfig, writePackageFiles } from "../utils/files"
import { resolveDependencies } from "../utils/registry"

interface AddOptions {
	yes?: boolean
	overwrite?: boolean
	registry?: string
}

export async function add(packages: string[], options: AddOptions): Promise<void> {
	const spinner = ora()

	// Check if initialized
	if (!isInitialized()) {
		console.log(chalk.yellow("AgentCN is not initialized in this project."))
		console.log(chalk.dim("Run: npx agentcn init"))
		return
	}

	if (packages.length === 0) {
		console.log(chalk.yellow("No packages specified."))
		console.log(chalk.dim("Usage: npx agentcn add <package-name>"))
		return
	}

	// Read config to get runtime
	const config = await readConfig()
	if (!config) {
		console.log(chalk.red("Could not read AgentCN config."))
		return
	}

	const runtime: Runtime = config.runtime ?? "opencode"
	const runtimeDir = RUNTIME_DIRS[runtime]

	console.log(chalk.bold("\n📦 Adding packages\n"))
	console.log(chalk.dim(`Runtime: ${runtime} (${runtimeDir})`))
	console.log()

	// Resolve all packages and their dependencies
	spinner.start("Resolving dependencies...")
	const allPackages: RegistryItem[] = []
	const resolved = new Set<string>()

	try {
		for (const pkgName of packages) {
			const deps = await resolveDependencies(pkgName, options.registry, resolved)
			allPackages.push(...deps)
		}
		spinner.succeed(`Resolved ${allPackages.length} package(s)`)
	} catch (error) {
		spinner.fail(chalk.red("Failed to resolve packages"))
		console.error(error instanceof Error ? error.message : error)
		process.exit(1)
	}

	// Show what will be installed
	console.log("\nPackages to install:")
	for (const pkg of allPackages) {
		console.log(chalk.dim("  •") + ` ${pkg.name} (${pkg.files.length} files)`)
	}
	console.log()

	// Confirm installation
	if (!options.yes) {
		const response = await prompts({
			type: "confirm",
			name: "proceed",
			message: "Proceed with installation?",
			initial: true,
		})

		if (!response.proceed) {
			console.log(chalk.dim("Installation cancelled."))
			return
		}
	}

	const projectRoot = getProjectRoot()

	// Ensure .agentcn/ directory exists
	const agentcnPath = join(projectRoot, AGENTCN_DIR)
	if (!existsSync(agentcnPath)) {
		await mkdir(agentcnPath, { recursive: true })
	}

	// Ensure runtime @agentcn directories exist
	const runtimeAgentcnDirs = [
		join(projectRoot, runtimeDir, "agent", "@agentcn"),
		join(projectRoot, runtimeDir, "plugin", "@agentcn"),
		join(projectRoot, runtimeDir, "skill", "@agentcn"),
		join(projectRoot, runtimeDir, "command", "@agentcn"),
	]
	for (const dir of runtimeAgentcnDirs) {
		if (!existsSync(dir)) {
			await mkdir(dir, { recursive: true })
		}
	}

	// Write files for each package
	let hasPlugin = false
	let pluginPath = ""

	for (const pkg of allPackages) {
		spinner.start(`Installing ${pkg.name}...`)

		try {
			const result = await writePackageFiles(pkg, runtime, { overwrite: options.overwrite })

			// Report written files
			if (result.written.length > 0) {
				spinner.succeed(chalk.green(`Installed ${pkg.name} to ${AGENTCN_DIR}/${pkg.name}/`))
				for (const file of result.written) {
					console.log(chalk.dim(`  ✓ ${file}`))
				}
			}

			// Report symlinks
			if (result.symlinked.length > 0) {
				console.log(chalk.cyan(`  Symlinked to ${runtimeDir}/:`))
				for (const link of result.symlinked) {
					console.log(chalk.dim(`  → ${link}`))
				}
			}

			// Report skipped
			if (result.skipped.length > 0) {
				for (const file of result.skipped) {
					console.log(chalk.yellow(`  ⊘ ${file}`))
				}
			}

			// Report errors
			if (result.errors.length > 0) {
				for (const error of result.errors) {
					console.log(chalk.red(`  ✗ ${error}`))
				}
			}

			// Check if package includes a plugin
			const pluginFile = pkg.files.find((f) => f.type === "plugin")
			if (pluginFile) {
				hasPlugin = true
				// Plugin path points to the symlinked location in runtime dir
				pluginPath = `${runtimeDir}/plugin/@agentcn/${pluginFile.path.split("/").pop()}`
			}
		} catch (error) {
			spinner.fail(chalk.red(`Failed to install ${pkg.name}`))
			console.error(error instanceof Error ? error.message : error)
		}
	}

	// Update opencode.jsonc if plugin was installed and runtime is opencode
	if (hasPlugin && runtime === "opencode") {
		spinner.start("Updating opencode.jsonc...")
		try {
			const updated = await updateOpencodeConfig(pluginPath)
			if (updated) {
				spinner.succeed(chalk.green("Updated opencode.jsonc"))
			} else {
				spinner.info("Plugin already registered in opencode.jsonc")
			}
		} catch {
			spinner.warn("Could not update opencode.jsonc automatically")
			console.log(chalk.dim(`  Add manually: "plugin": ["${pluginPath}"]`))
		}
	}

	// Collect npm dependencies
	const npmDeps = new Set<string>()
	for (const pkg of allPackages) {
		if (pkg.dependencies) {
			for (const dep of pkg.dependencies) {
				npmDeps.add(dep)
			}
		}
	}

	if (npmDeps.size > 0) {
		console.log("\n" + chalk.bold("Install npm dependencies:"))
		console.log(chalk.cyan(`  bun add ${Array.from(npmDeps).join(" ")}`))
	}

	console.log("\n" + chalk.green("✓ Installation complete!"))
	console.log()
	console.log(chalk.dim("Files written to:") + ` ${AGENTCN_DIR}/<package>/`)
	console.log(chalk.dim("Symlinked to:") + ` ${runtimeDir}/@agentcn/`)
}
