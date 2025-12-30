/**
 * Error handler for CLI commands
 * Converts errors to user-friendly output with proper exit codes
 */

import { ZodError } from "zod"

import { EXIT_CODES, OCXError } from "./errors"
import { logger } from "./logger"

export interface HandleErrorOptions {
	json?: boolean
}

/**
 * Handle errors consistently across all commands
 * Fail-fast: exit immediately with appropriate code
 */
export function handleError(error: unknown, options: HandleErrorOptions = {}): never {
	// JSON mode: structured output
	if (options.json) {
		const output = formatErrorAsJson(error)
		console.log(JSON.stringify(output, null, 2))
		process.exit(output.exitCode)
	}

	// OCX errors: known errors with codes
	if (error instanceof OCXError) {
		logger.error(error.message)
		process.exit(error.exitCode)
	}

	// Zod validation errors: format nicely
	if (error instanceof ZodError) {
		logger.error("Validation failed:")
		for (const issue of error.issues) {
			const path = issue.path.join(".")
			logger.error(`  ${path}: ${issue.message}`)
		}
		process.exit(EXIT_CODES.CONFIG)
	}

	// Unknown errors
	if (error instanceof Error) {
		logger.error(error.message)
		if (process.env.DEBUG) {
			console.error(error.stack)
		}
	} else {
		logger.error("An unknown error occurred")
	}

	process.exit(EXIT_CODES.GENERAL)
}

interface JsonErrorOutput {
	success: false
	error: {
		code: string
		message: string
	}
	exitCode: number
	meta: {
		timestamp: string
	}
}

function formatErrorAsJson(error: unknown): JsonErrorOutput {
	if (error instanceof OCXError) {
		return {
			success: false,
			error: {
				code: error.code,
				message: error.message,
			},
			exitCode: error.exitCode,
			meta: {
				timestamp: new Date().toISOString(),
			},
		}
	}

	if (error instanceof ZodError) {
		return {
			success: false,
			error: {
				code: "VALIDATION_ERROR",
				message: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
			},
			exitCode: EXIT_CODES.CONFIG,
			meta: {
				timestamp: new Date().toISOString(),
			},
		}
	}

	return {
		success: false,
		error: {
			code: "UNKNOWN_ERROR",
			message: error instanceof Error ? error.message : "An unknown error occurred",
		},
		exitCode: EXIT_CODES.GENERAL,
		meta: {
			timestamp: new Date().toISOString(),
		},
	}
}
