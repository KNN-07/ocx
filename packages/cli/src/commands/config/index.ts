/**
 * Config Command Group
 *
 * Parent command for viewing and editing configuration.
 */

import type { Command } from "commander"
import { registerConfigEditCommand } from "./edit.js"
import { registerConfigShowCommand } from "./show.js"

/**
 * Register the config command and all subcommands.
 */
export function registerConfigCommand(program: Command): void {
	const config = program.command("config").description("View and edit configuration")

	registerConfigShowCommand(config)
	registerConfigEditCommand(config)
}
