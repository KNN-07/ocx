/**
 * Migration Utility Tests
 *
 * Tests for the migrate module covering:
 * - needsMigration() detection logic
 * - migrate() file copying and backup
 * - dry-run mode
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { ProfileManager } from "../../src/profile/manager.js"
import { getLegacyConfigDir, migrate, needsMigration } from "../../src/profile/migrate.js"
import { getProfileDir, getProfilesDir } from "../../src/profile/paths.js"

// =============================================================================
// HELPERS
// =============================================================================

async function createTempConfigDir(name: string): Promise<string> {
	const dir = join(import.meta.dir, "fixtures", `tmp-${name}-${Date.now()}`)
	await mkdir(dir, { recursive: true })
	return dir
}

async function cleanupTempDir(dir: string): Promise<void> {
	await rm(dir, { recursive: true, force: true })
}

async function createLegacyConfig(testDir: string): Promise<string> {
	const legacyDir = join(testDir, "ocx")
	await mkdir(legacyDir, { recursive: true })
	await Bun.write(
		join(legacyDir, "ghost.jsonc"),
		JSON.stringify({ $schema: "test", registries: {} }),
	)
	return legacyDir
}

// =============================================================================
// needsMigration TESTS
// =============================================================================

describe("needsMigration", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("needs-migration")
		process.env.XDG_CONFIG_HOME = testDir
	})

	afterEach(async () => {
		if (originalXdgConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME
		} else {
			process.env.XDG_CONFIG_HOME = originalXdgConfigHome
		}
		await cleanupTempDir(testDir)
	})

	it("should return true when legacy exists and profiles don't", async () => {
		// Create legacy config
		await createLegacyConfig(testDir)

		const result = await needsMigration()

		expect(result).toBe(true)
	})

	it("should return false when both exist", async () => {
		// Create legacy config
		await createLegacyConfig(testDir)

		// Create profiles
		const manager = ProfileManager.create()
		await manager.initialize()

		const result = await needsMigration()

		expect(result).toBe(false)
	})

	it("should return false when neither exists", async () => {
		// Neither legacy nor profiles exist
		const result = await needsMigration()

		expect(result).toBe(false)
	})

	it("should return false when only profiles exist", async () => {
		// Only create profiles
		const manager = ProfileManager.create()
		await manager.initialize()

		const result = await needsMigration()

		expect(result).toBe(false)
	})
})

// =============================================================================
// getLegacyConfigDir TESTS
// =============================================================================

describe("getLegacyConfigDir", () => {
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	afterEach(() => {
		if (originalXdgConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME
		} else {
			process.env.XDG_CONFIG_HOME = originalXdgConfigHome
		}
	})

	it("should respect XDG_CONFIG_HOME", () => {
		process.env.XDG_CONFIG_HOME = "/custom/config"

		const result = getLegacyConfigDir()

		expect(result).toBe("/custom/config/ocx")
	})
})

// =============================================================================
// migrate TESTS
// =============================================================================

describe("migrate", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("migrate")
		process.env.XDG_CONFIG_HOME = testDir
	})

	afterEach(async () => {
		if (originalXdgConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME
		} else {
			process.env.XDG_CONFIG_HOME = originalXdgConfigHome
		}
		await cleanupTempDir(testDir)
	})

	it("should copy files to default profile", async () => {
		// Create legacy config with all three files
		const legacyDir = await createLegacyConfig(testDir)
		await Bun.write(join(legacyDir, "opencode.jsonc"), JSON.stringify({ model: "test" }))
		await Bun.write(join(legacyDir, "AGENTS.md"), "# Test Agents")

		const result = await migrate(false)

		expect(result.success).toBe(true)
		expect(result.migratedFiles).toContain("ghost.jsonc")
		expect(result.migratedFiles).toContain("opencode.jsonc")
		expect(result.migratedFiles).toContain("AGENTS.md")

		// Verify files exist in default profile
		const defaultDir = getProfileDir("default")
		const ghostFile = Bun.file(join(defaultDir, "ghost.jsonc"))
		const opencodeFile = Bun.file(join(defaultDir, "opencode.jsonc"))
		const agentsFile = Bun.file(join(defaultDir, "AGENTS.md"))

		expect(await ghostFile.exists()).toBe(true)
		expect(await opencodeFile.exists()).toBe(true)
		expect(await agentsFile.exists()).toBe(true)
	})

	it("should rename legacy dir to .bak", async () => {
		await createLegacyConfig(testDir)

		const result = await migrate(false)

		expect(result.success).toBe(true)
		expect(result.backupPath).toBe(join(testDir, "ocx.bak"))

		// Verify backup exists
		const backupStats = await stat(join(testDir, "ocx.bak"))
		expect(backupStats.isDirectory()).toBe(true)

		// Verify original is gone
		try {
			await stat(join(testDir, "ocx"))
			expect(false).toBe(true) // Should not reach here
		} catch {
			// Expected - original should not exist
		}
	})

	it("should not make changes in dry run mode", async () => {
		const legacyDir = await createLegacyConfig(testDir)

		const result = await migrate(true)

		expect(result.success).toBe(true)
		expect(result.migratedFiles.length).toBeGreaterThan(0)
		expect(result.backupPath).toBe(`${legacyDir}.bak`)

		// Verify legacy still exists (not moved)
		const legacyStats = await stat(legacyDir)
		expect(legacyStats.isDirectory()).toBe(true)

		// Verify profiles not created
		const profilesDir = getProfilesDir()
		try {
			await stat(profilesDir)
			expect(false).toBe(true) // Should not reach here
		} catch {
			// Expected - profiles should not exist
		}
	})

	it("should fail if legacy config does not exist", async () => {
		// No legacy config created

		const result = await migrate(false)

		expect(result.success).toBe(false)
		expect(result.errors.length).toBeGreaterThan(0)
		expect(result.errors[0]).toContain("No legacy config found")
	})

	it("should fail if profiles already exist", async () => {
		// Create legacy config
		await createLegacyConfig(testDir)

		// Create profiles first
		const manager = ProfileManager.create()
		await manager.initialize()

		const result = await migrate(false)

		expect(result.success).toBe(false)
		expect(result.errors.length).toBeGreaterThan(0)
		expect(result.errors[0]).toContain("Profiles directory already exists")
	})

	it("should fail if no migratable files exist", async () => {
		// Create empty legacy directory
		const legacyDir = join(testDir, "ocx")
		await mkdir(legacyDir, { recursive: true })
		// Create a non-migratable file
		await Bun.write(join(legacyDir, "random.txt"), "random content")

		const result = await migrate(false)

		expect(result.success).toBe(false)
		expect(result.errors.length).toBeGreaterThan(0)
		expect(result.errors[0]).toContain("No migratable files found")
	})

	it("should only migrate recognized files", async () => {
		// Create legacy config with extra files
		const legacyDir = await createLegacyConfig(testDir)
		await Bun.write(join(legacyDir, "random.txt"), "should not migrate")
		await Bun.write(join(legacyDir, "other.json"), "should not migrate")

		const result = await migrate(false)

		expect(result.success).toBe(true)
		expect(result.migratedFiles).toContain("ghost.jsonc")
		expect(result.migratedFiles).not.toContain("random.txt")
		expect(result.migratedFiles).not.toContain("other.json")
	})

	it("should preserve file content during migration", async () => {
		// Create legacy config with specific content
		const legacyDir = await createLegacyConfig(testDir)
		const originalContent = JSON.stringify({
			$schema: "https://test.schema.json",
			registries: { kdco: "https://registry.kdco.dev" },
		})
		await Bun.write(join(legacyDir, "ghost.jsonc"), originalContent)

		await migrate(false)

		// Verify content is preserved
		const defaultDir = getProfileDir("default")
		const migratedFile = Bun.file(join(defaultDir, "ghost.jsonc"))
		const migratedContent = await migratedFile.text()

		expect(migratedContent).toBe(originalContent)
	})

	it("should set migrated files to 0o600 permissions", async () => {
		// Create legacy config
		await createLegacyConfig(testDir)

		await migrate(false)

		// Verify permissions are set to 0o600
		const ghostPath = join(getProfileDir("default"), "ghost.jsonc")
		const stats = await stat(ghostPath)
		expect(stats.mode & 0o777).toBe(0o600)
	})
})
