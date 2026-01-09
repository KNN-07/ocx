/**
 * Ghost Mode Config Loader
 *
 * Handles loading, saving, and managing ghost configuration.
 * Supports the new profile system at ~/.config/opencode/profiles/
 * while maintaining backwards compatibility with the legacy
 * ~/.config/ocx/ghost.jsonc location.
 */

import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import path, { dirname, join } from "node:path"
import { type ParseError, parse as parseJsonc, printParseErrorCode } from "jsonc-parser"
import type { output, ZodError, ZodTypeAny } from "zod"
import { ProfileManager } from "../profile/manager.js"
import { getProfileDir, getProfileGhostConfig, getProfileOpencodeConfig } from "../profile/paths.js"
import type { GhostConfig } from "../schemas/ghost.js"
import { ghostConfigSchema } from "../schemas/ghost.js"
import { GhostConfigError, GhostNotInitializedError } from "../utils/errors.js"
import { isAbsolutePath } from "../utils/path-helpers.js"

// =============================================================================
// CONSTANTS
// =============================================================================

const LEGACY_CONFIG_DIR_NAME = "ocx"
const CONFIG_FILE_NAME = "ghost.jsonc"

// =============================================================================
// JSONC PARSING HELPERS
// =============================================================================

/**
 * Format a Zod validation error into actionable, human-readable messages.
 *
 * @param error - The Zod error to format
 * @returns Formatted error string with indented issues
 */
function formatZodError(error: ZodError): string {
	return error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n")
}

/**
 * Parse raw JSONC content with proper error handling.
 *
 * Use this when you need to parse JSONC without schema validation.
 * For schema-validated parsing, use parseJsoncFile instead.
 *
 * @param filePath - Path to the file (for error messages)
 * @param content - Raw file content to parse
 * @returns Parsed JSON value
 * @throws GhostConfigError on syntax errors
 */
function parseRawJsonc(filePath: string, content: string): unknown {
	const errors: ParseError[] = []
	const raw = parseJsonc(content, errors, { allowTrailingComma: true })

	// Guard: Fail fast on JSONC syntax errors with precise location (Law 1 + 4)
	const firstError = errors[0]
	if (firstError) {
		throw new GhostConfigError(
			`Invalid JSON in ${filePath}:\n  Offset ${firstError.offset}: ${printParseErrorCode(firstError.error)}`,
		)
	}

	return raw
}

/**
 * Parse a JSONC file and validate against a Zod schema.
 *
 * Uses the 5 Laws of Elegant Defense:
 * - Early Exit: Fails immediately on syntax errors
 * - Parse Don't Validate: Returns trusted, typed data
 * - Fail Fast: Provides actionable error messages with location info
 *
 * @param filePath - Path to the file (for error messages)
 * @param content - Raw file content to parse
 * @param schema - Zod schema to validate against
 * @returns Parsed and validated data of type T
 * @throws GhostConfigError on syntax errors or validation failures
 */
function parseJsoncFile<T extends ZodTypeAny>(
	filePath: string,
	content: string,
	schema: T,
): output<T> {
	const raw = parseRawJsonc(filePath, content)

	// Parse don't validate: schema transforms to trusted type (Law 2)
	const result = schema.safeParse(raw)
	if (!result.success) {
		throw new GhostConfigError(`Invalid config in ${filePath}:\n${formatZodError(result.error)}`)
	}

	return result.data
}

// =============================================================================
// LEGACY PATH HELPERS (for backwards compatibility)
// =============================================================================

/**
 * Get the legacy ghost config directory path (XDG-compliant).
 * This is the old ~/.config/ocx/ location.
 *
 * @deprecated Use profile-based paths instead
 */
function getLegacyGhostConfigDir(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME

	// XDG spec: only use if set AND absolute path
	if (xdgConfigHome && isAbsolutePath(xdgConfigHome)) {
		return path.join(xdgConfigHome, LEGACY_CONFIG_DIR_NAME)
	}

	return path.join(homedir(), ".config", LEGACY_CONFIG_DIR_NAME)
}

/**
 * Get the legacy ghost config file path.
 * @deprecated Use getProfileGhostConfig instead
 */
function getLegacyGhostConfigPath(): string {
	return join(getLegacyGhostConfigDir(), CONFIG_FILE_NAME)
}

// =============================================================================
// PROFILE-AWARE PATH HELPERS
// =============================================================================

/**
 * Get the ghost config directory path.
 *
 * Priority:
 * 1. Profile override parameter
 * 2. OCX_PROFILE environment variable
 * 3. Legacy ~/.config/ocx/ (for sync calls, actual profile resolution happens in async functions)
 *
 * @param profileOverride - Optional profile name to use
 */
export function getGhostConfigDir(profileOverride?: string): string {
	// If profile override specified, use that profile's directory
	if (profileOverride) {
		return getProfileDir(profileOverride)
	}

	// Check for OCX_PROFILE env var
	const envProfile = process.env.OCX_PROFILE
	if (envProfile) {
		return getProfileDir(envProfile)
	}

	// For sync path resolution, return the legacy path
	// The actual profile resolution happens in async loadGhostConfig
	return getLegacyGhostConfigDir()
}

/**
 * Get the full path to the ghost config file.
 *
 * @param profileOverride - Optional profile name to use
 */
export function getGhostConfigPath(profileOverride?: string): string {
	// If profile specified, use profile-based path
	if (profileOverride) {
		return getProfileGhostConfig(profileOverride)
	}

	// Check for OCX_PROFILE env var
	const envProfile = process.env.OCX_PROFILE
	if (envProfile) {
		return getProfileGhostConfig(envProfile)
	}

	// For sync path resolution, return the legacy path as fallback
	// The actual profile resolution happens in loadGhostConfig
	return getLegacyGhostConfigPath()
}

// =============================================================================
// CONFIG OPERATIONS
// =============================================================================

/**
 * Check if ghost mode is initialized.
 *
 * Checks both the new profile system and legacy location.
 */
export async function ghostConfigExists(): Promise<boolean> {
	const manager = ProfileManager.create()

	// First check new profile system
	if (await manager.isInitialized()) {
		return true
	}

	// Fall back to legacy location check
	const legacyPath = getLegacyGhostConfigPath()
	const file = Bun.file(legacyPath)
	return file.exists()
}

/**
 * Load the ghost config from disk.
 *
 * Uses the profile system if initialized, otherwise falls back to legacy location.
 *
 * @param profileOverride - Optional profile name to load
 * @throws ProfilesNotInitializedError if no profiles and no legacy config
 * @throws GhostConfigError if config file is invalid (syntax or schema)
 */
export async function loadGhostConfig(profileOverride?: string): Promise<GhostConfig> {
	const manager = ProfileManager.create()

	// Try new profile system first
	if (await manager.isInitialized()) {
		const profileName = await manager.getCurrent(profileOverride)
		const profile = await manager.get(profileName)
		return profile.ghost
	}

	// Fall back to legacy location
	const legacyPath = getLegacyGhostConfigPath()
	const file = Bun.file(legacyPath)

	// Guard: Check if legacy file exists (Law 1: Early Exit)
	if (!(await file.exists())) {
		throw new GhostNotInitializedError()
	}

	const content = await file.text()

	// Parse and validate in one step (Law 2: Parse Don't Validate)
	return parseJsoncFile(legacyPath, content, ghostConfigSchema)
}

/**
 * Save the ghost config to disk.
 *
 * Creates the config directory if it doesn't exist.
 * Writes as plain JSON (not JSONC) since we're generating the file.
 *
 * @deprecated Use ProfileManager for profile-based config management
 */
export async function saveGhostConfig(config: GhostConfig): Promise<void> {
	const configPath = getLegacyGhostConfigPath()
	const configDir = dirname(configPath)

	// Ensure config directory exists (recursive is idempotent)
	await mkdir(configDir, { recursive: true })

	// Validate before saving (Law 4: Fail Fast)
	const result = ghostConfigSchema.safeParse(config)
	if (!result.success) {
		throw new GhostConfigError(`Invalid config:\n${formatZodError(result.error)}`)
	}

	const content = JSON.stringify(result.data, null, 2)
	await Bun.write(configPath, content)
}

// =============================================================================
// OPENCODE CONFIG (opencode.jsonc)
// =============================================================================

const OPENCODE_CONFIG_FILE_NAME = "opencode.jsonc"

/**
 * Get the path to the ghost opencode.jsonc file
 *
 * @param profileOverride - Optional profile name to use
 */
export function getGhostOpencodeConfigPath(profileOverride?: string): string {
	// If profile specified, use profile-based path
	if (profileOverride) {
		return getProfileOpencodeConfig(profileOverride)
	}

	// Check for OCX_PROFILE env var
	const envProfile = process.env.OCX_PROFILE
	if (envProfile) {
		return getProfileOpencodeConfig(envProfile)
	}

	// Fall back to legacy location
	return join(getLegacyGhostConfigDir(), OPENCODE_CONFIG_FILE_NAME)
}

/**
 * Load the OpenCode config from the ghost config directory.
 * This is the opencode.jsonc file generated by `ghost add`.
 *
 * Uses atomic read pattern to avoid TOCTOU race condition:
 * Instead of exists() then read(), we attempt the read and handle ENOENT.
 *
 * @param profileOverride - Optional profile name to load from
 * @returns The parsed config object, or empty object if file doesn't exist
 * @throws GhostConfigError if config file has invalid JSON syntax
 */
export async function loadGhostOpencodeConfig(
	profileOverride?: string,
): Promise<Record<string, unknown>> {
	const manager = ProfileManager.create()

	// Try new profile system first
	if (await manager.isInitialized()) {
		const profileName = await manager.getCurrent(profileOverride)
		const profile = await manager.get(profileName)
		return profile.opencode ?? {}
	}

	// Fall back to legacy location
	const configPath = join(getLegacyGhostConfigDir(), OPENCODE_CONFIG_FILE_NAME)

	try {
		const content = await Bun.file(configPath).text()
		return parseRawJsonc(configPath, content) as Record<string, unknown>
	} catch (err) {
		// File doesn't exist - return empty config (Law 1: Early Exit)
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return {}
		}
		// Re-throw other errors (Law 4: Fail Fast)
		throw err
	}
}
