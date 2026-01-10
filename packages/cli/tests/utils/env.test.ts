/**
 * Environment Utilities Tests
 *
 * Tests for the environment detection utilities, specifically parseEnvBool.
 */

import { describe, expect, it } from "bun:test"
import { parseEnvBool } from "../../src/utils/env"

// =============================================================================
// parseEnvBool Tests
// =============================================================================

describe("parseEnvBool", () => {
	describe("truthy values", () => {
		const truthyValues = ["true", "TRUE", "True", "1", "yes", "YES", "on", "ON"]

		for (const value of truthyValues) {
			it(`returns true for '${value}'`, () => {
				expect(parseEnvBool(value, false)).toBe(true)
			})
		}
	})

	describe("falsy values", () => {
		const falsyValues = ["false", "FALSE", "False", "0", "no", "NO", "off", "OFF"]

		for (const value of falsyValues) {
			it(`returns false for '${value}'`, () => {
				expect(parseEnvBool(value, true)).toBe(false)
			})
		}
	})

	describe("default handling", () => {
		it("returns default for undefined", () => {
			expect(parseEnvBool(undefined, true)).toBe(true)
			expect(parseEnvBool(undefined, false)).toBe(false)
		})

		it("returns default for empty string", () => {
			expect(parseEnvBool("", true)).toBe(true)
			expect(parseEnvBool("", false)).toBe(false)
		})

		it("returns default for invalid value", () => {
			expect(parseEnvBool("invalid", true)).toBe(true)
			expect(parseEnvBool("maybe", false)).toBe(false)
		})

		it("returns default for random text", () => {
			expect(parseEnvBool("gibberish", true)).toBe(true)
			expect(parseEnvBool("12345", false)).toBe(false)
		})
	})

	describe("whitespace handling", () => {
		it("trims leading whitespace", () => {
			expect(parseEnvBool("  true", false)).toBe(true)
			expect(parseEnvBool("  false", true)).toBe(false)
		})

		it("trims trailing whitespace", () => {
			expect(parseEnvBool("true  ", false)).toBe(true)
			expect(parseEnvBool("false  ", true)).toBe(false)
		})

		it("trims both leading and trailing whitespace", () => {
			expect(parseEnvBool("  true  ", false)).toBe(true)
			expect(parseEnvBool("  false  ", true)).toBe(false)
		})
	})

	describe("case insensitivity", () => {
		it("handles mixed case truthy values", () => {
			expect(parseEnvBool("TrUe", false)).toBe(true)
			expect(parseEnvBool("yEs", false)).toBe(true)
			expect(parseEnvBool("On", false)).toBe(true)
		})

		it("handles mixed case falsy values", () => {
			expect(parseEnvBool("FaLsE", true)).toBe(false)
			expect(parseEnvBool("nO", true)).toBe(false)
			expect(parseEnvBool("oFf", true)).toBe(false)
		})
	})
})
