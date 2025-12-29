/**
 * Search command - Search the registry
 */

import chalk from "chalk"
import ora from "ora"
import { searchPackages } from "../utils/registry"

export async function search(query: string): Promise<void> {
	const spinner = ora()

	spinner.start(`Searching for "${query}"...`)

	try {
		const results = await searchPackages(query)
		spinner.stop()

		console.log(chalk.bold(`\n🔍 Search results for "${query}"\n`))

		if (results.length === 0) {
			console.log(chalk.dim("No packages found."))
			return
		}

		for (const pkg of results) {
			const type = pkg.type.replace("registry:", "")
			console.log(`  ${chalk.cyan(pkg.name)} ${chalk.dim(`[${type}]`)}`)
			if (pkg.description) {
				console.log(chalk.dim(`    ${pkg.description}`))
			}
		}

		console.log()
		console.log(chalk.dim("Install with: npx agentcn add <package-name>"))
		console.log()
	} catch (error) {
		spinner.fail(chalk.red("Search failed"))
		console.error(error instanceof Error ? error.message : error)
	}
}
