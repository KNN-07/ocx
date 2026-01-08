/**
 * Ghost Profile Use Command
 *
 * Set the current ghost profile.
 * This updates the symlink at ~/.config/opencode/profiles/current.
 */

import type { Command } from "commander"
import { ProfileManager } from "../../../profile/manager.js"
import { handleError, logger } from "../../../utils/index.js"

export function registerProfileUseCommand(parent: Command): void {
	parent
		.command("use <name>")
		.description("Set the current ghost profile")
		.action(async (name: string) => {
			try {
				await runProfileUse(name)
			} catch (error) {
				handleError(error)
			}
		})
}

async function runProfileUse(name: string): Promise<void> {
	const manager = ProfileManager.create()
	await manager.setCurrent(name)
	logger.success(`Switched to profile "${name}"`)
}
