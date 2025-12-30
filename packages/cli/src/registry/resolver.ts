/**
 * Dependency Resolver with topological sort
 * Based on: https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/registry/resolver.ts
 */

import type { RegistryConfig } from "../schemas/config.js"
import type { ComponentManifest, McpServer } from "../schemas/registry.js"
import { OCXError, ValidationError } from "../utils/errors.js"
import { fetchComponent } from "./fetcher.js"

export interface ResolvedComponent extends ComponentManifest {
	registryName: string
	baseUrl: string
}

export interface ResolvedDependencies {
	/** All components in dependency order (dependencies first) */
	components: ResolvedComponent[]
	/** Install order (component names) */
	installOrder: string[]
	/** Aggregated MCP servers from all components */
	mcpServers: Record<string, McpServer>
}

/**
 * Resolve all dependencies for a set of components across multiple registries
 * Returns components in topological order (dependencies first)
 */
export async function resolveDependencies(
	registries: Record<string, RegistryConfig>,
	componentNames: string[],
): Promise<ResolvedDependencies> {
	const resolved = new Map<string, ResolvedComponent>()
	const visiting = new Set<string>()
	const mcpServers: Record<string, McpServer> = {}

	async function resolve(name: string, path: string[] = []): Promise<void> {
		// Already resolved
		if (resolved.has(name)) {
			return
		}

		// Cycle detection
		if (visiting.has(name)) {
			const cycle = [...path, name].join(" → ")
			throw new ValidationError(`Circular dependency detected: ${cycle}`)
		}

		visiting.add(name)

		// Find component in any registry
		let component: ComponentManifest | null = null
		let foundRegistry: { name: string; url: string } | null = null

		const registryEntries = Object.entries(registries)

		for (const [regName, regConfig] of registryEntries) {
			try {
				const manifest = await fetchComponent(regConfig.url, name)
				component = manifest
				foundRegistry = { name: regName, url: regConfig.url }
				break
			} catch (_err) {}
		}

		if (!component || !foundRegistry) {
			throw new OCXError(`Component '${name}' not found in any configured registry.`, "NOT_FOUND")
		}

		// Resolve dependencies first (depth-first)
		for (const dep of component.dependencies) {
			await resolve(dep, [...path, name])
		}

		// Add to resolved (dependencies are already added)
		resolved.set(name, {
			...component,
			registryName: foundRegistry.name,
			baseUrl: foundRegistry.url,
		})
		visiting.delete(name)

		// Collect MCP servers
		if (component.mcpServers) {
			for (const [serverName, config] of Object.entries(component.mcpServers)) {
				mcpServers[serverName] = config as McpServer
			}
		}
	}

	// Resolve all requested components
	for (const name of componentNames) {
		await resolve(name)
	}

	// Convert to array (already in topological order due to depth-first)
	const components = Array.from(resolved.values())
	const installOrder = Array.from(resolved.keys())

	return {
		components,
		installOrder,
		mcpServers,
	}
}

/**
 * Check if installing components would create conflicts
 */
export function checkConflicts(existing: string[], toInstall: string[]): string[] {
	const conflicts: string[] = []
	const existingSet = new Set(existing)

	for (const name of toInstall) {
		if (existingSet.has(name)) {
			conflicts.push(name)
		}
	}

	return conflicts
}
