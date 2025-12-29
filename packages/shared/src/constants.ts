/**
 * AgentCN Constants
 */

/** Default registry URL */
export const DEFAULT_REGISTRY_URL = "https://agentcn.dev/r"

/** Config file name */
export const CONFIG_FILE_NAME = "agentcn.json"

/** Manifest file name (tracks installed packages) */
export const MANIFEST_FILE_NAME = "agentcn.lock"

/**
 * Universal home directory for AgentCN packages.
 * All package sources live here, symlinked to runtime-specific directories.
 */
export const AGENTCN_DIR = ".agentcn"

/** Supported runtimes */
export const RUNTIMES = ["opencode", "cursor", "claude-code", "windsurf"] as const

/**
 * Runtime-specific directory mappings.
 * Maps runtime name to their config directory structure.
 *
 * v1: Only OpenCode is implemented.
 * Future: Add cursor (.cursor/), claude-code (.claude/), windsurf (.windsurf/), zed (.zed/)
 */
export const RUNTIME_DIRS = {
	opencode: {
		base: ".opencode",
		agent: ".opencode/agent/@agentcn",
		plugin: ".opencode/plugin/@agentcn",
		skill: ".opencode/skill/@agentcn",
		command: ".opencode/command/@agentcn",
	},
	// Future expansion - not implemented in v1
	// cursor: {
	//   base: ".cursor",
	//   rules: ".cursor/rules/@agentcn",
	// },
	// "claude-code": {
	//   base: ".claude",
	//   commands: ".claude/commands/@agentcn",
	// },
	// windsurf: {
	//   base: ".windsurf",
	//   rules: ".windsurf/rules/@agentcn",
	// },
} as const

/** Default runtime for v1 */
export const DEFAULT_RUNTIME = "opencode" as const

/** Registry item types */
export const REGISTRY_TYPES = [
	"registry:agent",
	"registry:plugin",
	"registry:skill",
	"registry:command",
	"registry:prompt",
	"registry:package", // Meta-package that bundles multiple items
] as const

/** File types and their runtime directory mappings */
export const FILE_TYPE_TO_RUNTIME_DIR = {
	agent: "agent",
	plugin: "plugin",
	skill: "skill",
	command: "command",
	prompt: "agent", // Prompts go with agents
	config: "plugin", // Configs go with plugins
	other: "plugin", // Default to plugin directory
} as const
