/**
 * Ghost Profile Add Command
 *
 * Create a new ghost profile.
 * Optionally clone settings from an existing profile.
 */

import type { Command } from "commander"
import { atomicWrite } from "../../../profile/atomic.js"
import { ProfileManager } from "../../../profile/manager.js"
import { getProfileGhostConfig } from "../../../profile/paths.js"
import { handleError, logger } from "../../../utils/index.js"

interface ProfileAddOptions {
	from?: string
}

export function registerProfileAddCommand(parent: Command): void {
	parent
		.command("add <name>")
		.description("Create a new ghost profile")
		.option("--from <profile>", "Clone settings from existing profile")
		.action(async (name: string, options: ProfileAddOptions) => {
			try {
				await runProfileAdd(name, options)
			} catch (error) {
				handleError(error)
			}
		})
}

async function runProfileAdd(name: string, options: ProfileAddOptions): Promise<void> {
	const manager = ProfileManager.create()

	if (options.from) {
		// Clone from existing profile
		const source = await manager.get(options.from)
		await manager.add(name)

		// Copy ghost config from source
		await atomicWrite(getProfileGhostConfig(name), source.ghost)

		logger.success(`Created profile "${name}" (cloned from "${options.from}")`)
	} else {
		await manager.add(name)
		logger.success(`Created profile "${name}"`)
	}
}
