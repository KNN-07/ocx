/**
 * Custom error classes with error codes
 * Following fail-fast philosophy - clear, actionable errors
 */

export type ErrorCode =
	| "NOT_FOUND"
	| "NETWORK_ERROR"
	| "CONFIG_ERROR"
	| "VALIDATION_ERROR"
	| "CONFLICT"
	| "PERMISSION_ERROR"

export const EXIT_CODES = {
	SUCCESS: 0,
	GENERAL: 1,
	NOT_FOUND: 66,
	NETWORK: 69,
	CONFIG: 78,
} as const

export class OCXError extends Error {
	constructor(
		message: string,
		public readonly code: ErrorCode,
		public readonly exitCode: number = EXIT_CODES.GENERAL,
	) {
		super(message)
		this.name = "OCXError"
	}
}

export class NotFoundError extends OCXError {
	constructor(message: string) {
		super(message, "NOT_FOUND", EXIT_CODES.NOT_FOUND)
		this.name = "NotFoundError"
	}
}

export class NetworkError extends OCXError {
	constructor(message: string) {
		super(message, "NETWORK_ERROR", EXIT_CODES.NETWORK)
		this.name = "NetworkError"
	}
}

export class ConfigError extends OCXError {
	constructor(message: string) {
		super(message, "CONFIG_ERROR", EXIT_CODES.CONFIG)
		this.name = "ConfigError"
	}
}

export class ValidationError extends OCXError {
	constructor(message: string) {
		super(message, "VALIDATION_ERROR", EXIT_CODES.GENERAL)
		this.name = "ValidationError"
	}
}

export class ConflictError extends OCXError {
	constructor(message: string) {
		super(message, "CONFLICT", EXIT_CODES.GENERAL)
		this.name = "ConflictError"
	}
}
