import { existsSync, statSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

// =============================================================================
// FILE NAME CONSTANTS
// =============================================================================

/** OCX configuration file name */
export const OCX_CONFIG_FILE = "ocx.jsonc"

/** OpenCode configuration file name */
export const OPENCODE_CONFIG_FILE = "opencode.jsonc"

/** Local config directory name */
export const LOCAL_CONFIG_DIR = ".opencode"

// =============================================================================
// PROFILE PATH HELPERS
// =============================================================================

/**
 * Get the profiles directory path.
 * Respects XDG_CONFIG_HOME if set.
 * @returns Absolute path to ~/.config/opencode/profiles/
 */
export function getProfilesDir(): string {
	const base = process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config")
	return path.join(base, "opencode", "profiles")
}

/**
 * Get a specific profile's directory path.
 * @param name - Profile name
 * @returns Absolute path to the profile directory
 */
export function getProfileDir(name: string): string {
	return path.join(getProfilesDir(), name)
}

/**
 * Get the path to a profile's ocx.jsonc file.
 * @param name - Profile name
 * @returns Absolute path to ocx.jsonc
 */
export function getProfileOcxConfig(name: string): string {
	return path.join(getProfileDir(name), "ocx.jsonc")
}

/**
 * Get the path to a profile's opencode.jsonc file.
 * @param name - Profile name
 * @returns Absolute path to opencode.jsonc
 */
export function getProfileOpencodeConfig(name: string): string {
	return path.join(getProfileDir(name), "opencode.jsonc")
}

/**
 * Get the path to a profile's AGENTS.md file.
 * @param name - Profile name
 * @returns Absolute path to AGENTS.md
 */
export function getProfileAgents(name: string): string {
	return path.join(getProfileDir(name), "AGENTS.md")
}

// =============================================================================
// LOCAL CONFIG DISCOVERY
// =============================================================================

/**
 * Find the local config directory by walking up from cwd.
 * Stops at first .opencode/ directory or git root.
 * @param cwd - Starting directory
 * @returns Path to .opencode/ directory, or null if not found
 */
export function findLocalConfigDir(cwd: string): string | null {
	let currentDir = cwd

	while (true) {
		// Check for .opencode/ directory at this level
		const configDir = path.join(currentDir, LOCAL_CONFIG_DIR)
		if (existsSync(configDir) && statSync(configDir).isDirectory()) {
			return configDir
		}

		// Check if we've hit the git root (.git directory)
		const gitDir = path.join(currentDir, ".git")
		if (existsSync(gitDir)) {
			// At git root, stop searching
			return null
		}

		// Move up one directory
		const parentDir = path.dirname(currentDir)
		if (parentDir === currentDir) {
			// Reached filesystem root
			return null
		}
		currentDir = parentDir
	}
}

// =============================================================================
// GLOBAL CONFIG HELPERS
// =============================================================================

/**
 * Get the global base config.jsonc path.
 * @returns Path to ~/.config/opencode/config.jsonc
 */
export function getGlobalConfig(): string {
	const base = process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config")
	return path.join(base, "opencode", "config.jsonc")
}
