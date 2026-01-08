import { homedir } from "node:os"
import path from "node:path"

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
 * Get the path to a profile's ghost.jsonc file.
 * @param name - Profile name
 * @returns Absolute path to ghost.jsonc
 */
export function getProfileGhostConfig(name: string): string {
	return path.join(getProfileDir(name), "ghost.jsonc")
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

/**
 * Get the path to the current profile symlink.
 * @returns Absolute path to profiles/current symlink
 */
export function getCurrentSymlink(): string {
	return path.join(getProfilesDir(), "current")
}
