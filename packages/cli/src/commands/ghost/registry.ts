/**
 * Ghost Registry Commands
 *
 * Manage registries in the ghost configuration.
 * Thin wrapper around core registry functions using profile-based config.
 */

import type { Command } from "commander"
import kleur from "kleur"
import { atomicWrite } from "../../profile/atomic.js"
import { ProfileManager } from "../../profile/manager.js"
import { getProfileGhostConfig } from "../../profile/paths.js"
import { ProfilesNotInitializedError } from "../../utils/errors.js"
import { handleError, logger, outputJson } from "../../utils/index.js"
import { addOutputOptions } from "../../utils/shared-options.js"
import {
	type RegistryAddOptions,
	type RegistryOptions,
	runRegistryAddCore,
	runRegistryListCore,
	runRegistryRemoveCore,
} from "../registry.js"

/**
 * Ensure ghost profiles are initialized before proceeding.
 * Returns the ProfileManager instance for chaining.
 */
async function ensureProfilesInitialized(): Promise<ProfileManager> {
	const manager = ProfileManager.create()
	if (!(await manager.isInitialized())) {
		throw new ProfilesNotInitializedError()
	}
	return manager
}

export function registerGhostRegistryCommand(parent: Command): void {
	const registry = parent.command("registry").description("Manage ghost mode registries")

	// ghost registry add <url> [--name <name>]
	const addCmd = registry
		.command("add")
		.description("Add a registry to ghost config")
		.argument("<url>", "Registry URL")
		.option("--name <name>", "Registry alias (defaults to hostname)")

	addOutputOptions(addCmd)

	addCmd.action(async (url: string, options: RegistryAddOptions) => {
		try {
			const manager = await ensureProfilesInitialized()
			const profileName = await manager.getCurrent()
			const profile = await manager.get(profileName)

			const result = await runRegistryAddCore(url, options, {
				getRegistries: () => profile.ghost.registries,
				setRegistry: async (name, regConfig) => {
					profile.ghost.registries[name] = regConfig
					await atomicWrite(getProfileGhostConfig(profileName), profile.ghost)
				},
			})

			if (options.json) {
				outputJson({ success: true, data: result })
			} else if (!options.quiet) {
				if (result.updated) {
					logger.success(`Updated registry: ${result.name} -> ${result.url}`)
				} else {
					logger.success(`Added registry: ${result.name} -> ${result.url}`)
				}
			}
		} catch (error) {
			handleError(error, { json: options.json })
		}
	})

	// ghost registry remove <name>
	const removeCmd = registry
		.command("remove")
		.description("Remove a registry from ghost config")
		.argument("<name>", "Registry name to remove")

	addOutputOptions(removeCmd)

	removeCmd.action(async (name: string, options: RegistryOptions) => {
		try {
			const manager = await ensureProfilesInitialized()
			const profileName = await manager.getCurrent()
			const profile = await manager.get(profileName)

			const result = await runRegistryRemoveCore(name, {
				getRegistries: () => profile.ghost.registries,
				removeRegistry: async (regName) => {
					delete profile.ghost.registries[regName]
					await atomicWrite(getProfileGhostConfig(profileName), profile.ghost)
				},
			})

			if (options.json) {
				outputJson({ success: true, data: result })
			} else if (!options.quiet) {
				logger.success(`Removed registry: ${result.removed}`)
			}
		} catch (error) {
			handleError(error, { json: options.json })
		}
	})

	// ghost registry list
	const listCmd = registry.command("list").description("List configured registries")

	addOutputOptions(listCmd)

	listCmd.action(async (options: RegistryOptions) => {
		try {
			const manager = await ensureProfilesInitialized()
			const profileName = await manager.getCurrent()
			const profile = await manager.get(profileName)

			const result = runRegistryListCore({
				getRegistries: () => profile.ghost.registries,
			})

			if (options.json) {
				outputJson({ success: true, data: result })
			} else if (!options.quiet) {
				if (result.registries.length === 0) {
					logger.info("No registries configured.")
					logger.info("Add one with: ocx ghost registry add <url>")
				} else {
					logger.info("Ghost mode registries:")
					for (const reg of result.registries) {
						console.log(`  ${kleur.cyan(reg.name)}: ${reg.url} ${kleur.dim(`(${reg.version})`)}`)
					}
				}
			}
		} catch (error) {
			handleError(error, { json: options.json })
		}
	})
}
