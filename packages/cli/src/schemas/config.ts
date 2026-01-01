/**
 * Config & Lockfile Schemas
 *
 * Schemas for ocx.jsonc (user config) and ocx.lock (auto-generated lockfile).
 */

import { parse as parseJsonc } from "jsonc-parser"
import { z } from "zod"
import { mcpServerSchema } from "./registry.js"

// =============================================================================
// OCX CONFIG SCHEMA (ocx.jsonc)
// =============================================================================

/**
 * Registry configuration in ocx.jsonc
 */
export const registryConfigSchema = z.object({
	/** Registry URL */
	url: z.string().url("Registry URL must be a valid URL"),

	/** Optional version pin */
	version: z.string().optional(),

	/** Optional auth headers (supports ${ENV_VAR} expansion) */
	headers: z.record(z.string()).optional(),
})

export type RegistryConfig = z.infer<typeof registryConfigSchema>

/**
 * Main OCX config schema (ocx.jsonc)
 */
export const ocxConfigSchema = z.object({
	/** Schema URL for IDE support */
	$schema: z.string().optional(),

	/** Configured registries */
	registries: z.record(registryConfigSchema).default({}),

	/** Lock registries - prevent adding/removing (enterprise feature) */
	lockRegistries: z.boolean().default(false),
})

export type OcxConfig = z.infer<typeof ocxConfigSchema>

// =============================================================================
// OCX LOCKFILE SCHEMA (ocx.lock)
// =============================================================================

/**
 * Installed component entry in lockfile
 */
export const installedComponentSchema = z.object({
	/** Registry this was installed from */
	registry: z.string(),

	/** Version at time of install */
	version: z.string(),

	/** SHA-256 hash of installed files for integrity */
	hash: z.string(),

	/** Target path where installed */
	target: z.string(),

	/** ISO timestamp of installation */
	installedAt: z.string(),
})

export type InstalledComponent = z.infer<typeof installedComponentSchema>

/**
 * OCX lockfile schema (ocx.lock)
 */
export const ocxLockSchema = z.object({
	/** Lockfile format version */
	lockVersion: z.literal(1),

	/** Installed components */
	installed: z.record(installedComponentSchema).default({}),
})

export type OcxLock = z.infer<typeof ocxLockSchema>

// =============================================================================
// OPENCODE.JSON MODIFICATION SCHEMAS
// =============================================================================

/**
 * MCP server config for opencode.json
 */
export const opencodeMcpSchema = z.record(mcpServerSchema)

/**
 * Agent config for opencode.json
 */
export const opencodeAgentSchema = z.object({
	disable: z.boolean().optional(),
	tools: z.record(z.boolean()).optional(),
	temperature: z.number().min(0).max(2).optional(),
	prompt: z.string().optional(),
	permission: z.record(z.enum(["allow", "deny"])).optional(),
})

/**
 * Partial opencode.json schema (what OCX modifies)
 */
export const opencodeConfigPatchSchema = z.object({
	/** Default agent */
	default_agent: z.string().optional(),

	/** MCP servers */
	mcp: opencodeMcpSchema.optional(),

	/** Tool configuration */
	tools: z.record(z.boolean()).optional(),

	/** Agent configuration */
	agent: z.record(opencodeAgentSchema).optional(),

	/** NPM plugins */
	plugin: z.array(z.string()).optional(),

	/** Global instructions */
	instructions: z.array(z.string()).optional(),
})

export type OpencodeConfigPatch = z.infer<typeof opencodeConfigPatchSchema>

// =============================================================================
// SCHEMA INDEX
// =============================================================================

export const schemas = {
	config: ocxConfigSchema,
	lock: ocxLockSchema,
	registryConfig: registryConfigSchema,
	installedComponent: installedComponentSchema,
	opencodeConfigPatch: opencodeConfigPatchSchema,
} as const

// =============================================================================
// CONFIG FILE HELPERS
// =============================================================================

const CONFIG_FILE = "ocx.jsonc"
const LOCK_FILE = "ocx.lock"

/**
 * Read ocx.jsonc config file
 */
export async function readOcxConfig(cwd: string): Promise<OcxConfig | null> {
	const configPath = `${cwd}/${CONFIG_FILE}`
	const file = Bun.file(configPath)

	if (!(await file.exists())) {
		return null
	}

	const content = await file.text()
	try {
		const json = parseJsonc(content, [], { allowTrailingComma: true })
		return ocxConfigSchema.parse(json)
	} catch (error) {
		// If parsing fails, we want to know why
		console.error(`Error parsing ${configPath}:`, error)
		throw error
	}
}

/**
 * Write ocx.jsonc config file
 */
export async function writeOcxConfig(cwd: string, config: OcxConfig): Promise<void> {
	const configPath = `${cwd}/${CONFIG_FILE}`
	const content = JSON.stringify(config, null, 2)
	await Bun.write(configPath, content)
}

/**
 * Read ocx.lock lockfile
 */
export async function readOcxLock(cwd: string): Promise<OcxLock | null> {
	const lockPath = `${cwd}/${LOCK_FILE}`
	const file = Bun.file(lockPath)

	if (!(await file.exists())) {
		return null
	}

	const content = await file.text()
	const json = parseJsonc(content, [], { allowTrailingComma: true })
	return ocxLockSchema.parse(json)
}

/**
 * Write ocx.lock lockfile
 */
export async function writeOcxLock(cwd: string, lock: OcxLock): Promise<void> {
	const lockPath = `${cwd}/${LOCK_FILE}`
	const content = JSON.stringify(lock, null, 2)
	await Bun.write(lockPath, content)
}
