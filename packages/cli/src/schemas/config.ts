/**
 * Config & Lockfile Schemas
 *
 * Schemas for ocx.jsonc (user config) and ocx.lock (auto-generated lockfile).
 * Includes Bun-specific I/O helpers.
 */

import { parse as parseJsonc } from "jsonc-parser"
import { z } from "zod"
import { qualifiedComponentSchema } from "./registry.js"

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
 * Key format: "namespace/component" (e.g., "kdco/researcher")
 */
export const installedComponentSchema = z.object({
	/** Registry namespace this was installed from */
	registry: z.string(),

	/** Version at time of install */
	version: z.string(),

	/** SHA-256 hash of installed files for integrity */
	hash: z.string(),

	/** Target files where installed (clean paths, no namespace prefix) */
	files: z.array(z.string()),

	/** ISO timestamp of installation */
	installedAt: z.string(),

	/** ISO timestamp of last update (optional, only set after update) */
	updatedAt: z.string().optional(),
})

export type InstalledComponent = z.infer<typeof installedComponentSchema>

/**
 * OCX lockfile schema (ocx.lock)
 * Keys are qualified component refs: "namespace/component"
 */
export const ocxLockSchema = z.object({
	/** Lockfile format version */
	lockVersion: z.literal(1),

	/** Installed components, keyed by "namespace/component" */
	installed: z.record(qualifiedComponentSchema, installedComponentSchema).default({}),
})

export type OcxLock = z.infer<typeof ocxLockSchema>

// =============================================================================
// CONFIG FILE HELPERS (Bun-specific I/O)
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
