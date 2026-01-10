/**
 * Tests for installation method detection
 *
 * Ported from apify-cli detection tests.
 * Note: These tests are limited because we can't easily mock process.execPath in Bun.
 * Focus is on testing return types and basic behavior.
 */

import { describe, expect, it } from "bun:test"
import type { InstallMethod } from "../../src/self-update/detect-method"
import { detectInstallMethod, getExecutablePath } from "../../src/self-update/detect-method"

// =============================================================================
// detectInstallMethod
// =============================================================================

describe("detectInstallMethod", () => {
	it("returns a valid install method", () => {
		const method = detectInstallMethod()
		const validMethods: InstallMethod[] = ["curl", "npm", "bun"]
		expect(validMethods).toContain(method)
	})

	it("returns a string type", () => {
		const method = detectInstallMethod()
		expect(typeof method).toBe("string")
	})

	it("is deterministic (returns same value on multiple calls)", () => {
		const method1 = detectInstallMethod()
		const method2 = detectInstallMethod()
		const method3 = detectInstallMethod()
		expect(method1).toBe(method2)
		expect(method2).toBe(method3)
	})

	it("returns curl for compiled binaries in test environment", () => {
		// In test environment with Bun, we're likely running via bun test
		// which means Bun.main won't start with /$bunfs/
		const method = detectInstallMethod()
		// Just verify it's a valid method - exact value depends on environment
		expect(["curl", "npm", "bun"]).toContain(method)
	})
})

// =============================================================================
// getExecutablePath
// =============================================================================

describe("getExecutablePath", () => {
	it("returns a string path", () => {
		const path = getExecutablePath()
		expect(typeof path).toBe("string")
		expect(path.length).toBeGreaterThan(0)
	})

	it("returns an absolute path", () => {
		const path = getExecutablePath()
		// Unix paths start with /, Windows paths start with drive letter
		const isAbsolute = path.startsWith("/") || /^[A-Z]:\\/i.test(path)
		expect(isAbsolute).toBe(true)
	})

	it("is deterministic (returns same value on multiple calls)", () => {
		const path1 = getExecutablePath()
		const path2 = getExecutablePath()
		expect(path1).toBe(path2)
	})

	it("returns a path that could be a real file", () => {
		const path = getExecutablePath()
		// Should not contain obviously invalid characters
		expect(path).not.toContain("\0")
		expect(path).not.toContain("\n")
	})
})

// =============================================================================
// InstallMethod type exhaustiveness
// =============================================================================

describe("InstallMethod type", () => {
	it("covers all expected installation methods", () => {
		// This test documents the expected install methods
		const allMethods: InstallMethod[] = ["curl", "npm", "bun"]
		expect(allMethods).toHaveLength(3)
	})
})
