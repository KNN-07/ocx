import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parse as parseJsonc } from "jsonc-parser"
import type { McpServer } from "../src/schemas/registry"
import { type AgentMcpBinding, updateOpencodeConfig } from "../src/updaters/update-opencode-config"

describe("updateOpencodeConfig", () => {
	let testDir: string

	beforeEach(async () => {
		testDir = join(
			import.meta.dir,
			"fixtures",
			`tmp-updater-${Math.random().toString(36).slice(2)}`,
		)
		await mkdir(testDir, { recursive: true })
	})

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true })
	})

	it("should create opencode.json if it does not exist", async () => {
		const mcpServers: Record<string, McpServer> = {
			"test-mcp": { type: "remote", url: "https://mcp.test.com", enabled: true },
		}

		const result = await updateOpencodeConfig(testDir, {
			mcpServers,
			agentMcpBindings: [],
		})

		expect(result.mcpAdded).toContain("test-mcp")

		const configPath = join(testDir, "opencode.json")
		const content = await readFile(configPath, "utf-8")
		const config = parseJsonc(content)

		expect(config.mcp["test-mcp"]).toEqual({
			type: "remote",
			url: "https://mcp.test.com",
			enabled: true,
		})
	})

	it("should add global MCP (mcpScope: global) without tool restrictions", async () => {
		const mcpServers: Record<string, McpServer> = {
			"global-mcp": { type: "remote", url: "https://mcp.global.com", enabled: true },
		}

		const result = await updateOpencodeConfig(testDir, {
			mcpServers,
			agentMcpBindings: [], // No agent bindings = global scope
		})

		expect(result.mcpAdded).toContain("global-mcp")

		const configPath = join(testDir, "opencode.json")
		const config = parseJsonc(await readFile(configPath, "utf-8"))

		// MCP should be added
		expect(config.mcp["global-mcp"]).toBeDefined()

		// No global tool disable (global MCPs are available to all)
		expect(config.tools?.["global-mcp_*"]).toBeUndefined()
	})

	it("should scope agent MCP: add globally, disable globally, enable per-agent", async () => {
		const mcpServers: Record<string, McpServer> = {
			context7: { type: "remote", url: "https://mcp.context7.com", enabled: true },
			gh_grep: { type: "remote", url: "https://mcp.grep.app", enabled: true },
		}

		const agentMcpBindings: AgentMcpBinding[] = [
			{ agentName: "librarian", serverNames: ["context7", "gh_grep"] },
		]

		const result = await updateOpencodeConfig(testDir, {
			mcpServers,
			agentMcpBindings,
		})

		expect(result.mcpAdded).toContain("context7")
		expect(result.mcpAdded).toContain("gh_grep")

		const configPath = join(testDir, "opencode.json")
		const config = parseJsonc(await readFile(configPath, "utf-8"))

		// MCPs should be added globally
		expect(config.mcp.context7).toBeDefined()
		expect(config.mcp.gh_grep).toBeDefined()

		// Tools should be disabled globally
		expect(config.tools["context7_*"]).toBe(false)
		expect(config.tools["gh_grep_*"]).toBe(false)

		// Tools should be enabled for the owning agent
		expect(config.agent.librarian.tools["context7_*"]).toBe(true)
		expect(config.agent.librarian.tools["gh_grep_*"]).toBe(true)
	})

	it("should handle multiple agents with different MCPs", async () => {
		const mcpServers: Record<string, McpServer> = {
			context7: { type: "remote", url: "https://mcp.context7.com", enabled: true },
			exa: { type: "remote", url: "https://mcp.exa.ai", enabled: true },
		}

		const agentMcpBindings: AgentMcpBinding[] = [
			{ agentName: "librarian", serverNames: ["context7"] },
			{ agentName: "researcher", serverNames: ["exa"] },
		]

		await updateOpencodeConfig(testDir, {
			mcpServers,
			agentMcpBindings,
		})

		const configPath = join(testDir, "opencode.json")
		const config = parseJsonc(await readFile(configPath, "utf-8"))

		// Both MCPs disabled globally
		expect(config.tools["context7_*"]).toBe(false)
		expect(config.tools["exa_*"]).toBe(false)

		// Each agent gets only their own MCPs enabled
		expect(config.agent.librarian.tools["context7_*"]).toBe(true)
		expect(config.agent.librarian.tools["exa_*"]).toBeUndefined()

		expect(config.agent.researcher.tools["exa_*"]).toBe(true)
		expect(config.agent.researcher.tools["context7_*"]).toBeUndefined()
	})

	it("should preserve existing config (non-destructive merge)", async () => {
		// Create existing config
		const existingConfig = {
			$schema: "https://opencode.ai/config.json",
			theme: "catppuccin",
			model: "anthropic/claude-sonnet-4-5",
			mcp: {
				"existing-mcp": { type: "remote", url: "https://existing.com" },
			},
			tools: {
				bash: false,
			},
			agent: {
				"my-agent": {
					description: "My custom agent",
				},
			},
		}
		await writeFile(join(testDir, "opencode.json"), JSON.stringify(existingConfig, null, 2))

		const mcpServers: Record<string, McpServer> = {
			"new-mcp": { type: "remote", url: "https://new-mcp.com", enabled: true },
		}

		const agentMcpBindings: AgentMcpBinding[] = [
			{ agentName: "new-agent", serverNames: ["new-mcp"] },
		]

		await updateOpencodeConfig(testDir, {
			mcpServers,
			agentMcpBindings,
		})

		const configPath = join(testDir, "opencode.json")
		const config = parseJsonc(await readFile(configPath, "utf-8"))

		// Existing config preserved
		expect(config.theme).toBe("catppuccin")
		expect(config.model).toBe("anthropic/claude-sonnet-4-5")
		expect(config.mcp["existing-mcp"]).toBeDefined()
		expect(config.tools.bash).toBe(false)
		expect(config.agent["my-agent"].description).toBe("My custom agent")

		// New config added
		expect(config.mcp["new-mcp"]).toBeDefined()
		expect(config.tools["new-mcp_*"]).toBe(false)
		expect(config.agent["new-agent"].tools["new-mcp_*"]).toBe(true)
	})

	it("should skip existing MCP servers", async () => {
		// Create existing config with MCP already defined
		const existingConfig = {
			mcp: {
				context7: { type: "remote", url: "https://old-url.com" },
			},
		}
		await writeFile(join(testDir, "opencode.json"), JSON.stringify(existingConfig, null, 2))

		const mcpServers: Record<string, McpServer> = {
			context7: { type: "remote", url: "https://new-url.com", enabled: true },
		}

		const result = await updateOpencodeConfig(testDir, {
			mcpServers,
			agentMcpBindings: [],
		})

		expect(result.mcpSkipped).toContain("context7")
		expect(result.mcpAdded).not.toContain("context7")

		// Original URL should be preserved
		const config = parseJsonc(await readFile(join(testDir, "opencode.json"), "utf-8"))
		expect(config.mcp.context7.url).toBe("https://old-url.com")
	})

	it("should preserve JSONC comments", async () => {
		// Create existing config with comments
		const existingContent = `{
  // This is my OpenCode config
  "$schema": "https://opencode.ai/config.json",
  "theme": "opencode", // My favorite theme
  "mcp": {
    // Existing MCP servers
  }
}`
		await writeFile(join(testDir, "opencode.json"), existingContent)

		const mcpServers: Record<string, McpServer> = {
			"new-mcp": { type: "remote", url: "https://new.com", enabled: true },
		}

		await updateOpencodeConfig(testDir, {
			mcpServers,
			agentMcpBindings: [],
		})

		const content = await readFile(join(testDir, "opencode.json"), "utf-8")

		// Comments should be preserved
		expect(content).toContain("// This is my OpenCode config")
		expect(content).toContain("// My favorite theme")
		expect(content).toContain("// Existing MCP servers")

		// New MCP should be added
		const config = parseJsonc(content)
		expect(config.mcp["new-mcp"]).toBeDefined()
	})

	it("should handle opencode.jsonc extension", async () => {
		// Create config with .jsonc extension
		const existingConfig = { theme: "opencode" }
		await writeFile(join(testDir, "opencode.jsonc"), JSON.stringify(existingConfig, null, 2))

		const mcpServers: Record<string, McpServer> = {
			"test-mcp": { type: "remote", url: "https://test.com", enabled: true },
		}

		await updateOpencodeConfig(testDir, {
			mcpServers,
			agentMcpBindings: [],
		})

		// Should update the .jsonc file
		const config = parseJsonc(await readFile(join(testDir, "opencode.jsonc"), "utf-8"))
		expect(config.theme).toBe("opencode")
		expect(config.mcp["test-mcp"]).toBeDefined()
	})

	it("should disable specified tools globally", async () => {
		const result = await updateOpencodeConfig(testDir, {
			mcpServers: {},
			agentMcpBindings: [],
			disabledTools: ["WebFetch", "SomeOtherTool"],
		})

		expect(result.toolsDisabled).toContain("WebFetch")
		expect(result.toolsDisabled).toContain("SomeOtherTool")

		const config = parseJsonc(await readFile(join(testDir, "opencode.json"), "utf-8"))
		expect(config.tools.WebFetch).toBe(false)
		expect(config.tools.SomeOtherTool).toBe(false)
	})

	it("should write local MCP with environment variables", async () => {
		const mcpServers: Record<string, McpServer> = {
			"local-mcp": {
				type: "local",
				command: ["uvx", "some-mcp"],
				environment: { API_KEY: "{env:API_KEY}" },
				enabled: false,
			},
		}

		await updateOpencodeConfig(testDir, { mcpServers, agentMcpBindings: [] })

		const config = parseJsonc(await readFile(join(testDir, "opencode.json"), "utf-8"))
		expect(config.mcp["local-mcp"].type).toBe("local")
		expect(config.mcp["local-mcp"].command).toEqual(["uvx", "some-mcp"])
		expect(config.mcp["local-mcp"].environment).toEqual({ API_KEY: "{env:API_KEY}" })
		expect(config.mcp["local-mcp"].enabled).toBe(false)
	})

	it("should write all optional MCP fields", async () => {
		const mcpServers: Record<string, McpServer> = {
			"full-mcp": {
				type: "remote",
				url: "https://mcp.example.com",
				headers: { "X-Custom": "value" },
				args: ["--verbose", "--debug"],
				oauth: true,
				enabled: true,
			},
		}

		await updateOpencodeConfig(testDir, { mcpServers, agentMcpBindings: [] })

		const config = parseJsonc(await readFile(join(testDir, "opencode.json"), "utf-8"))
		expect(config.mcp["full-mcp"].headers).toEqual({ "X-Custom": "value" })
		expect(config.mcp["full-mcp"].args).toEqual(["--verbose", "--debug"])
		expect(config.mcp["full-mcp"].oauth).toBe(true)
	})
})
