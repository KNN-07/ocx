/**
 * Link command - Recreate symlinks from runtime dirs to .agentcn/
 * Useful after git clone or if symlinks break
 */

import { existsSync } from "node:fs"
import type { Runtime } from "@agentcn/shared"
import { AGENTCN_DIR, RUNTIME_DIRS } from "@agentcn/shared"
import chalk from "chalk"
import ora from "ora"
import { getProjectRoot, isInitialized, readConfig, readManifest } from "../utils/config"
import { createSymlinksForPackage, getPackageDir } from "../utils/files"

interface LinkOptions {
	force?: boolean
}

export async function link(options: LinkOptions): Promise<void> {
	const spinner = ora()

	// Check if initialized
	if (!isInitialized()) {
		console.log(chalk.yellow("AgentCN is not initialized in this project."))
		console.log(chalk.dim("Run: npx agentcn init"))
		return
	}

	// Read config and manifest
	const config = await readConfig()
	const manifest = await readManifest()

	if (!config) {
		console.log(chalk.red("Could not read AgentCN config."))
		return
	}

	if (!manifest) {
		console.log(chalk.yellow("No packages installed yet."))
		console.log(chalk.dim("Run: npx agentcn add <package>"))
		return
	}

	const runtime: Runtime = config.runtime ?? "opencode"
	const runtimeDir = RUNTIME_DIRS[runtime]
	const projectRoot = getProjectRoot()

	console.log(chalk.bold("\n🔗 Recreating symlinks\n"))
	console.log(chalk.dim(`Runtime: ${runtime} (${runtimeDir})`))
	console.log()

	const installedPackages = Object.keys(manifest.packages)

	if (installedPackages.length === 0) {
		console.log(chalk.yellow("No packages installed."))
		return
	}

	let successCount = 0
	let errorCount = 0

	for (const pkgName of installedPackages) {
		spinner.start(`Linking ${pkgName}...`)

		const packageDir = getPackageDir(pkgName)

		// Check if package directory exists
		if (!existsSync(packageDir)) {
			spinner.fail(chalk.red(`Package ${pkgName} not found in ${AGENTCN_DIR}/`))
			errorCount++
			continue
		}

		try {
			const result = await createSymlinksForPackage(pkgName, runtime, {
				force: options.force,
			})

			if (result.created.length > 0) {
				spinner.succeed(chalk.green(`Linked ${pkgName}`))
				for (const link of result.created) {
					console.log(chalk.dim(`  → ${link}`))
				}
				successCount++
			} else if (result.skipped.length > 0) {
				spinner.info(`${pkgName} already linked`)
				successCount++
			}

			if (result.errors.length > 0) {
				for (const error of result.errors) {
					console.log(chalk.red(`  ✗ ${error}`))
				}
			}
		} catch (error) {
			spinner.fail(chalk.red(`Failed to link ${pkgName}`))
			console.error(error instanceof Error ? error.message : error)
			errorCount++
		}
	}

	console.log()
	if (successCount > 0) {
		console.log(chalk.green(`✓ Linked ${successCount} package(s)`))
	}
	if (errorCount > 0) {
		console.log(chalk.red(`✗ ${errorCount} package(s) failed`))
	}
}
