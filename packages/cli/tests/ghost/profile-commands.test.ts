/**
 * Ghost Profile Commands Integration Tests
 *
 * Tests for the CLI profile commands:
 * - ocx ghost profile list
 * - ocx ghost profile add
 * - ocx ghost profile remove
 * - ocx ghost profile use
 * - ocx ghost profile show
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"

// =============================================================================
// HELPERS
// =============================================================================

interface CLIResult {
	stdout: string
	stderr: string
	output: string
	exitCode: number
}

async function createTempConfigDir(name: string): Promise<string> {
	const dir = join(import.meta.dir, "fixtures", `tmp-${name}-${Date.now()}`)
	await mkdir(dir, { recursive: true })
	return dir
}

async function cleanupTempDir(dir: string): Promise<void> {
	await rm(dir, { recursive: true, force: true })
}

async function runGhostCLI(args: string[], env: Record<string, string> = {}): Promise<CLIResult> {
	const indexPath = join(import.meta.dir, "..", "..", "src/index.ts")

	const proc = Bun.spawn(["bun", "run", indexPath, "ghost", ...args], {
		env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", ...env },
		stdout: "pipe",
		stderr: "pipe",
	})

	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	])

	const exitCode = await proc.exited

	return {
		stdout,
		stderr,
		output: stdout + stderr,
		exitCode,
	}
}

// =============================================================================
// PROFILE LIST TESTS
// =============================================================================

describe("ocx ghost profile list", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-list-cmd")
	})

	afterEach(async () => {
		if (originalXdgConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME
		} else {
			process.env.XDG_CONFIG_HOME = originalXdgConfigHome
		}
		await cleanupTempDir(testDir)
	})

	it("should show message when not initialized", async () => {
		const { exitCode, output } = await runGhostCLI(["profile", "list"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
		expect(output).toContain("No profiles found")
	})

	it("should list profiles after init", async () => {
		// Initialize first
		await runGhostCLI(["init"], { XDG_CONFIG_HOME: testDir })

		const { exitCode, output } = await runGhostCLI(["profile", "list"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
		expect(output).toContain("default")
	})

	it("should mark current profile with asterisk", async () => {
		await runGhostCLI(["init"], { XDG_CONFIG_HOME: testDir })

		const { output } = await runGhostCLI(["profile", "list"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(output).toContain("* default")
	})

	it("should work with ls alias", async () => {
		await runGhostCLI(["init"], { XDG_CONFIG_HOME: testDir })

		const { exitCode, output } = await runGhostCLI(["profile", "ls"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
		expect(output).toContain("default")
	})

	it("should output JSON with --json flag", async () => {
		await runGhostCLI(["init"], { XDG_CONFIG_HOME: testDir })

		const { exitCode, output } = await runGhostCLI(["profile", "list", "--json"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
		const json = JSON.parse(output)
		expect(json.profiles).toContain("default")
		expect(json.current).toBe("default")
	})

	it("should list multiple profiles sorted", async () => {
		await runGhostCLI(["init"], { XDG_CONFIG_HOME: testDir })
		await runGhostCLI(["profile", "add", "zebra"], { XDG_CONFIG_HOME: testDir })
		await runGhostCLI(["profile", "add", "alpha"], { XDG_CONFIG_HOME: testDir })

		const { output } = await runGhostCLI(["profile", "list", "--json"], {
			XDG_CONFIG_HOME: testDir,
		})

		const json = JSON.parse(output)
		expect(json.profiles).toEqual(["alpha", "default", "zebra"])
	})
})

// =============================================================================
// PROFILE ADD TESTS
// =============================================================================

describe("ocx ghost profile add", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-add-cmd")
		// Initialize ghost mode
		await runGhostCLI(["init"], { XDG_CONFIG_HOME: testDir })
	})

	afterEach(async () => {
		if (originalXdgConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME
		} else {
			process.env.XDG_CONFIG_HOME = originalXdgConfigHome
		}
		await cleanupTempDir(testDir)
	})

	it("should create a new profile", async () => {
		const { exitCode, output } = await runGhostCLI(["profile", "add", "myprofile"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
		expect(output).toContain("Created profile")
		expect(output).toContain("myprofile")

		// Verify it appears in list
		const listResult = await runGhostCLI(["profile", "list", "--json"], {
			XDG_CONFIG_HOME: testDir,
		})
		const json = JSON.parse(listResult.output)
		expect(json.profiles).toContain("myprofile")
	})

	it("should fail for duplicate profile name", async () => {
		await runGhostCLI(["profile", "add", "duplicate"], { XDG_CONFIG_HOME: testDir })

		const { exitCode, output } = await runGhostCLI(["profile", "add", "duplicate"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).not.toBe(0)
		expect(output).toContain("already exists")
	})

	it("should fail for invalid profile name", async () => {
		const { exitCode, output } = await runGhostCLI(["profile", "add", "123invalid"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).not.toBe(0)
		expect(output).toContain("Invalid profile name")
	})

	it("should clone from existing profile with --from", async () => {
		// Update default profile's config
		const showResult = await runGhostCLI(["profile", "show", "default", "--json"], {
			XDG_CONFIG_HOME: testDir,
		})
		expect(showResult.exitCode).toBe(0)

		const { exitCode, output } = await runGhostCLI(
			["profile", "add", "cloned", "--from", "default"],
			{
				XDG_CONFIG_HOME: testDir,
			},
		)

		expect(exitCode).toBe(0)
		expect(output).toContain("cloned from")
	})

	it("should fail cloning from non-existing profile", async () => {
		const { exitCode, output } = await runGhostCLI(
			["profile", "add", "new", "--from", "nonexistent"],
			{
				XDG_CONFIG_HOME: testDir,
			},
		)

		expect(exitCode).not.toBe(0)
		expect(output).toContain("not found")
	})
})

// =============================================================================
// PROFILE REMOVE TESTS
// =============================================================================

describe("ocx ghost profile remove", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-remove-cmd")
		await runGhostCLI(["init"], { XDG_CONFIG_HOME: testDir })
	})

	afterEach(async () => {
		if (originalXdgConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME
		} else {
			process.env.XDG_CONFIG_HOME = originalXdgConfigHome
		}
		await cleanupTempDir(testDir)
	})

	it("should delete a non-current profile without --force", async () => {
		await runGhostCLI(["profile", "add", "toremove"], { XDG_CONFIG_HOME: testDir })

		const { exitCode, output } = await runGhostCLI(["profile", "remove", "toremove"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
		expect(output).toContain("Deleted profile")
	})

	it("should delete a profile with --force", async () => {
		await runGhostCLI(["profile", "add", "toremove"], { XDG_CONFIG_HOME: testDir })

		const { exitCode, output } = await runGhostCLI(["profile", "remove", "toremove", "--force"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
		expect(output).toContain("Deleted profile")

		// Verify it's gone
		const listResult = await runGhostCLI(["profile", "list", "--json"], {
			XDG_CONFIG_HOME: testDir,
		})
		const json = JSON.parse(listResult.output)
		expect(json.profiles).not.toContain("toremove")
	})

	it("should work with rm alias", async () => {
		await runGhostCLI(["profile", "add", "toremove"], { XDG_CONFIG_HOME: testDir })

		const { exitCode } = await runGhostCLI(["profile", "rm", "toremove", "--force"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
	})

	it("should fail for non-existing profile", async () => {
		const { exitCode, output } = await runGhostCLI(
			["profile", "remove", "nonexistent", "--force"],
			{
				XDG_CONFIG_HOME: testDir,
			},
		)

		expect(exitCode).not.toBe(0)
		expect(output).toContain("not found")
	})

	it("should fail deleting current profile without --force", async () => {
		await runGhostCLI(["profile", "add", "backup"], { XDG_CONFIG_HOME: testDir })

		// Without --force, should fail with "cannot delete current profile" error
		const { exitCode, output } = await runGhostCLI(["profile", "remove", "default"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).not.toBe(0)
		expect(output).toContain("Cannot delete current profile")
	})

	it("should allow deleting current profile with --force", async () => {
		await runGhostCLI(["profile", "add", "backup"], { XDG_CONFIG_HOME: testDir })

		const { exitCode } = await runGhostCLI(["profile", "remove", "default", "--force"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
	})

	it("should fail deleting last profile", async () => {
		const { exitCode, output } = await runGhostCLI(["profile", "remove", "default", "--force"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).not.toBe(0)
		expect(output).toContain("Cannot delete the last profile")
	})
})

// =============================================================================
// PROFILE USE TESTS
// =============================================================================

describe("ocx ghost profile use", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-use-cmd")
		await runGhostCLI(["init"], { XDG_CONFIG_HOME: testDir })
	})

	afterEach(async () => {
		if (originalXdgConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME
		} else {
			process.env.XDG_CONFIG_HOME = originalXdgConfigHome
		}
		await cleanupTempDir(testDir)
	})

	it("should switch to specified profile", async () => {
		await runGhostCLI(["profile", "add", "newcurrent"], { XDG_CONFIG_HOME: testDir })

		const { exitCode, output } = await runGhostCLI(["profile", "use", "newcurrent"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
		expect(output).toContain("Switched to profile")

		// Verify current changed
		const listResult = await runGhostCLI(["profile", "list", "--json"], {
			XDG_CONFIG_HOME: testDir,
		})
		const json = JSON.parse(listResult.output)
		expect(json.current).toBe("newcurrent")
	})

	it("should fail for non-existing profile", async () => {
		const { exitCode, output } = await runGhostCLI(["profile", "use", "nonexistent"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).not.toBe(0)
		expect(output).toContain("not found")
	})

	it("should update which profile is marked current in list", async () => {
		await runGhostCLI(["profile", "add", "other"], { XDG_CONFIG_HOME: testDir })
		await runGhostCLI(["profile", "use", "other"], { XDG_CONFIG_HOME: testDir })

		const { output } = await runGhostCLI(["profile", "list"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(output).toContain("* other")
		expect(output).not.toContain("* default")
	})
})

// =============================================================================
// PROFILE SHOW TESTS
// =============================================================================

describe("ocx ghost profile show", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-show-cmd")
		await runGhostCLI(["init"], { XDG_CONFIG_HOME: testDir })
	})

	afterEach(async () => {
		if (originalXdgConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME
		} else {
			process.env.XDG_CONFIG_HOME = originalXdgConfigHome
		}
		await cleanupTempDir(testDir)
	})

	it("should display profile contents", async () => {
		const { exitCode, output } = await runGhostCLI(["profile", "show", "default"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
		expect(output).toContain("Profile: default")
		expect(output).toContain("ghost.jsonc")
	})

	it("should show current profile when no name given", async () => {
		const { exitCode, output } = await runGhostCLI(["profile", "show"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
		expect(output).toContain("Profile: default")
	})

	it("should output JSON with --json flag", async () => {
		const { exitCode, output } = await runGhostCLI(["profile", "show", "--json"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
		const json = JSON.parse(output)
		expect(json.name).toBe("default")
		expect(json.ghost).toBeDefined()
	})

	it("should fail for non-existing profile", async () => {
		const { exitCode, output } = await runGhostCLI(["profile", "show", "nonexistent"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).not.toBe(0)
		expect(output).toContain("not found")
	})

	it("should show file paths in human-readable output", async () => {
		const { output } = await runGhostCLI(["profile", "show", "default"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(output).toContain("Files:")
		expect(output).toContain("ghost.jsonc:")
	})

	it("should show ghost config in output", async () => {
		const { output } = await runGhostCLI(["profile", "show", "default"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(output).toContain("Ghost Config:")
		expect(output).toContain("registries")
	})
})

// =============================================================================
// PROFILE ALIAS TESTS
// =============================================================================

describe("ocx ghost p (profile alias)", () => {
	let testDir: string
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("profile-alias-cmd")
		await runGhostCLI(["init"], { XDG_CONFIG_HOME: testDir })
	})

	afterEach(async () => {
		if (originalXdgConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME
		} else {
			process.env.XDG_CONFIG_HOME = originalXdgConfigHome
		}
		await cleanupTempDir(testDir)
	})

	it("should work with p alias for list", async () => {
		const { exitCode, output } = await runGhostCLI(["p", "list"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
		expect(output).toContain("default")
	})

	it("should work with p alias for add", async () => {
		const { exitCode } = await runGhostCLI(["p", "add", "testprofile"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
	})

	it("should work with p alias for use", async () => {
		await runGhostCLI(["p", "add", "other"], { XDG_CONFIG_HOME: testDir })

		const { exitCode } = await runGhostCLI(["p", "use", "other"], {
			XDG_CONFIG_HOME: testDir,
		})

		expect(exitCode).toBe(0)
	})
})
