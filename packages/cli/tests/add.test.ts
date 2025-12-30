import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test"
import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createTempDir, cleanupTempDir, runCLI, stripJsonc } from "./helpers"
import { startMockRegistry, type MockRegistry } from "./mock-registry"

describe("ocx add", () => {
	let testDir: string
	let registry: MockRegistry

	beforeAll(() => {
		registry = startMockRegistry()
	})

	afterAll(() => {
		registry.stop()
	})

	afterEach(async () => {
		if (testDir) {
			await cleanupTempDir(testDir)
		}
	})

	it("should fail if not initialized", async () => {
		testDir = await createTempDir("add-no-init")
		const { exitCode, output } = await runCLI(["add", "test-comp"], testDir)
		expect(exitCode).not.toBe(0)
		expect(output).toContain("Run 'ocx init' first")
	})

	it("should install a component and its dependencies", async () => {
		testDir = await createTempDir("add-basic")

		// Init and add registry
		await runCLI(["init", "--yes"], testDir)

		// Manually add registry to config since 'ocx registry add' might be flaky in parallel tests
		const configPath = join(testDir, "ocx.jsonc")
		const config = JSON.parse(stripJsonc(await readFile(configPath, "utf-8")))
		config.registries = {
			test: { url: registry.url },
		}
		await writeFile(configPath, JSON.stringify(config, null, 2))

		// Install agent which depends on skill which depends on plugin
		const { exitCode, output } = await runCLI(["add", "kdco-test-agent", "--yes"], testDir)

		if (exitCode !== 0) {
			console.log(output)
		}
		expect(exitCode).toBe(0)

		// Verify files
		expect(existsSync(join(testDir, ".opencode/agent/kdco-test-agent.md"))).toBe(true)
		expect(existsSync(join(testDir, ".opencode/skill/kdco-test-skill/SKILL.md"))).toBe(true)
		expect(existsSync(join(testDir, ".opencode/plugin/kdco-test-plugin.ts"))).toBe(true)

		// Verify lock file
		const lockPath = join(testDir, "ocx.lock")
		expect(existsSync(lockPath)).toBe(true)
		const lock = JSON.parse(stripJsonc(await readFile(lockPath, "utf-8")))
		expect(lock.installed["kdco-test-agent"]).toBeDefined()
		expect(lock.installed["kdco-test-skill"]).toBeDefined()
		expect(lock.installed["kdco-test-plugin"]).toBeDefined()

		// Verify opencode.json patching
		const opencodePath = join(testDir, "opencode.json")
		expect(existsSync(opencodePath)).toBe(true)
		const opencode = JSON.parse(await readFile(opencodePath, "utf-8"))
		expect(opencode.mcp["test-mcp"]).toBeDefined()
		expect(opencode.mcp["test-mcp"].url).toBe("https://mcp.test.com")
	})
})
