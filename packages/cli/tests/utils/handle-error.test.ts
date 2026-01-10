/**
 * Error Handler Tests
 *
 * Tests for the error handling utilities, specifically wrapAction.
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { wrapAction } from "../../src/utils/handle-error"

// =============================================================================
// wrapAction Tests
// =============================================================================

describe("wrapAction", () => {
	let consoleErrorSpy: ReturnType<typeof spyOn>
	let processExitSpy: ReturnType<typeof spyOn>

	beforeEach(() => {
		// Mock console.error to prevent test noise
		consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
		// Mock process.exit to prevent test termination
		processExitSpy = spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit called")
		})
	})

	afterEach(() => {
		consoleErrorSpy.mockRestore()
		processExitSpy.mockRestore()
	})

	it("calls the wrapped action with arguments", async () => {
		const action = mock((..._args: unknown[]) => Promise.resolve())
		const wrapped = wrapAction(action)

		await wrapped("arg1", "arg2")

		expect(action).toHaveBeenCalledWith("arg1", "arg2")
	})

	it("calls the wrapped action with multiple arguments of different types", async () => {
		const action = mock((_str: string, _num: number, _obj: { key: string }) => Promise.resolve())
		const wrapped = wrapAction(action)

		await wrapped("test", 42, { key: "value" })

		expect(action).toHaveBeenCalledWith("test", 42, { key: "value" })
	})

	it("returns undefined for successful actions", async () => {
		const action = mock(() => Promise.resolve())
		const wrapped = wrapAction(action)

		const result = await wrapped()

		expect(result).toBeUndefined()
	})

	it("handles sync actions that return void", async () => {
		const action = mock(() => {
			// Sync action that returns void
		})
		const wrapped = wrapAction(action)

		const result = await wrapped()

		expect(result).toBeUndefined()
		expect(action).toHaveBeenCalled()
	})

	it("catches errors and calls handleError", async () => {
		const error = new Error("Test error")
		const action = mock(() => Promise.reject(error))
		const wrapped = wrapAction(action)

		// wrapAction calls handleError which calls process.exit
		// Our mock throws, so we expect that
		await expect(wrapped()).rejects.toThrow("process.exit called")

		// Verify error handling was triggered
		expect(consoleErrorSpy).toHaveBeenCalled()
	})

	it("catches sync errors and calls handleError", async () => {
		const action = mock(() => {
			throw new Error("Sync error")
		})
		const wrapped = wrapAction(action)

		// wrapAction calls handleError which calls process.exit
		await expect(wrapped()).rejects.toThrow("process.exit called")

		// Verify error handling was triggered
		expect(consoleErrorSpy).toHaveBeenCalled()
	})

	it("preserves the async nature of the wrapped action", async () => {
		let resolved = false
		const action = mock(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10))
			resolved = true
		})
		const wrapped = wrapAction(action)

		const promise = wrapped()
		expect(resolved).toBe(false)

		await promise
		expect(resolved).toBe(true)
	})

	it("works with no arguments", async () => {
		const action = mock(() => Promise.resolve())
		const wrapped = wrapAction(action)

		await wrapped()

		expect(action).toHaveBeenCalledWith()
	})
})
