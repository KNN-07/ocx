/**
 * OpenCode Config Updater
 *
 * ShadCN-style updater for opencode.json configuration.
 * Handles MCP server definitions, global tool settings, and per-agent tool scoping.
 *
 * Key features:
 * - Preserves JSONC comments using jsonc-parser's modify/applyEdits
 * - Non-destructive updates (only modifies specified paths, preserves rest)
 * - Agent-scoped MCP servers (disabled globally, enabled per-agent)
 */

import { applyEdits, type ModificationOptions, modify, parse as parseJsonc } from "jsonc-parser"
import { mergeDeep } from "remeda"
import type { McpServer, AgentConfig as RegistryAgentConfig } from "../schemas/registry.js"

// =============================================================================
// TYPES
// =============================================================================

export interface OpencodeConfig {
	$schema?: string
	mcp?: Record<string, McpServerConfig>
	tools?: Record<string, boolean>
	agent?: Record<string, AgentConfig>
	default_agent?: string
	[key: string]: unknown
}

export interface McpServerConfig {
	type: "remote" | "local"
	url?: string
	command?: string[]
	args?: string[]
	headers?: Record<string, string>
	oauth?: boolean
	enabled?: boolean
	environment?: Record<string, string>
}

export interface AgentConfig {
	disable?: boolean
	tools?: Record<string, boolean>
	[key: string]: unknown
}

/** Binding between an agent and its owned MCP servers */
export interface AgentMcpBinding {
	/** Agent name (e.g., "kdco-librarian") */
	agentName: string
	/** MCP server names owned by this agent */
	serverNames: string[]
}

export interface UpdateOpencodeConfigOptions {
	/** MCP servers to add (global scope) - already normalized to objects */
	mcpServers?: Record<string, McpServer>
	/** Agent-to-MCP bindings for scoped access */
	agentMcpBindings?: AgentMcpBinding[]
	/** Default agent to set (if not already set) */
	defaultAgent?: string
	/** Tools to disable globally (e.g., ["WebFetch"]) */
	disabledTools?: string[]
	/** NPM plugin packages to add to opencode.json 'plugin' array */
	plugins?: string[]
	/** Per-agent configuration to merge into opencode.json 'agent' key */
	agentConfigs?: Record<string, RegistryAgentConfig>
	/** Global instructions to append to opencode.json 'instructions' array */
	instructions?: string[]
}

export interface UpdateOpencodeConfigResult {
	/** Path to the config file */
	path: string
	/** Whether the file was created (vs updated) */
	created: boolean
	/** MCP servers that were added */
	mcpAdded: string[]
	/** MCP servers that were skipped (already exist) */
	mcpSkipped: string[]
	/** Agents that had tools configured */
	agentsConfigured: string[]
	/** Tools that were disabled globally */
	toolsDisabled: string[]
	/** Plugins that were added */
	pluginsAdded: string[]
	/** Instructions that were appended */
	instructionsAdded: string[]
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
export async function readOpencodeConfig(cwd: string): Promise<{
	config: OpencodeConfig
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
				config: parseJsonc(content, [], { allowTrailingComma: true }) as OpencodeConfig,
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
async function writeOpencodeConfig(path: string, content: string): Promise<void> {
	await Bun.write(path, content)
}

// =============================================================================
// CONFIG MODIFICATION FUNCTIONS
// =============================================================================

/**
 * Add MCP server definitions to config
 * Returns list of added and skipped server names
 */
function applyMcpServers(
	content: string,
	config: OpencodeConfig,
	mcpServers: Record<string, McpServer>,
): { content: string; added: string[]; skipped: string[] } {
	const added: string[] = []
	const skipped: string[] = []
	let updatedContent = content

	const existingMcp = config.mcp ?? {}

	for (const [name, server] of Object.entries(mcpServers)) {
		if (existingMcp[name]) {
			skipped.push(name)
			continue
		}

		// Build server config
		const serverConfig: McpServerConfig = {
			type: server.type,
		}

		if (server.type === "remote" && server.url) {
			serverConfig.url = server.url
		}
		if (server.type === "local" && server.command) {
			serverConfig.command = server.command
		}
		if (server.args) {
			serverConfig.args = server.args
		}
		if (server.headers) {
			serverConfig.headers = server.headers
		}
		if (server.oauth !== undefined) {
			serverConfig.oauth = server.oauth
		}
		if (server.enabled !== undefined) {
			serverConfig.enabled = server.enabled
		}
		if (server.environment) {
			serverConfig.environment = server.environment
		}

		// Apply edit using jsonc-parser (preserves comments)
		const edits = modify(updatedContent, ["mcp", name], serverConfig, JSONC_OPTIONS)
		updatedContent = applyEdits(updatedContent, edits)
		added.push(name)
	}

	return { content: updatedContent, added, skipped }
}

/**
 * Disable MCP tools globally
 * Sets tools: { "servername_*": false } for each server
 */
function applyGlobalToolDisables(content: string, serverNames: string[]): string {
	let updatedContent = content

	for (const name of serverNames) {
		const toolPattern = `${name}_*`
		const edits = modify(updatedContent, ["tools", toolPattern], false, JSONC_OPTIONS)
		updatedContent = applyEdits(updatedContent, edits)
	}

	return updatedContent
}

/**
 * Disable specific tools globally
 * Sets tools: { "ToolName": false } for each tool
 */
function applyDisabledTools(content: string, toolNames: string[]): string {
	let updatedContent = content

	for (const name of toolNames) {
		const edits = modify(updatedContent, ["tools", name], false, JSONC_OPTIONS)
		updatedContent = applyEdits(updatedContent, edits)
	}

	return updatedContent
}

/**
 * Enable MCP tools for specific agents
 * Sets agent.NAME.tools: { "servername_*": true }
 */
function applyAgentToolEnables(
	content: string,
	bindings: AgentMcpBinding[],
): {
	content: string
	agentsConfigured: string[]
} {
	let updatedContent = content
	const agentsConfigured: string[] = []

	for (const binding of bindings) {
		for (const serverName of binding.serverNames) {
			const toolPattern = `${serverName}_*`
			const edits = modify(
				updatedContent,
				["agent", binding.agentName, "tools", toolPattern],
				true,
				JSONC_OPTIONS,
			)
			updatedContent = applyEdits(updatedContent, edits)
		}
		if (binding.serverNames.length > 0) {
			agentsConfigured.push(binding.agentName)
		}
	}

	return { content: updatedContent, agentsConfigured: [...new Set(agentsConfigured)] }
}

/**
 * Set default agent if not already set
 */
function applyDefaultAgent(content: string, config: OpencodeConfig, defaultAgent: string): string {
	if (config.default_agent) {
		return content
	}

	const edits = modify(content, ["default_agent"], defaultAgent, JSONC_OPTIONS)
	return applyEdits(content, edits)
}

/**
 * Add plugin packages to opencode.json 'plugin' array
 * Returns list of added plugins (skips duplicates)
 */
function applyPlugins(
	content: string,
	config: OpencodeConfig,
	plugins: string[],
): { content: string; added: string[] } {
	const added: string[] = []
	let updatedContent = content

	// Get existing plugins array
	const existingPlugins = (config as { plugin?: string[] }).plugin ?? []

	for (const plugin of plugins) {
		if (existingPlugins.includes(plugin)) {
			continue
		}

		// Add to the plugin array at the next index
		const newIndex = existingPlugins.length + added.length
		const edits = modify(updatedContent, ["plugin", newIndex], plugin, JSONC_OPTIONS)
		updatedContent = applyEdits(updatedContent, edits)
		added.push(plugin)
	}

	return { content: updatedContent, added }
}

/**
 * Merge agent configurations into opencode.json 'agent' key
 * Component config is treated as defaults; user config takes precedence.
 * Only sets values that don't already exist in user config.
 */
function applyAgentConfigs(
	content: string,
	existingConfig: OpencodeConfig,
	agentConfigs: Record<string, RegistryAgentConfig>,
): { content: string; agentsConfigured: string[] } {
	let updatedContent = content
	const agentsConfigured: string[] = []

	for (const [agentName, componentAgentConfig] of Object.entries(agentConfigs)) {
		const existingAgentConfig = existingConfig.agent?.[agentName] ?? {}

		// Deep merge: component as base, user as override (user wins)
		const merged = mergeDeep(componentAgentConfig, existingAgentConfig) as RegistryAgentConfig

		// Apply each field of the merged config
		if (merged.tools) {
			for (const [toolPattern, enabled] of Object.entries(merged.tools)) {
				const edits = modify(
					updatedContent,
					["agent", agentName, "tools", toolPattern],
					enabled,
					JSONC_OPTIONS,
				)
				updatedContent = applyEdits(updatedContent, edits)
			}
		}

		if (merged.temperature !== undefined) {
			const edits = modify(
				updatedContent,
				["agent", agentName, "temperature"],
				merged.temperature,
				JSONC_OPTIONS,
			)
			updatedContent = applyEdits(updatedContent, edits)
		}

		if (merged.prompt) {
			const edits = modify(
				updatedContent,
				["agent", agentName, "prompt"],
				merged.prompt,
				JSONC_OPTIONS,
			)
			updatedContent = applyEdits(updatedContent, edits)
		}

		if (merged.permission) {
			for (const [pattern, permission] of Object.entries(merged.permission)) {
				const edits = modify(
					updatedContent,
					["agent", agentName, "permission", pattern],
					permission,
					JSONC_OPTIONS,
				)
				updatedContent = applyEdits(updatedContent, edits)
			}
		}

		agentsConfigured.push(agentName)
	}

	return { content: updatedContent, agentsConfigured }
}

/**
 * Append global instructions to opencode.json 'instructions' array
 * Returns list of added instructions (skips duplicates)
 */
function applyInstructions(
	content: string,
	config: OpencodeConfig,
	instructions: string[],
): { content: string; added: string[] } {
	const added: string[] = []
	let updatedContent = content

	// Get existing instructions array
	const existingInstructions = (config as { instructions?: string[] }).instructions ?? []

	for (const instruction of instructions) {
		if (existingInstructions.includes(instruction)) {
			continue
		}

		// Add to the instructions array at the next index
		const newIndex = existingInstructions.length + added.length
		const edits = modify(updatedContent, ["instructions", newIndex], instruction, JSONC_OPTIONS)
		updatedContent = applyEdits(updatedContent, edits)
		added.push(instruction)
	}

	return { content: updatedContent, added }
}

// =============================================================================
// MAIN UPDATER
// =============================================================================

/**
 * Update opencode.json with MCP servers, tool settings, and agent configuration.
 *
 * For agent-scoped MCPs (mcpScope: "agent"):
 * 1. Adds MCP definition to global `mcp` section
 * 2. Disables MCP tools globally with `tools: { "name_*": false }`
 * 3. Enables for owning agent with `agent.NAME.tools: { "name_*": true }`
 *
 * For global MCPs (mcpScope: "global"):
 * 1. Only adds MCP definition to global `mcp` section (available to all)
 */
export async function updateOpencodeConfig(
	cwd: string,
	options: UpdateOpencodeConfigOptions,
): Promise<UpdateOpencodeConfigResult> {
	const existing = await readOpencodeConfig(cwd)

	let content: string
	let config: OpencodeConfig
	let configPath: string
	let created = false

	if (existing) {
		content = existing.content
		config = existing.config
		configPath = existing.path
	} else {
		// Create new config with schema
		config = { $schema: "https://opencode.ai/config.json" }
		content = JSON.stringify(config, null, "\t")
		configPath = `${cwd}/opencode.json`
		created = true
	}

	let mcpAdded: string[] = []
	let mcpSkipped: string[] = []
	let agentsConfigured: string[] = []
	let toolsDisabled: string[] = []
	let pluginsAdded: string[] = []
	let instructionsAdded: string[] = []

	// Apply MCP servers
	if (options.mcpServers && Object.keys(options.mcpServers).length > 0) {
		const result = applyMcpServers(content, config, options.mcpServers)
		content = result.content
		mcpAdded = result.added
		mcpSkipped = result.skipped
	}

	// Apply agent-scoped tool configuration
	// Note: We apply scoping for ALL servers in bindings, not just newly added ones.
	// This ensures agent scoping is configured even if MCPs already existed.
	if (options.agentMcpBindings && options.agentMcpBindings.length > 0) {
		// Collect all unique server names that need agent scoping
		const allScopedServers = [...new Set(options.agentMcpBindings.flatMap((b) => b.serverNames))]

		if (allScopedServers.length > 0) {
			// Disable globally
			content = applyGlobalToolDisables(content, allScopedServers)

			// Enable per-agent
			const agentResult = applyAgentToolEnables(content, options.agentMcpBindings)
			content = agentResult.content
			agentsConfigured = agentResult.agentsConfigured
		}
	}

	// Apply default agent
	if (options.defaultAgent) {
		// Re-parse config after modifications
		const updatedConfig = parseJsonc(content, [], { allowTrailingComma: true }) as OpencodeConfig
		content = applyDefaultAgent(content, updatedConfig, options.defaultAgent)
	}

	// Apply disabled tools
	if (options.disabledTools && options.disabledTools.length > 0) {
		content = applyDisabledTools(content, options.disabledTools)
		toolsDisabled = options.disabledTools
	}

	// Apply plugins
	if (options.plugins && options.plugins.length > 0) {
		// Re-parse config after modifications
		const updatedConfig = parseJsonc(content, [], { allowTrailingComma: true }) as OpencodeConfig
		const result = applyPlugins(content, updatedConfig, options.plugins)
		content = result.content
		pluginsAdded = result.added
	}

	// Apply agent configs
	if (options.agentConfigs && Object.keys(options.agentConfigs).length > 0) {
		// Re-parse config after modifications to get current user settings
		const updatedConfig = parseJsonc(content, [], { allowTrailingComma: true }) as OpencodeConfig
		const result = applyAgentConfigs(content, updatedConfig, options.agentConfigs)
		content = result.content
		// Merge with existing agentsConfigured from MCP bindings
		agentsConfigured = [...new Set([...agentsConfigured, ...result.agentsConfigured])]
	}

	// Apply instructions
	if (options.instructions && options.instructions.length > 0) {
		// Re-parse config after modifications
		const updatedConfig = parseJsonc(content, [], { allowTrailingComma: true }) as OpencodeConfig
		const result = applyInstructions(content, updatedConfig, options.instructions)
		content = result.content
		instructionsAdded = result.added
	}

	// Write config
	await writeOpencodeConfig(configPath, content)

	return {
		path: configPath,
		created,
		mcpAdded,
		mcpSkipped,
		agentsConfigured,
		toolsDisabled,
		pluginsAdded,
		instructionsAdded,
	}
}
