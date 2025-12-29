/**
 * Registry client for fetching packages
 */

import type { RegistryIndex, RegistryItem } from "@agentcn/shared"
import { registryIndexSchema, registryItemSchema } from "@agentcn/shared"
import { getRegistryUrl } from "./config"

/** Fetch the registry index */
export async function fetchIndex(registryUrl?: string): Promise<RegistryIndex> {
	const baseUrl = registryUrl ?? (await getRegistryUrl())
	const response = await fetch(`${baseUrl}/index.json`)

	if (!response.ok) {
		throw new Error(`Failed to fetch registry index: ${response.statusText}`)
	}

	const data = await response.json()
	return registryIndexSchema.parse(data)
}

/** Fetch a specific package from the registry */
export async function fetchPackage(name: string, registryUrl?: string): Promise<RegistryItem> {
	const baseUrl = registryUrl ?? (await getRegistryUrl())
	const response = await fetch(`${baseUrl}/${name}.json`)

	if (!response.ok) {
		if (response.status === 404) {
			throw new Error(`Package not found: ${name}`)
		}
		throw new Error(`Failed to fetch package ${name}: ${response.statusText}`)
	}

	const data = await response.json()
	return registryItemSchema.parse(data)
}

/** Resolve all dependencies for a package (recursive) */
export async function resolveDependencies(
	packageName: string,
	registryUrl?: string,
	resolved: Set<string> = new Set(),
): Promise<RegistryItem[]> {
	if (resolved.has(packageName)) return []
	resolved.add(packageName)

	const pkg = await fetchPackage(packageName, registryUrl)
	const deps: RegistryItem[] = [pkg]

	// Resolve registry dependencies recursively
	if (pkg.registryDependencies) {
		for (const depName of pkg.registryDependencies) {
			const depPackages = await resolveDependencies(depName, registryUrl, resolved)
			deps.push(...depPackages)
		}
	}

	return deps
}

/** Search packages by query */
export async function searchPackages(
	query: string,
	registryUrl?: string,
): Promise<RegistryIndex["packages"]> {
	const index = await fetchIndex(registryUrl)
	const lowerQuery = query.toLowerCase()

	return index.packages.filter(
		(pkg) =>
			pkg.name.toLowerCase().includes(lowerQuery) ||
			pkg.description?.toLowerCase().includes(lowerQuery),
	)
}
