/**
 * Ghost Migrate Command
 *
 * Migrates from legacy ~/.config/ocx/ to new profiles system.
 * Supports --dry-run to preview changes before executing.
 */

import type { Command } from "commander"
import { getLegacyConfigDir, migrate, needsMigration } from "../../profile/migrate.js"
import { getProfileDir, getProfilesDir } from "../../profile/paths.js"
import { handleError } from "../../utils/handle-error.js"

interface MigrateOptions {
	dryRun?: boolean
}

export function registerGhostMigrateCommand(parent: Command): void {
	parent
		.command("migrate")
		.description("Migrate from legacy ~/.config/ocx/ to new profiles system")
		.option("--dry-run", "Preview changes without making them")
		.action(async (options: MigrateOptions) => {
			try {
				await runMigrate(options)
			} catch (error) {
				handleError(error)
			}
		})
}

async function runMigrate(options: MigrateOptions): Promise<void> {
	const needsMigrationResult = await needsMigration()

	// Guard: Nothing to migrate (Law 1: Early Exit)
	if (!needsMigrationResult) {
		const legacyDir = getLegacyConfigDir()
		const profilesDir = getProfilesDir()
		console.log("No migration needed.")
		console.log(`  Legacy config: ${legacyDir} (not found)`)
		console.log(`  Profiles: ${profilesDir}`)
		return
	}

	if (options.dryRun) {
		console.log("Dry run - no changes will be made.\n")
	}

	const result = await migrate(options.dryRun)

	// Guard: Migration failed (Law 4: Fail Fast, Fail Loud)
	if (!result.success) {
		console.error("Migration failed:")
		for (const error of result.errors) {
			console.error(`  - ${error}`)
		}
		process.exit(1)
	}

	if (options.dryRun) {
		console.log("Migration preview:")
		console.log(`\nFiles to migrate to default profile:`)
		for (const file of result.migratedFiles) {
			console.log(`  ${file}`)
		}
		console.log(`\nLegacy config will be renamed to:`)
		console.log(`  ${result.backupPath}`)
		console.log(`\nRun without --dry-run to perform migration.`)
	} else {
		console.log("Migration complete!")
		console.log(`\nMigrated to default profile:`)
		for (const file of result.migratedFiles) {
			console.log(`  ${file}`)
		}
		console.log(`\nLegacy config backed up to:`)
		console.log(`  ${result.backupPath}`)
		console.log(`\nProfile location:`)
		console.log(`  ${getProfileDir("default")}`)
	}
}
