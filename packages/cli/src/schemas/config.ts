/**
 * Config & Lockfile Helpers
 *
 * Re-exports schemas from ocx-schemas and provides Bun-specific I/O helpers.
 */

import { parse as parseJsonc } from "jsonc-parser"
import { type OcxConfig, type OcxLock, ocxConfigSchema, ocxLockSchema } from "ocx-schemas"

// Re-export schemas and types from ocx-schemas
export {
	type InstalledComponent,
	installedComponentSchema,
	type OcxConfig,
	type OcxLock,
	ocxConfigSchema,
	ocxLockSchema,
	type RegistryConfig,
	registryConfigSchema,
} from "ocx-schemas"

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
