/**
 * Ghost Profile Remove Command
 *
 * Delete a ghost profile.
 * Uses Cargo-style CLI pattern: no interactive confirmation.
 */

import type { Command } from "commander"
import { ProfileManager } from "../../../profile/manager.js"
import { ProfileNotFoundError } from "../../../utils/errors.js"
import { handleError, logger } from "../../../utils/index.js"

interface ProfileRemoveOptions {
	force?: boolean
}

export function registerProfileRemoveCommand(parent: Command): void {
	parent
		.command("remove <name>")
		.alias("rm")
		.description("Delete a ghost profile")
		.option("-f, --force", "Allow deleting current profile")
		.action(async (name: string, options: ProfileRemoveOptions) => {
			try {
				await runProfileRemove(name, options)
			} catch (error) {
				handleError(error)
			}
		})
}

async function runProfileRemove(name: string, options: ProfileRemoveOptions): Promise<void> {
	const manager = ProfileManager.create()

	// Verify profile exists first (fail fast)
	if (!(await manager.exists(name))) {
		throw new ProfileNotFoundError(name)
	}

	await manager.remove(name, options.force ?? false)
	logger.success(`Deleted profile "${name}"`)
}
