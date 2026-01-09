/**
 * Ghost Init Command
 *
 * Initialize ghost mode by creating the profiles directory structure
 * with a default profile at ~/.config/opencode/profiles/.
 */

import type { Command } from "commander"
import { ProfileManager } from "../../profile/manager.js"
import { getProfileGhostConfig, getProfilesDir } from "../../profile/paths.js"
import { ProfileExistsError } from "../../utils/errors.js"
import { handleError, logger } from "../../utils/index.js"
import { addOutputOptions, addVerboseOption } from "../../utils/shared-options.js"

interface GhostInitOptions {
	json?: boolean
	quiet?: boolean
	verbose?: boolean
}

export function registerGhostInitCommand(parent: Command): void {
	const cmd = parent.command("init").description("Initialize ghost mode with profiles")

	// Add shared options for consistency (no --cwd for ghost init)
	addOutputOptions(cmd)
	addVerboseOption(cmd)

	cmd.action(async (options: GhostInitOptions) => {
		try {
			await runGhostInit(options)
		} catch (error) {
			handleError(error, { json: options.json })
		}
	})
}

async function runGhostInit(options: GhostInitOptions): Promise<void> {
	const manager = ProfileManager.create()

	// Guard: Check if already initialized (Law 1: Early Exit)
	if (await manager.isInitialized()) {
		const profilesDir = getProfilesDir()
		throw new ProfileExistsError(`Ghost mode already initialized at ${profilesDir}`)
	}

	// Initialize profiles directory with default profile
	await manager.initialize()

	// Get paths for output
	const profilesDir = getProfilesDir()
	const ghostConfigPath = getProfileGhostConfig("default")

	// Output success
	if (options.json) {
		console.log(
			JSON.stringify({
				success: true,
				profilesDir,
				defaultProfile: "default",
				ghostConfigPath,
			}),
		)
		return
	}

	if (!options.quiet) {
		logger.success("Ghost mode initialized")
		logger.info(`Created ${profilesDir}`)
		logger.info(`Created profile "default"`)
		logger.info("")
		logger.info("Next steps:")
		logger.info("  1. Edit your config: ocx ghost config")
		logger.info("  2. Add registries: ocx ghost registry add <url> --name <name>")
		logger.info("  3. Add components: ocx ghost add <component>")
		logger.info("  4. Create profiles: ocx ghost profile add <name>")
	}
}
