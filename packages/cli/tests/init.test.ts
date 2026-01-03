import { afterEach, describe, expect, it } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { cleanupTempDir, createTempDir, parseJsonc, runCLI } from "./helpers"

describe("ocx init", () => {
	let testDir: string

	afterEach(async () => {
		if (testDir) {
			await cleanupTempDir(testDir)
		}
	})

	it("should create ocx.jsonc with default config", async () => {
		testDir = await createTempDir("init-basic")
		const { exitCode, output } = await runCLI(["init", "--yes"], testDir)

		expect(exitCode).toBe(0)
		// Success message from logger.success
		expect(output).toContain("Initialized OCX configuration")

		const configPath = join(testDir, "ocx.jsonc")
		expect(existsSync(configPath)).toBe(true)

		const content = await readFile(configPath, "utf-8")
		const config = parseJsonc(content)
		expect(config.registries).toBeDefined()
		expect(config.lockRegistries).toBe(false)
	})

	it("should warn if ocx.jsonc already exists", async () => {
		testDir = await createTempDir("init-exists")
		const configPath = join(testDir, "ocx.jsonc")
		await Bun.write(configPath, "{}")

		const { exitCode, output } = await runCLI(["init"], testDir)
		expect(exitCode).toBe(0)
		expect(output).toContain("ocx.jsonc already exists")
	})

	it("should output JSON when requested", async () => {
		testDir = await createTempDir("init-json")
		const { exitCode, output } = await runCLI(["init", "--yes", "--json"], testDir)

		expect(exitCode).toBe(0)
		const json = JSON.parse(output)
		expect(json.success).toBe(true)
		expect(json.path).toContain("ocx.jsonc")
	})
})

describe("ocx init --registry", () => {
	let testDir: string

	afterEach(async () => {
		if (testDir) {
			await cleanupTempDir(testDir)
		}
	})

	it("should scaffold registry from local template", async () => {
		testDir = await createTempDir("init-registry-local")

		// Create a mock local template
		const templateDir = join(testDir, "template")
		await mkdir(join(templateDir, "files", "skill", "test-skill"), { recursive: true })
		await writeFile(
			join(templateDir, "registry.json"),
			JSON.stringify({
				$schema: "https://ocx.kdco.dev/.well-known/ocx.json",
				namespace: "my-registry",
				author: "Your Name",
				items: [{ type: "skill", name: "test-skill" }],
			}),
		)
		await writeFile(join(templateDir, "files", "skill", "test-skill", "SKILL.md"), "# Test Skill")
		await writeFile(join(templateDir, "package.json"), '{"name": "my-registry"}')

		const outputDir = join(testDir, "output")
		const { exitCode, output } = await runCLI(
			["init", "--registry", "--local", templateDir, "--namespace", "acme", "--yes"],
			outputDir,
		)

		expect(exitCode).toBe(0)
		expect(output).toContain("Next steps:")

		// Verify files were created
		expect(existsSync(join(outputDir, "registry.json"))).toBe(true)
		expect(existsSync(join(outputDir, "files", "skill", "test-skill", "SKILL.md"))).toBe(true)

		// Verify placeholder replacement
		const registryContent = await readFile(join(outputDir, "registry.json"), "utf-8")
		const registry = JSON.parse(registryContent)
		expect(registry.namespace).toBe("acme")
	})

	it("should replace author placeholder", async () => {
		testDir = await createTempDir("init-registry-author")

		const templateDir = join(testDir, "template")
		await mkdir(templateDir, { recursive: true })
		await writeFile(
			join(templateDir, "registry.json"),
			JSON.stringify({
				namespace: "my-registry",
				author: "Your Name",
			}),
		)

		const outputDir = join(testDir, "output")
		const { exitCode } = await runCLI(
			[
				"init",
				"--registry",
				"--local",
				templateDir,
				"--namespace",
				"test",
				"--author",
				"Jane Doe",
				"--yes",
			],
			outputDir,
		)

		expect(exitCode).toBe(0)

		const registryContent = await readFile(join(outputDir, "registry.json"), "utf-8")
		const registry = JSON.parse(registryContent)
		expect(registry.author).toBe("Jane Doe")
	})

	it("should reject invalid namespace format", async () => {
		testDir = await createTempDir("init-registry-invalid")

		const { exitCode, output } = await runCLI(
			["init", "--registry", "--namespace", "Invalid Namespace!", "--yes"],
			testDir,
		)

		expect(exitCode).toBe(1)
		expect(output).toContain("Invalid namespace format")
	})

	it("should reject namespace with leading hyphen", async () => {
		testDir = await createTempDir("init-registry-leading-hyphen")

		const { exitCode, output } = await runCLI(
			["init", "--registry", "--namespace", "-foo", "--yes"],
			testDir,
		)

		expect(exitCode).toBe(1)
		expect(output).toContain("Invalid namespace format")
	})

	it("should reject namespace with trailing hyphen", async () => {
		testDir = await createTempDir("init-registry-trailing-hyphen")

		const { exitCode, output } = await runCLI(
			["init", "--registry", "--namespace", "foo-", "--yes"],
			testDir,
		)

		expect(exitCode).toBe(1)
		expect(output).toContain("Invalid namespace format")
	})

	it("should reject namespace with consecutive hyphens", async () => {
		testDir = await createTempDir("init-registry-double-hyphen")

		const { exitCode, output } = await runCLI(
			["init", "--registry", "--namespace", "foo--bar", "--yes"],
			testDir,
		)

		expect(exitCode).toBe(1)
		expect(output).toContain("Invalid namespace format")
	})

	it("should output JSON when requested", async () => {
		testDir = await createTempDir("init-registry-json")

		const templateDir = join(testDir, "template")
		await mkdir(templateDir, { recursive: true })
		await writeFile(join(templateDir, "registry.json"), '{"namespace": "my-registry"}')

		const outputDir = join(testDir, "output")
		const { exitCode, output } = await runCLI(
			["init", "--registry", "--local", templateDir, "--namespace", "test", "--yes", "--json"],
			outputDir,
		)

		expect(exitCode).toBe(0)
		const json = JSON.parse(output)
		expect(json.success).toBe(true)
		expect(json.namespace).toBe("test")
	})
})
