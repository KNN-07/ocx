import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { cleanupTempDir, createTempDir, runCLI } from "./helpers"

describe("ocx build", () => {
	let testDir: string

	beforeEach(async () => {
		testDir = await createTempDir("build-test")
	})

	afterEach(async () => {
		await cleanupTempDir(testDir)
	})

	it("should build a valid registry from source", async () => {
		// Create registry source
		const sourceDir = join(testDir, "registry")
		await mkdir(sourceDir, { recursive: true })

		const registryJson = {
			name: "Test Registry",
			prefix: "kdco",
			version: "1.0.0",
			author: "Test Author",
			components: [
				{
					name: "kdco-comp-1",
					type: "ocx:plugin",
					description: "Test component 1",
					files: [{ path: "index.ts", target: ".opencode/plugin/kdco-comp-1.ts" }],
					dependencies: [],
				},
				{
					name: "kdco-comp-2",
					type: "ocx:agent",
					description: "Test component 2",
					files: [{ path: "agent.md", target: ".opencode/agent/kdco-comp-2.md" }],
					dependencies: ["kdco-comp-1"],
				},
			],
		}

		await writeFile(join(sourceDir, "registry.json"), JSON.stringify(registryJson, null, 2))

		// Create the files directory and source files
		const filesDir = join(sourceDir, "files")
		await mkdir(filesDir, { recursive: true })
		await writeFile(join(filesDir, "index.ts"), "// Test plugin content")
		await writeFile(join(filesDir, "agent.md"), "# Test agent content")

		// Run build
		const outDir = "dist"
		const { exitCode, output } = await runCLI(["build", "registry", "--out", outDir], testDir)

		if (exitCode !== 0) {
			console.log(output)
		}
		expect(exitCode).toBe(0)
		expect(output).toContain("Built 2 components")

		// Verify output files
		const fullOutDir = join(testDir, outDir)
		expect(existsSync(join(fullOutDir, "index.json"))).toBe(true)
		expect(existsSync(join(fullOutDir, "components", "kdco-comp-1.json"))).toBe(true)
		expect(existsSync(join(fullOutDir, "components", "kdco-comp-2.json"))).toBe(true)

		// Verify index.json content
		const index = JSON.parse(await readFile(join(fullOutDir, "index.json"), "utf-8"))
		expect(index.name).toBe("Test Registry")
		expect(index.components.length).toBe(2)
		expect(index.components[0].name).toBe("kdco-comp-1")
	})

	it("should fail if component prefix is missing", async () => {
		const sourceDir = join(testDir, "registry-invalid")
		await mkdir(sourceDir, { recursive: true })

		const registryJson = {
			name: "Invalid Registry",
			prefix: "kdco",
			version: "1.0.0",
			author: "Test Author",
			components: [
				{
					name: "wrong-prefix",
					type: "ocx:plugin",
					description: "Invalid component",
					files: [{ path: "index.ts", target: ".opencode/plugin/wrong-prefix.ts" }],
					dependencies: [],
				},
			],
		}

		await writeFile(join(sourceDir, "registry.json"), JSON.stringify(registryJson, null, 2))

		const { exitCode, output } = await runCLI(["build", "registry-invalid"], testDir)

		expect(exitCode).not.toBe(0)
		// Match the actual Zod error message
		expect(output).toContain("All component names must start with the registry prefix")
	})

	it("should fail on missing dependencies", async () => {
		const sourceDir = join(testDir, "registry-missing-dep")
		await mkdir(sourceDir, { recursive: true })

		const registryJson = {
			name: "Missing Dep Registry",
			prefix: "kdco",
			version: "1.0.0",
			author: "Test Author",
			components: [
				{
					name: "kdco-comp",
					type: "ocx:plugin",
					description: "Component with missing dep",
					files: [{ path: "index.ts", target: ".opencode/plugin/kdco-comp.ts" }],
					dependencies: ["kdco-non-existent"],
				},
			],
		}

		await writeFile(join(sourceDir, "registry.json"), JSON.stringify(registryJson, null, 2))

		const { exitCode, output } = await runCLI(["build", "registry-missing-dep"], testDir)

		expect(exitCode).not.toBe(0)
		// Match the actual Zod error message
		expect(output).toContain(
			"All dependencies must reference components that exist in the registry",
		)
	})
})
