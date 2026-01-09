/**
 * Ghost Config Command
 *
 * Open the current profile's ghost.jsonc in the user's preferred editor.
 * Uses the editor preference chain: OCX_EDITOR -> EDITOR -> VISUAL -> vi
 *
 * This is an alias for `ocx ghost profile config` that works with the current profile.
 */

import type { Command } from "commander"
import { ProfileManager } from "../../profile/manager.js"
import { getProfileGhostConfig } from "../../profile/paths.js"
import { ProfilesNotInitializedError } from "../../utils/errors.js"
import { handleError, logger } from "../../utils/index.js"
import { addOutputOptions } from "../../utils/shared-options.js"

interface GhostConfigOptions {
	json?: boolean
	quiet?: boolean
	profile?: string
}

/**
 * Resolve the editor to use for opening config files.
 *
 * Security note: We intentionally do NOT validate the editor command.
 * This matches the behavior of Git (GIT_EDITOR), sudo (VISUAL/EDITOR), npm, and
 * other Unix tools. The security model is: if an attacker can modify your
 * environment variables, they already have control of your system.
 * Validating here would provide a false sense of security.
 *
 * @see https://git-scm.com/docs/git-var (GIT_EDITOR behavior)
 */
function resolveEditor(): string {
	return process.env.OCX_EDITOR || process.env.EDITOR || process.env.VISUAL || "vi"
}

export function registerGhostConfigCommand(parent: Command): void {
	const cmd = parent
		.command("config")
		.description("Open current profile's ghost.jsonc in your editor")
		.option("-p, --profile <name>", "Open a specific profile's config")

	addOutputOptions(cmd).action(async (options: GhostConfigOptions) => {
		try {
			await runGhostConfig(options)
		} catch (error) {
			handleError(error, { json: options.json })
		}
	})
}

async function runGhostConfig(options: GhostConfigOptions): Promise<void> {
	const manager = ProfileManager.create()

	// Guard: Check if profiles are initialized (Law 1: Early Exit)
	if (!(await manager.isInitialized())) {
		throw new ProfilesNotInitializedError()
	}

	// Resolve current profile (respects --profile flag, OCX_PROFILE env, or symlink)
	const profileName = await manager.getCurrent(options.profile)

	// Verify profile exists (fail fast)
	await manager.get(profileName)

	const configPath = getProfileGhostConfig(profileName)

	// JSON mode: just output the path
	if (options.json) {
		console.log(JSON.stringify({ success: true, profile: profileName, path: configPath }))
		return
	}

	const editor = resolveEditor()

	if (!options.quiet) {
		logger.info(`Opening ${configPath} in ${editor}...`)
	}

	// Open editor with inherited stdio for interactive use
	const result = Bun.spawnSync([editor, configPath], {
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	})

	// Check for editor errors (Law 4: Fail Fast)
	if (result.exitCode !== 0) {
		logger.error(`Editor exited with code ${result.exitCode}`)
		process.exit(result.exitCode)
	}
}
