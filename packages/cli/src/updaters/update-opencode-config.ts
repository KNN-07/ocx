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

/**
 * Read opencode.json or opencode.jsonc from a directory
 * Returns both parsed config and raw content (for comment preservation)
 */
export async function readOpencodeJsonConfig(cwd: string): Promise<{
	config: OpencodeJsonConfig
	content: string
	path: string
} | null> {
	const jsonPath = `${cwd}/opencode.json`
	const jsoncPath = `${cwd}/opencode.jsonc`

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
 * Apply a value at a JSON path using jsonc-parser (preserves comments).
 * Recursively handles objects and arrays.
 */
function applyValueAtPath(content: string, path: (string | number)[], value: unknown): string {
	if (value === null || value === undefined) {
		return content
	}

	// For objects, recursively apply each key
	if (typeof value === "object" && !Array.isArray(value)) {
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
		configPath = `${cwd}/opencode.jsonc`
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
