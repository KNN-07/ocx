/**
 * OCX Ghost Mode - update command
 *
 * Update installed components using ghost mode configuration.
 * Thin wrapper around the core update logic using GhostConfigProvider.
 */

import type { Command } from "commander"
import { GhostConfigProvider } from "../../config/provider.js"
import { handleError } from "../../utils/index.js"
import { runUpdateCore, type UpdateOptions } from "../update.js"

export function registerGhostUpdateCommand(parent: Command): void {
	parent
		.command("update [components...]")
		.description("Update installed components (use @version suffix to pin)")
		.option("--all", "Update all installed components")
		.option("--registry <name>", "Update all components from a specific registry")
		.option("--dry-run", "Preview changes without applying")
		.option("--cwd <path>", "Working directory", process.cwd())
		.option("-q, --quiet", "Suppress output")
		.option("-v, --verbose", "Verbose output")
		.option("--json", "Output as JSON")
		.action(async (components: string[], options: UpdateOptions) => {
			try {
				const provider = await GhostConfigProvider.create(options.cwd ?? process.cwd())
				await runUpdateCore(components, options, provider)
			} catch (error) {
				handleError(error, { json: options.json })
			}
		})
}
