/**
 * OCX CLI - init command
 * Initialize OCX configuration in a project
 */

import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Command } from "commander"
import { ocxConfigSchema } from "../schemas/config.js"
import { logger, createSpinner, handleError } from "../utils/index.js"

interface InitOptions {
	yes?: boolean
	cwd?: string
	quiet?: boolean
	verbose?: boolean
	json?: boolean
}

export function registerInitCommand(program: Command): void {
	program
		.command("init")
		.description("Initialize OCX configuration in your project")
		.option("-y, --yes", "Skip prompts and use defaults")
		.option("--cwd <path>", "Working directory", process.cwd())
		.option("-q, --quiet", "Suppress output")
		.option("-v, --verbose", "Verbose output")
		.option("--json", "Output as JSON")
		.action(async (options: InitOptions) => {
			try {
				await runInit(options)
			} catch (error) {
				handleError(error, { json: options.json })
			}
		})
}

async function runInit(options: InitOptions): Promise<void> {
	const cwd = options.cwd ?? process.cwd()
	const configPath = join(cwd, "ocx.jsonc")

	// Check for existing config
	if (existsSync(configPath)) {
		if (!options.yes) {
			logger.warn("ocx.jsonc already exists")
			logger.info("Use --yes to overwrite")
			return
		}
		logger.info("Overwriting existing ocx.jsonc")
	}

	const spin = options.quiet ? null : createSpinner({ text: "Initializing OCX..." })
	spin?.start()

	try {
		// Create minimal config - schema will apply defaults
		const rawConfig = {
			$schema: "https://ocx.dev/schema.json",
			registries: {},
		}

		// Validate with schema (applies defaults)
		const config = ocxConfigSchema.parse(rawConfig)

		// Write config file
		const content = JSON.stringify(config, null, 2)
		await writeFile(configPath, content, "utf-8")

		if (!options.quiet && !options.json) {
			logger.success("Initialized OCX configuration")
		}

		spin?.succeed("Initialized OCX configuration")

		if (options.json) {
			console.log(JSON.stringify({ success: true, path: configPath }))
		} else if (!options.quiet) {
			logger.info(`Created ${configPath}`)
			logger.info("")
			logger.info("Next steps:")
			logger.info("  1. Add a registry: ocx registry add <url>")
			logger.info("  2. Install components: ocx add <component>")
		}
	} catch (error) {
		spin?.fail("Failed to initialize")
		throw error
	}
}
