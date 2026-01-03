/**
 * Tests for the content utilities module
 * Tests line ending normalization, whitespace trimming, and content comparison
 */

import { describe, expect, it } from "bun:test"
import { isContentIdentical } from "../src/utils/content"

describe("content utilities", () => {
	describe("isContentIdentical", () => {
		it("should return true for identical content", () => {
			const content = "Hello, World!"
			expect(isContentIdentical(content, content)).toBe(true)
		})

		it("should return true for empty strings", () => {
			expect(isContentIdentical("", "")).toBe(true)
		})

		it("should normalize CRLF to LF", () => {
			const unix = "line1\nline2\nline3"
			const windows = "line1\r\nline2\r\nline3"
			expect(isContentIdentical(unix, windows)).toBe(true)
		})

		it("should normalize mixed line endings", () => {
			const mixed = "line1\r\nline2\nline3\r\n"
			const unix = "line1\nline2\nline3\n"
			expect(isContentIdentical(mixed, unix)).toBe(true)
		})

		it("should trim leading whitespace", () => {
			const withSpace = "   Hello"
			const noSpace = "Hello"
			expect(isContentIdentical(withSpace, noSpace)).toBe(true)
		})

		it("should trim trailing whitespace", () => {
			const withSpace = "Hello   "
			const noSpace = "Hello"
			expect(isContentIdentical(withSpace, noSpace)).toBe(true)
		})

		it("should trim leading and trailing newlines", () => {
			const withNewlines = "\n\nHello\n\n"
			const clean = "Hello"
			expect(isContentIdentical(withNewlines, clean)).toBe(true)
		})

		it("should preserve internal whitespace", () => {
			const content1 = "Hello  World"
			const content2 = "Hello World"
			expect(isContentIdentical(content1, content2)).toBe(false)
		})

		it("should preserve internal newlines", () => {
			const content1 = "Hello\n\nWorld"
			const content2 = "Hello\nWorld"
			expect(isContentIdentical(content1, content2)).toBe(false)
		})

		it("should detect different content", () => {
			expect(isContentIdentical("Hello", "World")).toBe(false)
		})

		it("should be case sensitive", () => {
			expect(isContentIdentical("Hello", "hello")).toBe(false)
		})

		it("should handle tabs correctly", () => {
			const withTabs = "\tHello\tWorld\t"
			const clean = "Hello\tWorld"
			// Leading/trailing tabs are trimmed, but internal tabs preserved
			expect(isContentIdentical(withTabs, clean)).toBe(true)
		})

		it("should handle complex multiline content", () => {
			const content1 = `
function hello() {
  console.log("Hello");
}
`
			const content2 = `function hello() {
  console.log("Hello");
}`
			expect(isContentIdentical(content1, content2)).toBe(true)
		})

		it("should handle CRLF in multiline content", () => {
			const unix = "line1\n  indented\nline3"
			const windows = "line1\r\n  indented\r\nline3"
			expect(isContentIdentical(unix, windows)).toBe(true)
		})

		it("should handle whitespace-only content", () => {
			const spaces = "   "
			const empty = ""
			expect(isContentIdentical(spaces, empty)).toBe(true)
		})

		it("should handle newlines-only content", () => {
			const newlines = "\n\n\n"
			const empty = ""
			expect(isContentIdentical(newlines, empty)).toBe(true)
		})

		it("should handle content with only CRLF", () => {
			const crlf = "\r\n\r\n"
			const empty = ""
			expect(isContentIdentical(crlf, empty)).toBe(true)
		})

		it("should handle unicode content", () => {
			const content = "Hello 世界 🌍"
			expect(isContentIdentical(content, content)).toBe(true)
			expect(isContentIdentical(`  ${content}  `, content)).toBe(true)
		})

		it("should handle very long content", () => {
			const long1 = "a".repeat(10000)
			const long2 = "a".repeat(10000)
			expect(isContentIdentical(long1, long2)).toBe(true)
		})

		it("should detect single character difference in long content", () => {
			const long1 = "a".repeat(10000)
			const long2 = `${"a".repeat(5000)}b${"a".repeat(4999)}`
			expect(isContentIdentical(long1, long2)).toBe(false)
		})
	})
})
