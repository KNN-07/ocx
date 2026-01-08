/**
 * Ghost Profile Remove Command
 *
 * Delete a ghost profile.
 * Requires confirmation unless --force is provided.
 */

import { createInterface } from "node:readline"
import type { Command } from "commander"
import { ProfileManager } from "../../../profile/manager.js"
import { isTTY } from "../../../utils/env.js"
import { ProfileNotFoundError, ValidationError } from "../../../utils/errors.js"
import { handleError, logger } from "../../../utils/index.js"

interface ProfileRemoveOptions {
	force?: boolean
}

export function registerProfileRemoveCommand(parent: Command): void {
	parent
		.command("remove <name>")
		.alias("rm")
		.description("Delete a ghost profile")
		.option("-f, --force", "Skip confirmation and allow deleting current profile")
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

	// Confirmation required unless --force
	if (!options.force) {
		// Fail fast in non-interactive environments
		if (!isTTY) {
			throw new ValidationError(
				"Cannot confirm deletion in non-interactive mode. Use --force to delete without confirmation.",
			)
		}

		const confirmed = await confirmDeletion(name)
		if (!confirmed) {
			console.log("Aborted.")
			return
		}
	}

	await manager.remove(name, options.force)
	logger.success(`Deleted profile "${name}"`)
}

/**
 * Prompt user to confirm profile deletion.
 */
async function confirmDeletion(name: string): Promise<boolean> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	})

	const answer = await new Promise<string>((resolve) => {
		rl.question(`Delete profile "${name}"? This cannot be undone. [y/N] `, resolve)
	})

	rl.close()
	return answer.toLowerCase() === "y"
}
