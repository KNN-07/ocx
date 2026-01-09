/**
 * Ghost Profile Command Group
 *
 * Parent command for managing ghost mode profiles.
 * Profiles allow multiple named configurations for different contexts.
 *
 * Alias: `ocx ghost p` (shorthand for `ocx ghost profile`)
 */

import type { Command } from "commander"
import { registerProfileAddCommand } from "./add.js"
import { registerProfileConfigCommand } from "./config.js"
import { registerProfileListCommand } from "./list.js"
import { registerProfileRemoveCommand } from "./remove.js"
import { registerProfileShowCommand } from "./show.js"
import { registerProfileUseCommand } from "./use.js"

/**
 * Register the ghost profile command and all subcommands.
 */
export function registerGhostProfileCommand(parent: Command): void {
	const profile = parent.command("profile").alias("p").description("Manage ghost mode profiles")

	registerProfileListCommand(profile)
	registerProfileAddCommand(profile)
	registerProfileRemoveCommand(profile)
	registerProfileUseCommand(profile)
	registerProfileShowCommand(profile)
	registerProfileConfigCommand(profile)
}
