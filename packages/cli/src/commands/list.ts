/**
 * List command - List installed packages or browse registry
 */

import chalk from "chalk"
import ora from "ora"
import { readManifest } from "../utils/config"
import { fetchIndex } from "../utils/registry"

interface ListOptions {
	all?: boolean
}

export async function list(options: ListOptions): Promise<void> {
	const spinner = ora()

	if (options.all) {
		// Show all packages from registry
		spinner.start("Fetching registry...")

		try {
			const index = await fetchIndex()
			spinner.stop()

			console.log(chalk.bold("\n📦 Available packages\n"))

			if (index.packages.length === 0) {
				console.log(chalk.dim("No packages in registry."))
				return
			}

			// Group by type
			const byType = new Map<string, typeof index.packages>()
			for (const pkg of index.packages) {
				const type = pkg.type.replace("registry:", "")
				if (!byType.has(type)) {
					byType.set(type, [])
				}
				byType.get(type)!.push(pkg)
			}

			for (const [type, pkgs] of byType) {
				console.log(chalk.bold.underline(`${type}s:`))
				for (const pkg of pkgs) {
					console.log(`  ${chalk.cyan(pkg.name)}`)
					if (pkg.description) {
						console.log(chalk.dim(`    ${pkg.description}`))
					}
				}
				console.log()
			}
		} catch (error) {
			spinner.fail(chalk.red("Failed to fetch registry"))
			console.error(error instanceof Error ? error.message : error)
		}
	} else {
		// Show installed packages
		const manifest = await readManifest()

		console.log(chalk.bold("\n📦 Installed packages\n"))

		if (!manifest || Object.keys(manifest.packages).length === 0) {
			console.log(chalk.dim("No packages installed."))
			console.log(chalk.dim("\nRun: npx agentcn add <package-name>"))
			return
		}

		for (const [name, pkg] of Object.entries(manifest.packages)) {
			console.log(`  ${chalk.cyan(name)} ${chalk.dim(`v${pkg.version}`)}`)
			console.log(chalk.dim(`    Installed: ${new Date(pkg.installedAt).toLocaleDateString()}`))
			console.log(chalk.dim(`    Files: ${Object.keys(pkg.files).length}`))
		}

		console.log()
	}
}
