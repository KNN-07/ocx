/**
 * OpenCode Config Updater
 *
 * ShadCN-style updater for opencode.json configuration.
 * Component takes precedence - just deep merge, user uses git to review/revert.
 *
 * Key features:
 * - Preserves JSONC comments using jsonc-parser's modify/applyEdits
 * - Direct passthrough of component's opencode block
 * - No "smart" merging - component wins, git is your safety net
 */

import path from "node:path"
import { applyEdits, type ModificationOptions, modify, parse as parseJsonc } from "jsonc-parser"
import type { OpencodeConfig } from "../schemas/registry.js"

// =============================================================================
// TYPES
// =============================================================================

/**
 * The structure of opencode.json file.
 * Mirrors OpencodeConfig from registry.ts exactly.
 */
export interface OpencodeJsonConfig {
	$schema?: string
	mcp?: Record<string, unknown>
	tools?: Record<string, boolean>
	agent?: Record<string, unknown>
	plugin?: string[]
	instructions?: string[]
	permission?: unknown
	[key: string]: unknown
}

export interface UpdateOpencodeJsonConfigResult {
	/** Path to the config file */
	path: string
	/** Whether the file was created (vs updated) */
	created: boolean
	/** Whether any changes were made */
	changed: boolean
}

// =============================================================================
// JSONC MODIFICATION OPTIONS
// =============================================================================

const JSONC_OPTIONS: ModificationOptions = {
	formattingOptions: {
		tabSize: 2,
		insertSpaces: false,
		eol: "\n",
	},
}

// =============================================================================
// FILE OPERATIONS
// =============================================================================

// Minimal template for new opencode.jsonc files
const OPENCODE_CONFIG_TEMPLATE = `{
	"$schema": "https://opencode.ai/config.json"
	// Add MCP servers, tools, plugins here
}
`

/**
 * Ensure opencode.jsonc exists, creating a minimal template if not.
 * This is an upsert operation - does nothing if file already exists.
 * @param cwd - Directory to create the config in
 * @returns Object with path and whether it was created
 */
export async function ensureOpencodeConfig(
	cwd: string,
): Promise<{ path: string; created: boolean }> {
	const jsoncPath = path.join(cwd, "opencode.jsonc")
	const jsonPath = path.join(cwd, "opencode.json")

	// Early exit: config already exists (Law 1)
	const jsoncFile = Bun.file(jsoncPath)
	if (await jsoncFile.exists()) {
		return { path: jsoncPath, created: false }
	}

	const jsonFile = Bun.file(jsonPath)
	if (await jsonFile.exists()) {
		return { path: jsonPath, created: false }
	}

	// Create minimal template
	await Bun.write(jsoncPath, OPENCODE_CONFIG_TEMPLATE)
	return { path: jsoncPath, created: true }
}

/**
 * Read opencode.json or opencode.jsonc from a directory
 * Returns both parsed config and raw content (for comment preservation)
 */
export async function readOpencodeJsonConfig(cwd: string): Promise<{
	config: OpencodeJsonConfig
	content: string
	path: string
} | null> {
	const jsonPath = path.join(cwd, "opencode.json")
	const jsoncPath = path.join(cwd, "opencode.jsonc")

	for (const configPath of [jsoncPath, jsonPath]) {
		const file = Bun.file(configPath)
		if (await file.exists()) {
			const content = await file.text()
			return {
				config: parseJsonc(content, [], { allowTrailingComma: true }) as OpencodeJsonConfig,
				content,
				path: configPath,
			}
		}
	}

	return null
}

/**
 * Write config content to file
 */
async function writeOpencodeJsonConfig(path: string, content: string): Promise<void> {
	await Bun.write(path, content)
}

// =============================================================================
// DEEP MERGE HELPER
// =============================================================================

/**
 * Get the value at a JSON path from content
 */
function getValueAtPath(content: string, path: (string | number)[]): unknown {
	const parsed = parseJsonc(content, [], { allowTrailingComma: true })
	let current: unknown = parsed
	for (const segment of path) {
		if (current === null || current === undefined) return undefined
		if (typeof current !== "object") return undefined
		current = (current as Record<string | number, unknown>)[segment]
	}
	return current
}

/**
 * Apply a value at a JSON path using jsonc-parser (preserves comments).
 * Recursively handles objects and arrays.
 */
function applyValueAtPath(content: string, path: (string | number)[], value: unknown): string {
	if (value === null || value === undefined) {
		return content
	}

	// For objects, check if we can recursively merge or need to replace entirely
	if (typeof value === "object" && !Array.isArray(value)) {
		const existingValue = getValueAtPath(content, path)

		// If existing value is a primitive (string, number, boolean) but new value is an object,
		// we must replace the entire value - can't add properties to a primitive
		if (
			existingValue !== undefined &&
			(existingValue === null || typeof existingValue !== "object")
		) {
			const edits = modify(content, path, value, JSONC_OPTIONS)
			return applyEdits(content, edits)
		}

		// Safe to recursively apply each key
		let updatedContent = content
		for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
			updatedContent = applyValueAtPath(updatedContent, [...path, key], val)
		}
		return updatedContent
	}

	// For arrays, set the entire array (component wins)
	if (Array.isArray(value)) {
		const edits = modify(content, path, value, JSONC_OPTIONS)
		return applyEdits(content, edits)
	}

	// For primitives, set directly
	const edits = modify(content, path, value, JSONC_OPTIONS)
	return applyEdits(content, edits)
}

// =============================================================================
// MAIN UPDATER
// =============================================================================

/**
 * Update opencode.json with component's opencode configuration.
 *
 * ShadCN-style: Component takes precedence.
 * - Deep merges the component's opencode block into existing config
 * - Component values win on conflicts
 * - User uses git to review/revert changes
 */
export async function updateOpencodeJsonConfig(
	cwd: string,
	opencode: OpencodeConfig,
): Promise<UpdateOpencodeJsonConfigResult> {
	const existing = await readOpencodeJsonConfig(cwd)

	let content: string
	let configPath: string
	let created = false

	if (existing) {
		content = existing.content
		configPath = existing.path
	} else {
		// Create new config with schema
		const config: OpencodeJsonConfig = { $schema: "https://opencode.ai/config.json" }
		content = JSON.stringify(config, null, "\t")
		configPath = path.join(cwd, "opencode.jsonc")
		created = true
	}

	const originalContent = content

	// Deep merge each field from the component's opencode block
	content = applyValueAtPath(content, [], opencode)

	const changed = content !== originalContent

	// Only write if there were changes
	if (changed) {
		await writeOpencodeJsonConfig(configPath, content)
	}

	return {
		path: configPath,
		created,
		changed,
	}
}
