/**
 * Dependency Resolver with topological sort
 * Based on: https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/registry/resolver.ts
 */

import { mergeDeep } from "remeda"
import type { RegistryConfig } from "../schemas/config.js"
import {
	type ComponentManifest,
	type McpServerObject,
	type NormalizedComponentManifest,
	normalizeComponentManifest,
} from "../schemas/registry.js"
import { OCXError, ValidationError } from "../utils/errors.js"
import { fetchComponent } from "./fetcher.js"

export interface ResolvedComponent extends NormalizedComponentManifest {
	registryName: string
	baseUrl: string
}

/** Binding between an agent and its scoped MCP servers */
export interface AgentMcpBinding {
	/** Agent component name (e.g., "kdco-librarian") */
	agentName: string
	/** MCP server names scoped to this agent */
	serverNames: string[]
}

export interface ResolvedDependencies {
	/** All components in dependency order (dependencies first) */
	components: ResolvedComponent[]
	/** Install order (component names) */
	installOrder: string[]
	/** Aggregated MCP servers from all components (normalized to objects) */
	mcpServers: Record<string, McpServerObject>
	/** Agent-to-MCP bindings for agent-scoped servers */
	agentMcpBindings: AgentMcpBinding[]
	/** Aggregated npm dependencies from all components */
	npmDependencies: string[]
	/** Aggregated npm dev dependencies from all components */
	npmDevDependencies: string[]
	/** Tools to disable globally */
	disabledTools: string[]
	/** OpenCode plugins (npm packages) to add to opencode.json plugin array */
	plugins: string[]
	/** Agent configurations to merge into opencode.json agent key */
	agentConfigs: Record<string, Record<string, unknown>>
	/** Global instructions to append to opencode.json instructions array */
	instructions: string[]
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
	const mcpServers: Record<string, McpServerObject> = {}
	const agentMcpBindings: AgentMcpBinding[] = []
	const npmDeps = new Set<string>()
	const npmDevDeps = new Set<string>()
	const disabledTools = new Set<string>()
	const plugins = new Set<string>()
	const agentConfigs: Record<string, Record<string, unknown>> = {}
	const instructionsSet = new Set<string>()

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

		// Normalize the component (expand Cargo-style shorthands)
		const normalizedComponent = normalizeComponentManifest(component)

		// Add to resolved (dependencies are already added)
		resolved.set(name, {
			...normalizedComponent,
			registryName: foundRegistry.name,
			baseUrl: foundRegistry.url,
		})
		visiting.delete(name)

		// Collect MCP servers and track agent bindings
		if (normalizedComponent.mcpServers) {
			const serverNames: string[] = []
			for (const [serverName, config] of Object.entries(normalizedComponent.mcpServers)) {
				// Use already-normalized MCP server from normalizeComponentManifest
				mcpServers[serverName] = config
				serverNames.push(serverName)
			}

			// Track agent-scoped MCP bindings (default scope is "agent")
			const scope = component.mcpScope ?? "agent"
			if (component.type === "ocx:agent" && scope === "agent" && serverNames.length > 0) {
				agentMcpBindings.push({
					agentName: component.name,
					serverNames,
				})
			}
		}

		// Collect npm dependencies
		if (component.npmDependencies) {
			for (const dep of component.npmDependencies) {
				npmDeps.add(dep)
			}
		}
		if (component.npmDevDependencies) {
			for (const dep of component.npmDevDependencies) {
				npmDevDeps.add(dep)
			}
		}

		// Collect disabled tools
		if (component.disabledTools) {
			for (const tool of component.disabledTools) {
				disabledTools.add(tool)
			}
		}

		// Collect opencode config: plugins, agent configs, instructions
		if (component.opencode) {
			// Collect plugins (npm packages for opencode.json plugin array)
			if (component.opencode.plugins) {
				for (const plugin of component.opencode.plugins) {
					plugins.add(plugin)
				}
			}

			// Collect agent configurations
			if (component.opencode.agent) {
				for (const [agentName, config] of Object.entries(component.opencode.agent)) {
					// Deep merge agent configs (later components override earlier ones)
					agentConfigs[agentName] = mergeDeep(agentConfigs[agentName] ?? {}, config)
				}
			}

			// Collect instructions
			if (component.opencode.instructions) {
				for (const instruction of component.opencode.instructions) {
					instructionsSet.add(instruction)
				}
			}

			// Collect tools config (converts to disabledTools for false values)
			if (component.opencode.tools) {
				for (const [tool, enabled] of Object.entries(component.opencode.tools)) {
					if (enabled === false) {
						disabledTools.add(tool)
					}
				}
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
		agentMcpBindings,
		npmDependencies: Array.from(npmDeps),
		npmDevDependencies: Array.from(npmDevDeps),
		disabledTools: Array.from(disabledTools),
		plugins: Array.from(plugins),
		agentConfigs,
		instructions: Array.from(instructionsSet),
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
