/**
 * OpenCode.json Modifier
 * Handles reading, merging, and writing opencode.json configuration
 *
 * Key responsibilities:
 * - Add MCP server definitions
 * - Deep merge without clobbering user config
 */

import type { McpServer } from "../schemas/registry.js"

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
	headers?: Record<string, string>
	enabled?: boolean
}

export interface AgentConfig {
	disable?: boolean
	tools?: Record<string, boolean>
	[key: string]: unknown
}

/**
 * Read opencode.json or opencode.jsonc from a directory
 */
export async function readOpencodeConfig(cwd: string): Promise<{
	config: OpencodeConfig
	path: string
} | null> {
	const jsonPath = `${cwd}/opencode.json`
	const jsoncPath = `${cwd}/opencode.jsonc`

	// Try opencode.jsonc first, then opencode.json
	for (const configPath of [jsoncPath, jsonPath]) {
		const file = Bun.file(configPath)
		if (await file.exists()) {
			const content = await file.text()
			// Strip comments for JSONC
			const stripped = configPath.endsWith(".jsonc") ? stripJsonComments(content) : content
			return {
				config: JSON.parse(stripped) as OpencodeConfig,
				path: configPath,
			}
		}
	}

	return null
}

/**
 * Write opencode.json config
 */
export async function writeOpencodeConfig(path: string, config: OpencodeConfig): Promise<void> {
	const content = JSON.stringify(config, null, 2)
	await Bun.write(path, content)
}

/**
 * Apply MCP servers to opencode config
 * Non-destructive: only adds new servers, doesn't overwrite existing
 */
export function applyMcpServers(
	config: OpencodeConfig,
	mcpServers: Record<string, McpServer>,
): { config: OpencodeConfig; added: string[]; skipped: string[] } {
	const added: string[] = []
	const skipped: string[] = []

	if (!config.mcp) {
		config.mcp = {}
	}

	for (const [name, server] of Object.entries(mcpServers)) {
		if (config.mcp[name]) {
			// Already exists, skip
			skipped.push(name)
		} else {
			// Add new server
			const serverConfig: McpServerConfig = {
				type: server.type,
				enabled: server.enabled,
			}

			if (server.type === "remote" && server.url) {
				serverConfig.url = server.url
			}
			if (server.type === "local" && server.command) {
				serverConfig.command = server.command
			}
			if (server.headers) {
				serverConfig.headers = server.headers
			}

			config.mcp[name] = serverConfig
			added.push(name)
		}
	}

	return { config, added, skipped }
}

/**
 * Strip JSON comments (simple implementation)
 */
function stripJsonComments(content: string): string {
	// Remove single-line comments
	let result = content.replace(/\/\/.*$/gm, "")
	// Remove multi-line comments
	result = result.replace(/\/\*[\s\S]*?\*\//g, "")
	return result
}

/**
 * Create or update opencode.json with required configuration
 */
export async function updateOpencodeConfig(
	cwd: string,
	options: {
		mcpServers?: Record<string, McpServer>
		defaultAgent?: string
	},
): Promise<{
	path: string
	created: boolean
	mcpAdded: string[]
	mcpSkipped: string[]
}> {
	let existing = await readOpencodeConfig(cwd)
	let config: OpencodeConfig
	let configPath: string
	let created = false

	if (existing) {
		config = existing.config
		configPath = existing.path
	} else {
		// Create new config
		config = {
			$schema: "https://opencode.ai/config.json",
		}
		configPath = `${cwd}/opencode.json`
		created = true
	}

	let mcpAdded: string[] = []
	let mcpSkipped: string[] = []

	// Apply MCP servers
	if (options.mcpServers && Object.keys(options.mcpServers).length > 0) {
		const result = applyMcpServers(config, options.mcpServers)
		config = result.config
		mcpAdded = result.added
		mcpSkipped = result.skipped
	}

	// Set default agent if provided and not already set
	if (options.defaultAgent && !config.default_agent) {
		config.default_agent = options.defaultAgent
	}

	// Write config
	await writeOpencodeConfig(configPath, config)

	return {
		path: configPath,
		created,
		mcpAdded,
		mcpSkipped,
	}
}
