import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { registrySchema } from "ocx-schemas"
import { buildFileUrl, buildGitHubRawUrl, buildRegistryUrl } from "./index"

/** Absolute path to registry.json - resolves correctly regardless of CWD */
const REGISTRY_PATH = join(import.meta.dir, "../../../registry/src/kdco/registry.json")

const mockEnv = {
	GITHUB_REPO: "kdcokenny/ocx",
	GITHUB_BRANCH: "main",
	REGISTRY_NAMESPACE: "kdco",
}

describe("URL Construction", () => {
	describe("buildGitHubRawUrl", () => {
		test("constructs correct base URL", () => {
			const url = buildGitHubRawUrl("owner/repo", "main", "namespace", "some/path.json")
			expect(url).toBe(
				"https://raw.githubusercontent.com/owner/repo/main/registry/src/namespace/some/path.json",
			)
		})

		test("handles different branches", () => {
			const url = buildGitHubRawUrl("owner/repo", "develop", "namespace", "file.ts")
			expect(url).toContain("/develop/")
		})
	})

	describe("buildRegistryUrl", () => {
		test("constructs registry.json URL", () => {
			const url = buildRegistryUrl(mockEnv)
			expect(url).toBe(
				"https://raw.githubusercontent.com/kdcokenny/ocx/main/registry/src/kdco/registry.json",
			)
		})
	})

	describe("buildFileUrl", () => {
		test("constructs file URL without duplicating path segments", () => {
			// This is the bug we fixed - filePath already contains "plugin/"
			const url = buildFileUrl(mockEnv, "plugin/background-agents.ts")
			expect(url).toBe(
				"https://raw.githubusercontent.com/kdcokenny/ocx/main/registry/src/kdco/files/plugin/background-agents.ts",
			)
			// Should NOT contain double "plugin/plugin/"
			expect(url).not.toContain("plugin/plugin/")
		})

		test("constructs skill file URL correctly", () => {
			const url = buildFileUrl(mockEnv, "skill/plan-protocol/SKILL.md")
			expect(url).toBe(
				"https://raw.githubusercontent.com/kdcokenny/ocx/main/registry/src/kdco/files/skill/plan-protocol/SKILL.md",
			)
			expect(url).not.toContain("skill/skill/")
		})

		test("constructs agent file URL correctly", () => {
			const url = buildFileUrl(mockEnv, "agent/librarian.md")
			expect(url).toBe(
				"https://raw.githubusercontent.com/kdcokenny/ocx/main/registry/src/kdco/files/agent/librarian.md",
			)
			expect(url).not.toContain("agent/agent/")
		})
	})
})

describe("Registry Schema Validation", () => {
	test("kdco/registry.json validates against Zod schema", async () => {
		// Read the registry.json file
		const registryFile = Bun.file(REGISTRY_PATH)
		const registryContent = await registryFile.text()
		const registryData = JSON.parse(registryContent)

		// Validate against the schema - this catches drift between registry data and schema
		const result = registrySchema.safeParse(registryData)

		if (!result.success) {
			// Provide detailed error message for debugging
			console.error("Schema validation errors:", JSON.stringify(result.error.format(), null, 2))
		}

		expect(result.success).toBe(true)
	})

	test("registry.json has all required fields", async () => {
		const registryFile = Bun.file(REGISTRY_PATH)
		const registryData = JSON.parse(await registryFile.text())

		expect(registryData.name).toBeDefined()
		expect(registryData.namespace).toBeDefined()
		expect(registryData.version).toBeDefined()
		expect(registryData.author).toBeDefined()
		expect(registryData.components).toBeArray()
	})

	test("all components have valid structure", async () => {
		const registryFile = Bun.file(REGISTRY_PATH)
		const registryData = JSON.parse(await registryFile.text())

		for (const component of registryData.components) {
			expect(component.name).toBeDefined()
			expect(component.type).toMatch(/^ocx:/)
			expect(component.description).toBeDefined()
			expect(component.files).toBeArray()
			expect(component.dependencies).toBeArray()
		}
	})

	test("all internal dependencies reference existing components", async () => {
		const registryFile = Bun.file(REGISTRY_PATH)
		const registryData = JSON.parse(await registryFile.text())

		const componentNames = new Set(registryData.components.map((c: { name: string }) => c.name))

		for (const component of registryData.components) {
			for (const dep of component.dependencies) {
				// Only validate bare dependencies (same namespace)
				if (!dep.includes("/")) {
					expect(componentNames.has(dep)).toBe(true)
				}
			}
		}
	})
})
