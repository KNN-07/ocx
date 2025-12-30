/**
 * JSON output utilities for CI/CD integration
 * Following GitHub CLI patterns for consistent --json flag handling
 */

import { type ErrorCode, EXIT_CODES, OCXError } from "./errors.js"

// JSON response envelope
export interface JsonResponse<T = unknown> {
	success: boolean
	data?: T
	error?: {
		code: ErrorCode
		message: string
	}
	meta?: {
		timestamp: string
		version: string
	}
}

// Global JSON mode state
let jsonMode = false

export function setJsonMode(enabled: boolean): void {
	jsonMode = enabled
}

export function isJsonMode(): boolean {
	return jsonMode
}

/**
 * Output data as JSON
 */
export function outputJson(data: unknown): void {
	console.log(JSON.stringify(data, null, 2))
}

/**
 * Output success response
 */
export function outputSuccess<T>(data: T): void {
	const response: JsonResponse<T> = {
		success: true,
		data,
		meta: {
			timestamp: new Date().toISOString(),
			version: "0.1.0",
		},
	}
	outputJson(response)
}

/**
 * Output error response
 */
export function outputError(code: ErrorCode, message: string): void {
	const response: JsonResponse = {
		success: false,
		error: { code, message },
		meta: {
			timestamp: new Date().toISOString(),
			version: "0.1.0",
		},
	}
	outputJson(response)
}

/**
 * Get exit code for error code
 */
export function getExitCode(code: ErrorCode): number {
	switch (code) {
		case "NOT_FOUND":
			return EXIT_CODES.NOT_FOUND
		case "NETWORK_ERROR":
			return EXIT_CODES.NETWORK
		case "CONFIG_ERROR":
		case "VALIDATION_ERROR":
			return EXIT_CODES.CONFIG
		default:
			return EXIT_CODES.GENERAL
	}
}

/**
 * Wrap a command handler to support JSON output mode
 */
export function withJsonOutput<T extends (...args: unknown[]) => Promise<void>>(handler: T): T {
	return (async (...args: unknown[]) => {
		try {
			await handler(...args)
		} catch (error) {
			if (isJsonMode()) {
				if (error instanceof OCXError) {
					outputError(error.code, error.message)
					process.exit(error.exitCode)
				}
				const message = error instanceof Error ? error.message : String(error)
				outputError("VALIDATION_ERROR", message)
				process.exit(EXIT_CODES.GENERAL)
			}
			throw error
		}
	}) as T
}
