/**
 * Build Command (for Registry Authors)
 *
 * Validate and build a registry from source.
 */

import { mkdir } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import type { Command } from "commander"
import kleur from "kleur"
import { registrySchema } from "../schemas/registry.js"
import { createSpinner, handleError, logger, outputJson } from "../utils/index.js"

interface BuildOptions {
	cwd: string
	out: string
	json: boolean
	quiet: boolean
}

export function registerBuildCommand(program: Command): void {
	program
		.command("build")
		.description("Build a registry from source (for registry authors)")
		.argument("[path]", "Registry source directory", ".")
		.option("--out <dir>", "Output directory", "./dist")
		.option("--cwd <path>", "Working directory", process.cwd())
		.option("--json", "Output as JSON", false)
		.option("-q, --quiet", "Suppress output", false)
		.action(async (path: string, options: BuildOptions) => {
			try {
				const sourcePath = join(options.cwd, path)
				const outPath = join(options.cwd, options.out)

				const spinner = createSpinner({
					text: "Building registry...",
					quiet: options.quiet || options.json,
				})
				if (!options.json) spinner.start()

				// Read registry.json from source
				const registryFile = Bun.file(join(sourcePath, "registry.json"))
				if (!(await registryFile.exists())) {
					if (!options.json) spinner.fail("No registry.json found in source directory")
					process.exit(1)
				}

				const registryData = await registryFile.json()

				// Validate registry schema
				const parseResult = registrySchema.safeParse(registryData)
				if (!parseResult.success) {
					if (!options.json) {
						spinner.fail("Registry validation failed")
						const errors = parseResult.error.errors.map(
							(e) => `  ${e.path.join(".")}: ${e.message}`,
						)
						for (const err of errors) {
							console.log(kleur.red(err))
						}
					}
					process.exit(1)
				}

				const registry = parseResult.data
				const validationErrors: string[] = []

				// Create output directory structure
				const componentsDir = join(outPath, "components")
				await mkdir(componentsDir, { recursive: true })

				// Generate packument and copy files for each component
				for (const component of registry.components) {
					const packument = {
						name: component.name,
						versions: {
							[registry.version]: component,
						},
						"dist-tags": {
							latest: registry.version,
						},
					}

					// Write manifest to components/[name].json
					const packumentPath = join(componentsDir, `${component.name}.json`)
					await Bun.write(packumentPath, JSON.stringify(packument, null, 2))

					// Copy files to components/[name]/[path]
					for (const file of component.files) {
						const sourceFilePath = join(sourcePath, "files", file.path)
						const destFilePath = join(componentsDir, component.name, file.path)
						const destFileDir = dirname(destFilePath)

						if (!(await Bun.file(sourceFilePath).exists())) {
							validationErrors.push(`${component.name}: Source file not found at ${sourceFilePath}`)
							continue
						}

						await mkdir(destFileDir, { recursive: true })
						const sourceFile = Bun.file(sourceFilePath)
						await Bun.write(destFilePath, sourceFile)
					}
				}

				// Fail fast if source files were missing during copy
				if (validationErrors.length > 0) {
					if (!options.json) {
						spinner.fail(`Build failed with ${validationErrors.length} errors`)
						for (const err of validationErrors) {
							console.log(kleur.red(`  ${err}`))
						}
					}
					process.exit(1)
				}

				// Generate index.json at the root
				const index = {
					name: registry.name,
					prefix: registry.prefix,
					version: registry.version,
					author: registry.author,
					components: registry.components.map((c) => ({
						name: c.name,
						type: c.type,
						description: c.description,
					})),
				}

				await Bun.write(join(outPath, "index.json"), JSON.stringify(index, null, 2))

				if (!options.json) {
					const msg = `Built ${registry.components.length} components to ${relative(options.cwd, outPath)}`
					spinner.succeed(msg)
					if (process.env.NODE_ENV === "test" || !process.stdout.isTTY) {
						logger.success(`Built ${registry.components.length} components`)
					}
				}

				if (options.json) {
					outputJson({
						success: true,
						data: {
							name: registry.name,
							version: registry.version,
							components: registry.components.length,
							output: outPath,
						},
					})
				}
			} catch (error) {
				handleError(error, { json: options.json })
			}
		})
}
