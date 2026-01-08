/**
 * Migration Utility
 *
 * Handles migration from legacy ~/.config/ocx/ to new profiles system.
 * Non-destructive: creates backup of legacy config before migration.
 */

import { chmod, readdir, rename, stat } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { ProfileManager } from "./manager.js"
import { getProfileDir, getProfilesDir } from "./paths.js"

/**
 * Get the legacy OCX config directory path.
 * @returns Path to ~/.config/ocx/
 */
export function getLegacyConfigDir(): string {
	const base = process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config")
	return path.join(base, "ocx")
}

/**
 * Check if migration from legacy config is needed.
 * Migration is needed if:
 * - Legacy ~/.config/ocx/ exists
 * - New profiles system is NOT initialized
 */
export async function needsMigration(): Promise<boolean> {
	const legacyDir = getLegacyConfigDir()
	const profilesDir = getProfilesDir()

	try {
		await stat(legacyDir)
		// Legacy exists, check if profiles exist
		try {
			await stat(profilesDir)
			return false // Both exist, no migration needed
		} catch {
			return true // Legacy exists, profiles don't
		}
	} catch {
		return false // Legacy doesn't exist
	}
}

export interface MigrationResult {
	success: boolean
	migratedFiles: string[]
	backupPath: string | null
	errors: string[]
}

/**
 * Migrate from legacy ~/.config/ocx/ to new profiles system.
 * @param dryRun - If true, only preview changes without making them
 */
export async function migrate(dryRun = false): Promise<MigrationResult> {
	const result: MigrationResult = {
		success: false,
		migratedFiles: [],
		backupPath: null,
		errors: [],
	}

	const legacyDir = getLegacyConfigDir()
	const profilesDir = getProfilesDir()

	// Guard: Legacy must exist (Law 1: Early Exit)
	try {
		await stat(legacyDir)
	} catch {
		result.errors.push(`No legacy config found at ${legacyDir}`)
		return result
	}

	// Guard: Profiles must not already exist (Law 1: Early Exit)
	try {
		await stat(profilesDir)
		result.errors.push(`Profiles directory already exists at ${profilesDir}`)
		return result
	} catch {
		// Expected - profiles don't exist yet
	}

	// Find files to migrate
	const legacyFiles = await readdir(legacyDir)
	const filesToMigrate = legacyFiles.filter(
		(f) => f === "ghost.jsonc" || f === "opencode.jsonc" || f === "AGENTS.md",
	)

	// Guard: Must have files to migrate (Law 1: Early Exit)
	if (filesToMigrate.length === 0) {
		result.errors.push("No migratable files found in legacy config")
		return result
	}

	// Dry run: report what would happen without making changes
	if (dryRun) {
		result.migratedFiles = filesToMigrate.map((f) => path.join(legacyDir, f))
		result.backupPath = `${legacyDir}.bak`
		result.success = true
		return result
	}

	// Initialize profiles (creates default profile)
	const manager = ProfileManager.create()
	await manager.initialize()

	// Copy files to default profile with consistent permissions
	const defaultProfileDir = getProfileDir("default")
	for (const file of filesToMigrate) {
		const srcPath = path.join(legacyDir, file)
		const destPath = path.join(defaultProfileDir, file)
		// Copy content using Bun's file API, then set permissions (0o600 matches atomicWrite)
		await Bun.write(destPath, Bun.file(srcPath))
		await chmod(destPath, 0o600)
		result.migratedFiles.push(file)
	}

	// Rename legacy dir to .bak (non-destructive backup)
	const backupPath = `${legacyDir}.bak`
	await rename(legacyDir, backupPath)
	result.backupPath = backupPath

	result.success = true
	return result
}
