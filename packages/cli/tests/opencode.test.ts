import { describe, expect, it } from "bun:test"
import { buildOpenCodeEnv, resolveOpenCodeBinary } from "../src/commands/opencode"

describe("resolveOpenCodeBinary", () => {
	// Table-driven with DIFFERENT values to prove precedence
	const cases = [
		{
			name: "uses bin string when set (highest priority)",
			bin: "/custom/opencode",
			envBin: "/env/opencode",
			expected: ["/custom/opencode"],
		},
		{
			name: "uses envBin when bin not set",
			bin: undefined,
			envBin: "/env/opencode",
			expected: ["/env/opencode"],
		},
		{
			name: "falls back to 'opencode' when neither set",
			bin: undefined,
			envBin: undefined,
			expected: ["opencode"],
		},
		{
			name: "does NOT trim whitespace (preserves as-is)",
			bin: undefined,
			envBin: "   ",
			expected: ["   "], // Whitespace preserved - will cause spawn error
		},
		{
			name: "handles bin as array with executable and args",
			bin: ["node", "serve", "--hostname", "0.0.0.0"],
			envBin: "/env/opencode",
			expected: ["node", "serve", "--hostname", "0.0.0.0"],
		},
		{
			name: "handles bin as array with single executable",
			bin: ["shuvcode"],
			envBin: "/env/opencode",
			expected: ["shuvcode"],
		},
		{
			name: "empty array bin falls back to envBin",
			bin: [],
			envBin: "/env/opencode",
			expected: ["/env/opencode"],
		},
		{
			name: "empty array bin with no envBin falls back to default",
			bin: [],
			envBin: undefined,
			expected: ["opencode"],
		},
	]

	for (const { name, bin, envBin, expected } of cases) {
		it(name, () => {
			const result = resolveOpenCodeBinary({ bin, envBin })
			expect(result).toEqual(expected)
		})
	}

	it("empty string envBin is PRESERVED (nullish coalescing behavior)", () => {
		// Empty string is NOT nullish, so it's preserved (will cause spawn error, but that's intentional)
		// This matches the original ?? semantics: only undefined/null fall through
		const result = resolveOpenCodeBinary({ bin: undefined, envBin: "" })
		expect(result).toEqual([""])
	})

	it("empty string bin is PRESERVED over envBin", () => {
		// Empty string bin takes precedence (nullish coalescing)
		const result = resolveOpenCodeBinary({ bin: "", envBin: "/env/opencode" })
		expect(result).toEqual([""])
	})
})

describe("buildOpenCodeEnv", () => {
	it("sets OPENCODE_DISABLE_PROJECT_CONFIG when disableProjectConfig is true", () => {
		const result = buildOpenCodeEnv({
			baseEnv: {},
			disableProjectConfig: true,
		})
		expect(result.OPENCODE_DISABLE_PROJECT_CONFIG).toBe("true")
	})

	it("does NOT set OPENCODE_DISABLE_PROJECT_CONFIG when false", () => {
		const result = buildOpenCodeEnv({
			baseEnv: {},
			disableProjectConfig: false,
		})
		expect(result.OPENCODE_DISABLE_PROJECT_CONFIG).toBeUndefined()
	})

	it("sets OPENCODE_CONFIG_DIR to profileDir when provided", () => {
		const result = buildOpenCodeEnv({
			baseEnv: {},
			profileDir: "/home/user/.config/opencode/profiles/work",
			disableProjectConfig: true,
		})
		expect(result.OPENCODE_CONFIG_DIR).toBe("/home/user/.config/opencode/profiles/work")
	})

	it("sets OPENCODE_CONFIG_CONTENT as JSON when mergedConfig provided", () => {
		const config = { theme: "dark", nested: { key: "value" } }
		const result = buildOpenCodeEnv({
			baseEnv: {},
			mergedConfig: config,
			disableProjectConfig: true,
		})
		// Parse and compare objects - NOT string comparison
		expect(result.OPENCODE_CONFIG_CONTENT).toBeDefined()
		expect(JSON.parse(result.OPENCODE_CONFIG_CONTENT as string)).toEqual(config)
	})

	it("sets OCX_PROFILE when profileName provided", () => {
		const result = buildOpenCodeEnv({
			baseEnv: {},
			profileName: "work",
			disableProjectConfig: true,
		})
		expect(result.OCX_PROFILE).toBe("work")
	})

	it("preserves existing env vars that are not overwritten", () => {
		const baseEnv = {
			PATH: "/usr/bin",
			HOME: "/home/user",
			CUSTOM_VAR: "custom-value",
		}
		const result = buildOpenCodeEnv({
			baseEnv,
			profileName: "work",
			disableProjectConfig: true,
		})
		// Preserved keys
		expect(result.PATH).toBe("/usr/bin")
		expect(result.HOME).toBe("/home/user")
		expect(result.CUSTOM_VAR).toBe("custom-value")
	})

	it("overwrites conflicting keys with new values (proves merge order)", () => {
		const baseEnv = {
			OCX_PROFILE: "old-profile", // Will be overwritten
			OPENCODE_CONFIG_DIR: "/old/path", // Will be overwritten
			PATH: "/usr/bin", // Will be preserved
		}
		const result = buildOpenCodeEnv({
			baseEnv,
			profileName: "new-profile",
			profileDir: "/new/path",
			disableProjectConfig: true,
		})
		// Overwritten keys
		expect(result.OCX_PROFILE).toBe("new-profile")
		expect(result.OPENCODE_CONFIG_DIR).toBe("/new/path")
		// Preserved keys
		expect(result.PATH).toBe("/usr/bin")
	})

	it("does NOT mutate the original baseEnv object", () => {
		const baseEnv = { OCX_PROFILE: "original" }
		const originalCopy = { ...baseEnv }

		buildOpenCodeEnv({
			baseEnv,
			profileName: "new",
			disableProjectConfig: true,
		})

		// baseEnv should be unchanged
		expect(baseEnv).toEqual(originalCopy)
		expect(baseEnv.OCX_PROFILE).toBe("original")
	})

	it("returns a new object (not the same reference)", () => {
		const baseEnv = { PATH: "/usr/bin" }
		const result = buildOpenCodeEnv({
			baseEnv,
			disableProjectConfig: false,
		})
		expect(result).not.toBe(baseEnv)
	})
})
