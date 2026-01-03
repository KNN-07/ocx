/**
 * Config & Lockfile Schemas
 *
 * Schemas for ocx.jsonc (user config) and ocx.lock (auto-generated lockfile).
 * Note: File I/O helpers remain in CLI package (Bun-specific).
 */

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
 * Key format: "namespace/component" (e.g., "kdco/librarian")
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
