/**
 * OpenCode.json Utilities
 * Base utilities for reading/writing opencode.json configuration
 *
 * NOTE: For updating opencode.json with MCP servers and agent config,
 * use the updater in ../updaters/update-opencode-config.ts
 */

import { parse as parseJsonc } from "jsonc-parser"

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
			return {
				config: parseJsonc(content, [], { allowTrailingComma: true }) as OpencodeConfig,
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
