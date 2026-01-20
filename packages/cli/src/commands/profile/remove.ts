/**
 * Profile Remove Command
 *
 * Delete a global profile.
 * Uses Cargo-style CLI pattern: no interactive confirmation.
 */

import type { Command } from "commander"
import { ProfileManager } from "../../profile/manager.js"
import { ConfigError, ProfileNotFoundError } from "../../utils/errors.js"
import { handleError, logger } from "../../utils/index.js"

export function registerProfileRemoveCommand(parent: Command): void {
	parent
		.command("remove <name>")
		.alias("rm")
		.description("Delete a global profile")
		.action(async (name: string) => {
			try {
				await runProfileRemove(name)
			} catch (error) {
				handleError(error)
			}
		})
}

async function runProfileRemove(name: string): Promise<void> {
	const manager = ProfileManager.create()

	// Guard: Ensure OCX is initialized
	if (!(await manager.isInitialized())) {
		throw new ConfigError("OCX not initialized. Run 'ocx init --global' first.")
	}

	// Verify profile exists first (fail fast)
	if (!(await manager.exists(name))) {
		throw new ProfileNotFoundError(name)
	}

	await manager.remove(name)
	logger.success(`Deleted profile "${name}"`)
}
