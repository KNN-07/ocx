/**
 * Registry Command
 * 
 * Manage configured registries.
 */

import { Command } from "commander"
import kleur from "kleur"
import { readOcxConfig, writeOcxConfig, type OcxConfig } from "../schemas/config.js"
import { logger, handleError, outputJson } from "../utils/index.js"

interface RegistryOptions {
  cwd: string
  json: boolean
  quiet: boolean
}

export function registerRegistryCommand(program: Command): void {
  const registry = program
    .command("registry")
    .description("Manage registries")

  // registry add
  registry
    .command("add")
    .description("Add a registry")
    .argument("<url>", "Registry URL")
    .option("--name <name>", "Registry alias (defaults to hostname)")
    .option("--version <version>", "Pin to specific version")
    .option("--cwd <path>", "Working directory", process.cwd())
    .option("--json", "Output as JSON", false)
    .option("-q, --quiet", "Suppress output", false)
    .action(async (url: string, options: RegistryOptions & { name?: string; version?: string }) => {
      try {
        let config = await readOcxConfig(options.cwd)
        if (!config) {
          logger.error("No ocx.jsonc found. Run 'ocx init' first.")
          process.exit(1)
        }

        if (config.lockRegistries) {
          logger.error("Registries are locked. Cannot add.")
          process.exit(1)
        }

        // Derive name from URL if not provided
        const name = options.name || new URL(url).hostname.replace(/\./g, "-")

        if (config.registries[name]) {
          logger.warn(`Registry '${name}' already exists. Use a different name.`)
          return
        }

        config.registries[name] = {
          url,
          version: options.version,
        }

        await writeOcxConfig(options.cwd, config)

        if (options.json) {
          outputJson({ success: true, data: { name, url } })
        } else {
          logger.success(`Added registry: ${name} -> ${url}`)
        }
      } catch (error) {
        handleError(error)
      }
    })

  // registry remove
  registry
    .command("remove")
    .description("Remove a registry")
    .argument("<name>", "Registry name")
    .option("--cwd <path>", "Working directory", process.cwd())
    .option("--json", "Output as JSON", false)
    .option("-q, --quiet", "Suppress output", false)
    .action(async (name: string, options: RegistryOptions) => {
      try {
        let config = await readOcxConfig(options.cwd)
        if (!config) {
          logger.error("No ocx.jsonc found. Run 'ocx init' first.")
          process.exit(1)
        }

        if (config.lockRegistries) {
          logger.error("Registries are locked. Cannot remove.")
          process.exit(1)
        }

        if (!config.registries[name]) {
          logger.warn(`Registry '${name}' not found.`)
          return
        }

        delete config.registries[name]
        await writeOcxConfig(options.cwd, config)

        if (options.json) {
          outputJson({ success: true, data: { removed: name } })
        } else {
          logger.success(`Removed registry: ${name}`)
        }
      } catch (error) {
        handleError(error)
      }
    })

  // registry list
  registry
    .command("list")
    .description("List configured registries")
    .option("--cwd <path>", "Working directory", process.cwd())
    .option("--json", "Output as JSON", false)
    .option("-q, --quiet", "Suppress output", false)
    .action(async (options: RegistryOptions) => {
      try {
        const config = await readOcxConfig(options.cwd)
        if (!config) {
          logger.warn("No ocx.jsonc found. Run 'ocx init' first.")
          return
        }

        const registries = Object.entries(config.registries).map(([name, cfg]) => ({
          name,
          url: cfg.url,
          version: cfg.version || "latest",
        }))

        if (options.json) {
          outputJson({ 
            success: true, 
            data: { 
              registries,
              locked: config.lockRegistries,
            } 
          })
        } else {
          if (registries.length === 0) {
            logger.info("No registries configured.")
          } else {
            logger.info(`Configured registries${config.lockRegistries ? kleur.yellow(" (locked)") : ""}:`)
            for (const reg of registries) {
              console.log(`  ${kleur.cyan(reg.name)}: ${reg.url} ${kleur.dim(`(${reg.version})`)}`)
            }
          }
        }
      } catch (error) {
        handleError(error)
      }
    })
}
