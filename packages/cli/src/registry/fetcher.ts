/**
 * Registry Fetcher with in-memory caching
 * Based on: https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/registry/fetcher.ts
 */

import type { ComponentManifest, RegistryIndex, McpServer, Packument } from "../schemas/registry.js"
import {
	componentManifestSchema,
	registryIndexSchema,
	packumentSchema,
} from "../schemas/registry.js"
import { NotFoundError, NetworkError, ValidationError } from "../utils/errors.js"

// In-memory cache for deduplication
const cache = new Map<string, Promise<unknown>>()

/**
 * Fetch with caching - deduplicates concurrent requests
 */
async function fetchWithCache<T>(url: string, parse: (data: unknown) => T): Promise<T> {
	const cached = cache.get(url)
	if (cached) {
		return cached as Promise<T>
	}

	const promise = (async () => {
		const response = await fetch(url)

		if (!response.ok) {
			if (response.status === 404) {
				throw new NotFoundError(`Not found: ${url}`)
			}
			throw new NetworkError(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
		}

		const data = await response.json()
		return parse(data)
	})()

	cache.set(url, promise)

	// Clean up cache on error
	promise.catch(() => cache.delete(url))

	return promise
}

/**
 * Clear the fetch cache
 */
export function clearCache(): void {
	cache.clear()
}

/**
 * Fetch registry index
 */
export async function fetchRegistryIndex(baseUrl: string): Promise<RegistryIndex> {
	const url = `${baseUrl.replace(/\/$/, "")}/index.json`

	return fetchWithCache(url, (data) => {
		const result = registryIndexSchema.safeParse(data)
		if (!result.success) {
			throw new ValidationError(`Invalid registry format at ${url}: ${result.error.message}`)
		}
		return result.data
	})
}

/**
 * Fetch a component from registry and return the latest manifest
 */
export async function fetchComponent(baseUrl: string, name: string): Promise<ComponentManifest> {
	const url = `${baseUrl.replace(/\/$/, "")}/components/${name}.json`

	return fetchWithCache(url, (data) => {
		// 1. Parse as packument
		const packumentResult = packumentSchema.safeParse(data)
		if (!packumentResult.success) {
			throw new ValidationError(
				`Invalid packument format for "${name}": ${packumentResult.error.message}`,
			)
		}

		const packument = packumentResult.data
		const latestVersion = packument["dist-tags"].latest
		const manifest = packument.versions[latestVersion]

		if (!manifest) {
			throw new ValidationError(
				`Component "${name}" has no manifest for latest version ${latestVersion}`,
			)
		}

		// 2. Validate manifest
		const manifestResult = componentManifestSchema.safeParse(manifest)
		if (!manifestResult.success) {
			throw new ValidationError(
				`Invalid component manifest for "${name}@${latestVersion}": ${manifestResult.error.message}`,
			)
		}

		return manifestResult.data
	})
}

/**
 * Fetch multiple components in parallel
 */
export async function fetchComponents(
	baseUrl: string,
	names: string[],
): Promise<ComponentManifest[]> {
	const results = await Promise.allSettled(names.map((name) => fetchComponent(baseUrl, name)))

	const components: ComponentManifest[] = []
	const errors: string[] = []

	for (let i = 0; i < results.length; i++) {
		const result = results[i]
		if (result.status === "fulfilled") {
			components.push(result.value)
		} else {
			errors.push(`${names[i]}: ${result.reason.message}`)
		}
	}

	if (errors.length > 0) {
		throw new NetworkError(`Failed to fetch components:\n${errors.join("\n")}`)
	}

	return components
}

/**
 * Check if a component exists in registry
 */
export async function componentExists(baseUrl: string, name: string): Promise<boolean> {
	try {
		await fetchComponent(baseUrl, name)
		return true
	} catch {
		return false
	}
}

/**
 * Fetch actual file content from registry
 */
export async function fetchFileContent(
	baseUrl: string,
	componentName: string,
	filePath: string,
): Promise<string> {
	const url = `${baseUrl.replace(/\/$/, "")}/components/${componentName}/${filePath}`

	const response = await fetch(url)
	if (!response.ok) {
		throw new NetworkError(
			`Failed to fetch file ${filePath} for ${componentName}: ${response.status} ${response.statusText}`,
		)
	}

	return response.text()
}

// Re-export types for convenience
export type { ComponentManifest, RegistryIndex, McpServer }
