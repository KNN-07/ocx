/**
 * Ghost Profile Config Command
 *
 * Open a profile's ghost.jsonc file in the user's preferred editor.
 * Uses EDITOR or VISUAL environment variables, falls back to vi.
 */

import type { Command } from "commander"
import { ProfileManager } from "../../../profile/manager.js"
import { getProfileGhostConfig } from "../../../profile/paths.js"
import { handleError } from "../../../utils/handle-error.js"

export function registerProfileConfigCommand(parent: Command): void {
	parent
		.command("config [name]")
		.description("Open profile ghost.jsonc in editor")
		.action(async (name: string | undefined) => {
			try {
				await runProfileConfig(name)
			} catch (error) {
				handleError(error)
			}
		})
}

async function runProfileConfig(name: string | undefined): Promise<void> {
	const manager = ProfileManager.create()

	// Use provided name or fall back to current profile
	const profileName = name ?? (await manager.getCurrent())

	// Verify profile exists (fail fast)
	await manager.get(profileName)

	const configPath = getProfileGhostConfig(profileName)
	const editor = process.env.EDITOR || process.env.VISUAL || "vi"

	const proc = Bun.spawn([editor, configPath], {
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	})

	const exitCode = await proc.exited
	if (exitCode !== 0) {
		throw new Error(`Editor exited with code ${exitCode}`)
	}
}
