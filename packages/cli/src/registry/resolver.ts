/**
 * Dependency Resolver with topological sort
 * Based on: https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/registry/resolver.ts
 */

import { mergeDeep } from "remeda"
import type { RegistryConfig } from "../schemas/config.js"
import {
	type ComponentManifest,
	createQualifiedComponent,
	type McpServer,
	type NormalizedComponentManifest,
	normalizeComponentManifest,
	parseQualifiedComponent,
} from "../schemas/registry.js"
import { ConfigError, OCXError, ValidationError } from "../utils/errors.js"
import { fetchComponent } from "./fetcher.js"

/**
 * Parse a component reference into namespace and component name.
 * - "kdco/librarian" -> { namespace: "kdco", component: "librarian" }
 * - "librarian" (with defaultNamespace) -> { namespace: defaultNamespace, component: "librarian" }
 * - "librarian" (without defaultNamespace) -> throws error
 */
export function parseComponentRef(
	ref: string,
	defaultNamespace?: string,
): { namespace: string; component: string } {
	// Check if it's a qualified reference (contains /)
	if (ref.includes("/")) {
		return parseQualifiedComponent(ref)
	}

	// Bare name - use default namespace if provided
	if (defaultNamespace) {
		return { namespace: defaultNamespace, component: ref }
	}

	throw new ValidationError(`Component '${ref}' must include a namespace (e.g., 'kdco/${ref}')`)
}

export interface ResolvedComponent extends NormalizedComponentManifest {
	/** The namespace this component belongs to */
	namespace: string
	/** The registry name from ocx.jsonc */
	registryName: string
	baseUrl: string
	/** Qualified name (namespace/component) */
	qualifiedName: string
}

/** Binding between an agent and its scoped MCP servers */
export interface AgentMcpBinding {
	/** Agent component name (e.g., "librarian") */
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
	mcpServers: Record<string, McpServer>
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
	const mcpServers: Record<string, McpServer> = {}
	const agentMcpBindings: AgentMcpBinding[] = []
	const npmDeps = new Set<string>()
	const npmDevDeps = new Set<string>()
	const disabledTools = new Set<string>()
	const plugins = new Set<string>()
	const agentConfigs: Record<string, Record<string, unknown>> = {}
	const instructionsSet = new Set<string>()

	async function resolve(
		componentNamespace: string,
		componentName: string,
		path: string[] = [],
	): Promise<void> {
		const qualifiedName = createQualifiedComponent(componentNamespace, componentName)

		// Already resolved
		if (resolved.has(qualifiedName)) {
			return
		}

		// Cycle detection
		if (visiting.has(qualifiedName)) {
			const cycle = [...path, qualifiedName].join(" → ")
			throw new ValidationError(`Circular dependency detected: ${cycle}`)
		}

		visiting.add(qualifiedName)

		// Look up the registry for this namespace
		const regConfig = registries[componentNamespace]
		if (!regConfig) {
			throw new ConfigError(
				`Registry '${componentNamespace}' not configured. Add it to ocx.jsonc registries.`,
			)
		}

		// Fetch component from the specific registry
		let component: ComponentManifest
		try {
			component = await fetchComponent(regConfig.url, componentName)
		} catch (_err) {
			throw new OCXError(
				`Component '${componentName}' not found in registry '${componentNamespace}'.`,
				"NOT_FOUND",
			)
		}

		// Resolve dependencies first (depth-first)
		for (const dep of component.dependencies) {
			// Parse dependency: bare name = same namespace, "foo/bar" = cross-namespace
			const depRef = parseComponentRef(dep, componentNamespace)
			await resolve(depRef.namespace, depRef.component, [...path, qualifiedName])
		}

		// Normalize the component (expand Cargo-style shorthands)
		const normalizedComponent = normalizeComponentManifest(component)

		// Add to resolved (dependencies are already added)
		resolved.set(qualifiedName, {
			...normalizedComponent,
			namespace: componentNamespace,
			registryName: componentNamespace,
			baseUrl: regConfig.url,
			qualifiedName,
		})
		visiting.delete(qualifiedName)

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
		// Parse qualified component name (must include namespace)
		const ref = parseComponentRef(name)
		await resolve(ref.namespace, ref.component)
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
