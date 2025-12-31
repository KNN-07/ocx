import { describe, expect, test } from "bun:test"
import { buildFileUrl, buildGitHubRawUrl, buildRegistryUrl } from "./index"

const mockEnv = {
	GITHUB_REPO: "kdcokenny/ocx",
	GITHUB_BRANCH: "main",
	REGISTRY_PREFIX: "kdco",
}

describe("URL Construction", () => {
	describe("buildGitHubRawUrl", () => {
		test("constructs correct base URL", () => {
			const url = buildGitHubRawUrl("owner/repo", "main", "prefix", "some/path.json")
			expect(url).toBe(
				"https://raw.githubusercontent.com/owner/repo/main/registry/src/prefix/some/path.json",
			)
		})

		test("handles different branches", () => {
			const url = buildGitHubRawUrl("owner/repo", "develop", "prefix", "file.ts")
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
			const url = buildFileUrl(mockEnv, "plugin/kdco-background-agents.ts")
			expect(url).toBe(
				"https://raw.githubusercontent.com/kdcokenny/ocx/main/registry/src/kdco/files/plugin/kdco-background-agents.ts",
			)
			// Should NOT contain double "plugin/plugin/"
			expect(url).not.toContain("plugin/plugin/")
		})

		test("constructs skill file URL correctly", () => {
			const url = buildFileUrl(mockEnv, "skill/kdco-plan-protocol/SKILL.md")
			expect(url).toBe(
				"https://raw.githubusercontent.com/kdcokenny/ocx/main/registry/src/kdco/files/skill/kdco-plan-protocol/SKILL.md",
			)
			expect(url).not.toContain("skill/skill/")
		})

		test("constructs agent file URL correctly", () => {
			const url = buildFileUrl(mockEnv, "agent/kdco-librarian.md")
			expect(url).toBe(
				"https://raw.githubusercontent.com/kdcokenny/ocx/main/registry/src/kdco/files/agent/kdco-librarian.md",
			)
			expect(url).not.toContain("agent/agent/")
		})
	})
})
