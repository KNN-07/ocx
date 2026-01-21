/**
 * Profile Command Group
 *
 * Parent command for managing global profiles.
 * Profiles allow multiple named configurations for different contexts.
 *
 * Alias: `ocx p` (shorthand for `ocx profile`)
 */

import type { Command } from "commander"
import { registerProfileAddCommand } from "./add.js"
import { registerProfileConfigCommand } from "./config.js"
import { registerProfileListCommand } from "./list.js"
import { registerProfileRemoveCommand } from "./remove.js"
import { registerProfileShowCommand } from "./show.js"

/**
 * Register the profile command and all subcommands.
 */
export function registerProfileCommand(program: Command): void {
	const profile = program.command("profile").alias("p").description("Manage global profiles")

	registerProfileListCommand(profile)
	registerProfileAddCommand(profile)
	registerProfileRemoveCommand(profile)
	registerProfileShowCommand(profile)
	registerProfileConfigCommand(profile)
}
