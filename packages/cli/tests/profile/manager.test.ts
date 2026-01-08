/**
 * ProfileManager Unit Tests
 *
 * Tests for the ProfileManager class covering:
 * - Initialization checks
 * - Profile CRUD operations
 * - Current profile management
 * - Environment variable overrides
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdir, readlink, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { ProfileManager } from "../../src/profile/manager.js"
import { getCurrentSymlink, getProfileDir, getProfilesDir } from "../../src/profile/paths.js"
import {
	InvalidProfileNameError,
	ProfileExistsError,
	ProfileNotFoundError,
	ProfilesNotInitializedError,
} from "../../src/utils/errors.js"

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

// =============================================================================
// INITIALIZATION TESTS
// =============================================================================

describe("ProfileManager.isInitialized", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-init-check")
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

	it("should return false when profiles directory does not exist", async () => {
		const manager = ProfileManager.create()

		const initialized = await manager.isInitialized()

		expect(initialized).toBe(false)
	})

	it("should return true when profiles directory exists", async () => {
		const profilesDir = getProfilesDir()
		await mkdir(profilesDir, { recursive: true })
		const manager = ProfileManager.create()

		const initialized = await manager.isInitialized()

		expect(initialized).toBe(true)
	})
})

// =============================================================================
// INITIALIZE TESTS
// =============================================================================

describe("ProfileManager.initialize", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-initialize")
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

	it("should create profiles directory", async () => {
		const manager = ProfileManager.create()

		await manager.initialize()

		const profilesDir = getProfilesDir()
		const stats = await stat(profilesDir)
		expect(stats.isDirectory()).toBe(true)
	})

	it("should create default profile", async () => {
		const manager = ProfileManager.create()

		await manager.initialize()

		const exists = await manager.exists("default")
		expect(exists).toBe(true)
	})

	it("should set default profile as current", async () => {
		const manager = ProfileManager.create()

		await manager.initialize()

		const current = await manager.getCurrent()
		expect(current).toBe("default")
	})

	it("should create current symlink", async () => {
		const manager = ProfileManager.create()

		await manager.initialize()

		const symlinkPath = getCurrentSymlink()
		const target = await readlink(symlinkPath)
		expect(target).toBe("default")
	})

	it("should create ghost.jsonc with default content", async () => {
		const manager = ProfileManager.create()

		await manager.initialize()

		const profile = await manager.get("default")
		expect(profile.ghost).toBeDefined()
		expect(profile.ghost.registries).toBeDefined()
		expect(profile.ghost.$schema).toBeDefined()
	})
})

// =============================================================================
// LIST TESTS
// =============================================================================

describe("ProfileManager.list", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-list")
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

	it("should throw ProfilesNotInitializedError when not initialized", async () => {
		const manager = ProfileManager.create()

		expect(manager.list()).rejects.toThrow(ProfilesNotInitializedError)
	})

	it("should return all profile names sorted", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()
		await manager.add("zebra")
		await manager.add("alpha")

		const profiles = await manager.list()

		expect(profiles).toEqual(["alpha", "default", "zebra"])
	})

	it("should not include hidden directories", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		// Create a hidden directory
		const hiddenDir = join(getProfilesDir(), ".hidden")
		await mkdir(hiddenDir, { recursive: true })

		const profiles = await manager.list()

		expect(profiles).not.toContain(".hidden")
	})

	it("should not include current symlink in list", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		const profiles = await manager.list()

		expect(profiles).not.toContain("current")
	})
})

// =============================================================================
// EXISTS TESTS
// =============================================================================

describe("ProfileManager.exists", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-exists")
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

	it("should return true for existing profile", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		const exists = await manager.exists("default")

		expect(exists).toBe(true)
	})

	it("should return false for non-existing profile", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		const exists = await manager.exists("nonexistent")

		expect(exists).toBe(false)
	})
})

// =============================================================================
// GET TESTS
// =============================================================================

describe("ProfileManager.get", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-get")
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

	it("should load and validate profile", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		const profile = await manager.get("default")

		expect(profile.name).toBe("default")
		expect(profile.ghost).toBeDefined()
		expect(profile.ghost.registries).toBeDefined()
	})

	it("should throw ProfileNotFoundError for missing profiles", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		expect(manager.get("nonexistent")).rejects.toThrow(ProfileNotFoundError)
	})

	it("should detect hasAgents correctly when AGENTS.md exists", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		// Create AGENTS.md in default profile
		const agentsPath = join(getProfileDir("default"), "AGENTS.md")
		await Bun.write(agentsPath, "# Test Agents")

		const profile = await manager.get("default")

		expect(profile.hasAgents).toBe(true)
	})

	it("should detect hasAgents correctly when AGENTS.md does not exist", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		const profile = await manager.get("default")

		expect(profile.hasAgents).toBe(false)
	})

	it("should load opencode.jsonc when present", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		// Create opencode.jsonc in default profile
		const opencodePath = join(getProfileDir("default"), "opencode.jsonc")
		await Bun.write(opencodePath, JSON.stringify({ model: "test-model" }))

		const profile = await manager.get("default")

		expect(profile.opencode).toBeDefined()
		expect(profile.opencode?.model).toBe("test-model")
	})
})

// =============================================================================
// ADD TESTS
// =============================================================================

describe("ProfileManager.add", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-add")
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

	it("should create profile directory", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		await manager.add("myprofile")

		const profileDir = getProfileDir("myprofile")
		const stats = await stat(profileDir)
		expect(stats.isDirectory()).toBe(true)
	})

	it("should create ghost.jsonc in new profile", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		await manager.add("myprofile")

		const profile = await manager.get("myprofile")
		expect(profile.ghost).toBeDefined()
		expect(profile.ghost.$schema).toBeDefined()
	})

	it("should throw ProfileExistsError for duplicate names", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()
		await manager.add("duplicate")

		expect(manager.add("duplicate")).rejects.toThrow(ProfileExistsError)
	})

	it("should throw InvalidProfileNameError for empty names", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		expect(manager.add("")).rejects.toThrow(InvalidProfileNameError)
	})

	it("should throw InvalidProfileNameError for names starting with number", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		expect(manager.add("123profile")).rejects.toThrow(InvalidProfileNameError)
	})

	it("should throw InvalidProfileNameError for names with path traversal", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		expect(manager.add("../../../etc")).rejects.toThrow(InvalidProfileNameError)
	})

	it("should throw InvalidProfileNameError for names with slashes", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		expect(manager.add("a/b/c")).rejects.toThrow(InvalidProfileNameError)
	})

	it("should accept valid names with dots, underscores, and hyphens", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		await manager.add("my.profile")
		await manager.add("my_profile")
		await manager.add("my-profile")

		expect(await manager.exists("my.profile")).toBe(true)
		expect(await manager.exists("my_profile")).toBe(true)
		expect(await manager.exists("my-profile")).toBe(true)
	})
})

// =============================================================================
// REMOVE TESTS
// =============================================================================

describe("ProfileManager.remove", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-remove")
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

	it("should delete profile directory", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()
		await manager.add("toremove")

		await manager.remove("toremove")

		const exists = await manager.exists("toremove")
		expect(exists).toBe(false)
	})

	it("should throw ProfileNotFoundError for non-existing profile", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		expect(manager.remove("nonexistent")).rejects.toThrow(ProfileNotFoundError)
	})

	it("should prevent deleting current profile without --force", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()
		await manager.add("backup") // Need at least 2 profiles

		// Default is current, try to delete it
		expect(manager.remove("default")).rejects.toThrow(/Cannot delete current profile/)
	})

	it("should allow deleting current profile with force=true", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()
		await manager.add("backup")

		await manager.remove("default", true)

		const exists = await manager.exists("default")
		expect(exists).toBe(false)
	})

	it("should prevent deleting the last profile", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		// Only default exists, can't delete it
		expect(manager.remove("default", true)).rejects.toThrow(/Cannot delete the last profile/)
	})

	it("should switch to another profile after force-deleting current", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()
		await manager.add("other")
		await manager.setCurrent("other")

		await manager.remove("other", true) // force delete current

		const newCurrent = await manager.getCurrent()
		expect(newCurrent).toBe("default")
	})
})

// =============================================================================
// SET CURRENT TESTS
// =============================================================================

describe("ProfileManager.setCurrent", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-set-current")
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

	it("should update symlink to new profile", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()
		await manager.add("newcurrent")

		await manager.setCurrent("newcurrent")

		const symlinkPath = getCurrentSymlink()
		const target = await readlink(symlinkPath)
		expect(target).toBe("newcurrent")
	})

	it("should atomically swap symlink", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()
		await manager.add("profile1")
		await manager.add("profile2")

		// Switch multiple times to test atomic behavior
		await manager.setCurrent("profile1")
		await manager.setCurrent("profile2")
		await manager.setCurrent("profile1")

		const current = await manager.getCurrent()
		expect(current).toBe("profile1")
	})

	it("should throw ProfileNotFoundError for non-existing profile", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		expect(manager.setCurrent("nonexistent")).rejects.toThrow(ProfileNotFoundError)
	})
})

// =============================================================================
// GET CURRENT TESTS
// =============================================================================

describe("ProfileManager.getCurrent", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME
	const originalOcxProfile = process.env.OCX_PROFILE

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-get-current")
		process.env.XDG_CONFIG_HOME = testDir
		delete process.env.OCX_PROFILE
	})

	afterEach(async () => {
		if (originalXdgConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME
		} else {
			process.env.XDG_CONFIG_HOME = originalXdgConfigHome
		}
		if (originalOcxProfile === undefined) {
			delete process.env.OCX_PROFILE
		} else {
			process.env.OCX_PROFILE = originalOcxProfile
		}
		await cleanupTempDir(testDir)
	})

	it("should read symlink target", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		const current = await manager.getCurrent()

		expect(current).toBe("default")
	})

	it("should respect OCX_PROFILE env var", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()
		await manager.add("envprofile")

		process.env.OCX_PROFILE = "envprofile"

		const current = await manager.getCurrent()

		expect(current).toBe("envprofile")
	})

	it("should throw ProfileNotFoundError if OCX_PROFILE refers to non-existing profile", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		process.env.OCX_PROFILE = "nonexistent"

		expect(manager.getCurrent()).rejects.toThrow(ProfileNotFoundError)
	})

	it("should use override parameter over env var", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()
		await manager.add("override")
		await manager.add("envval")

		process.env.OCX_PROFILE = "envval"

		const current = await manager.getCurrent("override")

		expect(current).toBe("override")
	})

	it("should throw ProfileNotFoundError if override refers to non-existing profile", async () => {
		const manager = ProfileManager.create()
		await manager.initialize()

		expect(manager.getCurrent("nonexistent")).rejects.toThrow(ProfileNotFoundError)
	})
})
