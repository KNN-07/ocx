/**
 * Profile List Command
 *
 * List all available global profiles.
 */

import type { Command } from "commander"
import { ProfileManager } from "../../profile/manager.js"
import { handleError } from "../../utils/handle-error.js"
import { sharedOptions } from "../../utils/shared-options.js"

interface ProfileListOptions {
	json?: boolean
}

export function registerProfileListCommand(parent: Command): void {
	parent
		.command("list")
		.alias("ls")
		.description("List all global profiles")
		.addOption(sharedOptions.json())
		.action(async (options: ProfileListOptions) => {
			try {
				await runProfileList(options)
			} catch (error) {
				handleError(error, { json: options.json })
			}
		})
}

async function runProfileList(options: ProfileListOptions): Promise<void> {
	const manager = ProfileManager.create()

	// Guard: Check if profiles are initialized
	if (!(await manager.isInitialized())) {
		if (options.json) {
			console.log(JSON.stringify({ profiles: [] }))
		} else {
			console.log("No profiles found. Run 'ocx init --global' to create one.")
		}
		return
	}

	const profiles = await manager.list()

	if (options.json) {
		console.log(JSON.stringify({ profiles }, null, 2))
		return
	}

	// Guard: Handle empty profiles list
	if (profiles.length === 0) {
		console.log("No profiles found.")
		return
	}

	// Display profiles
	console.log("Global profiles:")
	for (const name of profiles) {
		console.log(`  ${name}`)
	}
}
