/**
 * Diff command - Show differences between local and registry versions
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { AGENTCN_DIR } from "@agentcn/shared"
import chalk from "chalk"
import ora from "ora"
import { getProjectRoot, readManifest } from "../utils/config"
import { hashContent } from "../utils/files"
import { fetchPackage } from "../utils/registry"

export async function diff(packages: string[]): Promise<void> {
	const spinner = ora()

	// Read manifest
	const manifest = await readManifest()
	if (!manifest || Object.keys(manifest.packages).length === 0) {
		console.log(chalk.yellow("No packages installed."))
		return
	}

	// If no packages specified, diff all
	const pkgNames = packages.length > 0 ? packages : Object.keys(manifest.packages)

	console.log(chalk.bold("\n📋 Checking for differences\n"))

	for (const pkgName of pkgNames) {
		const installedPkg = manifest.packages[pkgName]
		if (!installedPkg) {
			console.log(chalk.yellow(`Package not installed: ${pkgName}`))
			continue
		}

		spinner.start(`Checking ${pkgName}...`)

		try {
			// Fetch latest from registry
			const registryPkg = await fetchPackage(pkgName)
			spinner.stop()

			console.log(chalk.bold(`\n${pkgName}:`))

			// Compare each file (from .agentcn/ source, not symlinks)
			let hasChanges = false
			for (const file of registryPkg.files) {
				const sourcePath = join(AGENTCN_DIR, pkgName, file.path)
				const localPath = join(getProjectRoot(), sourcePath)
				const manifestEntry = installedPkg.files[sourcePath]

				if (!manifestEntry) {
					console.log(chalk.green(`  + ${file.path} (new file)`))
					hasChanges = true
					continue
				}

				try {
					const localContent = await readFile(localPath, "utf-8")
					const localHash = hashContent(localContent)
					const registryHash = hashContent(file.content ?? "")

					if (localHash !== registryHash) {
						const isModified = localHash !== manifestEntry.hash
						if (isModified) {
							console.log(chalk.yellow(`  ~ ${file.path} (locally modified, registry changed)`))
						} else {
							console.log(chalk.cyan(`  ↑ ${file.path} (update available)`))
						}
						hasChanges = true
					}
				} catch {
					console.log(chalk.red(`  ! ${file.path} (file missing)`))
					hasChanges = true
				}
			}

			if (!hasChanges) {
				console.log(chalk.dim("  No changes"))
			}
		} catch (error) {
			spinner.fail(chalk.red(`Failed to check ${pkgName}`))
			console.error(error instanceof Error ? error.message : error)
		}
	}

	console.log()
}
