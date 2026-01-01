/**
 * Registry & Component Schemas
 *
 * Zod schemas with fail-fast validation following the 5 Laws of Elegant Defense.
 * Uses Cargo-style union types: string for simple defaults, object for full control.
 */

import { z } from "zod"

// =============================================================================
// OPENCODE NAMING CONSTRAINTS (from OpenCode docs)
// =============================================================================

/**
 * OpenCode name schema following official constraints:
 * - 1-64 characters
 * - Lowercase alphanumeric with single hyphen separators
 * - Cannot start or end with hyphen
 * - Cannot contain consecutive hyphens
 *
 * Regex: ^[a-z0-9]+(-[a-z0-9]+)*$
 */
export const openCodeNameSchema = z
	.string()
	.min(1, "Name cannot be empty")
	.max(64, "Name cannot exceed 64 characters")
	.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
		message:
			"Must be lowercase alphanumeric with single hyphen separators (e.g., 'my-component', 'kdco-plan'). Cannot start/end with hyphen or have consecutive hyphens.",
	})

/**
 * Creates a component name schema that enforces registry prefix.
 * All components in a registry must start with the registry's prefix.
 */
export const createComponentNameSchema = (prefix: string) =>
	openCodeNameSchema.refine((name) => name.startsWith(`${prefix}-`), {
		message: `Component name must start with registry prefix "${prefix}-" (e.g., "${prefix}-my-component")`,
	})

// =============================================================================
// FILE TARGET SCHEMAS
// =============================================================================

/**
 * Valid component types and their target directories
 */
export const COMPONENT_TYPE_DIRS = {
	"ocx:agent": "agent",
	"ocx:skill": "skill",
	"ocx:plugin": "plugin",
	"ocx:command": "command",
	"ocx:tool": "tool",
	"ocx:bundle": null, // Bundles don't have a target directory
} as const

export const componentTypeSchema = z.enum([
	"ocx:agent",
	"ocx:skill",
	"ocx:plugin",
	"ocx:command",
	"ocx:tool",
	"ocx:bundle",
])

export type ComponentType = z.infer<typeof componentTypeSchema>

/**
 * Target path must be inside .opencode/ with valid subdirectory
 */
export const targetPathSchema = z
	.string()
	.refine((path) => path.startsWith(".opencode/"), {
		message: 'Target path must start with ".opencode/"',
	})
	.refine(
		(path) => {
			const parts = path.split("/")
			const dir = parts[1]
			if (!dir) return false
			return ["agent", "skill", "plugin", "command", "tool", "philosophy"].includes(dir)
		},
		{
			message:
				'Target must be in a valid directory: ".opencode/{agent|skill|plugin|command|tool|philosophy}/..."',
		},
	)

/**
 * Skill-specific target validation.
 * Skills must be in: .opencode/skill/<name>/SKILL.md
 */
export const skillTargetSchema = z
	.string()
	.regex(/^\.opencode\/skill\/[a-z0-9]+(-[a-z0-9]+)*\/SKILL\.md$/, {
		message:
			'Skill target must match pattern ".opencode/skill/<name>/SKILL.md" where name follows OpenCode naming rules',
	})

// =============================================================================
// MCP SERVER SCHEMA (Cargo-style: string URL or full object)
// =============================================================================

/**
 * Full MCP server configuration object
 */
export const mcpServerObjectSchema = z
	.object({
		type: z.enum(["remote", "local"]),
		url: z.string().url().optional(),
		command: z.array(z.string()).optional(),
		args: z.array(z.string()).optional(),
		environment: z.record(z.string()).optional(),
		headers: z.record(z.string()).optional(),
		oauth: z.boolean().optional(),
		enabled: z.boolean().default(true),
	})
	.refine(
		(data) => {
			if (data.type === "remote" && !data.url) {
				return false
			}
			if (data.type === "local" && !data.command) {
				return false
			}
			return true
		},
		{
			message: "Remote MCP servers require 'url', local servers require 'command'",
		},
	)

export type McpServerObject = z.infer<typeof mcpServerObjectSchema>

/**
 * Cargo-style MCP server schema:
 * - String: URL shorthand for remote server (e.g., "https://mcp.example.com")
 * - Object: Full configuration
 */
export const mcpServerSchema = z.union([z.string().url(), mcpServerObjectSchema])

export type McpServer = z.infer<typeof mcpServerSchema>

// =============================================================================
// COMPONENT FILE SCHEMA (Cargo-style: string path or full object)
// =============================================================================

/**
 * Full file configuration object
 */
export const componentFileObjectSchema = z.object({
	/** Source path in registry */
	path: z.string().min(1, "File path cannot be empty"),
	/** Target path in .opencode/ */
	target: targetPathSchema,
})

export type ComponentFileObject = z.infer<typeof componentFileObjectSchema>

/**
 * Cargo-style file schema:
 * - String: Path shorthand, target auto-inferred (e.g., "plugin/foo.ts" -> ".opencode/plugin/foo.ts")
 * - Object: Full configuration with explicit target
 */
export const componentFileSchema = z.union([
	z.string().min(1, "File path cannot be empty"),
	componentFileObjectSchema,
])

export type ComponentFile = z.infer<typeof componentFileSchema>

// =============================================================================
// OPENCODE CONFIG BLOCK SCHEMA
// =============================================================================

/**
 * Agent configuration options (matches opencode.json agent schema)
 * Note: No hardcoded 'model' - that's a user preference
 */
export const agentConfigSchema = z.object({
	/** Tool enable/disable patterns */
	tools: z.record(z.boolean()).optional(),
	/** Sampling temperature */
	temperature: z.number().min(0).max(2).optional(),
	/** Additional prompt text */
	prompt: z.string().optional(),
	/** Permission matrix for file operations */
	permission: z.record(z.enum(["allow", "deny"])).optional(),
})

export type AgentConfig = z.infer<typeof agentConfigSchema>

/**
 * OpenCode configuration block
 * Mirrors opencode.json structure for intuitive mapping
 */
export const opencodeConfigSchema = z.object({
	/** NPM plugin packages to add to opencode.json 'plugin' array */
	plugins: z.array(z.string()).optional(),

	/** Tool enable/disable patterns */
	tools: z.record(z.boolean()).optional(),

	/** Per-agent configuration */
	agent: z.record(agentConfigSchema).optional(),

	/** Global instructions to append */
	instructions: z.array(z.string()).optional(),
})

export type OpencodeConfig = z.infer<typeof opencodeConfigSchema>

// =============================================================================
// COMPONENT MANIFEST SCHEMA
// =============================================================================

export const componentManifestSchema = z.object({
	/** Component name (must include registry prefix) */
	name: openCodeNameSchema,

	/** Component type */
	type: componentTypeSchema,

	/** Human-readable description */
	description: z.string().min(1).max(1024),

	/**
	 * Files to install (Cargo-style)
	 * - String: "plugin/foo.ts" -> auto-infers target as ".opencode/plugin/foo.ts"
	 * - Object: { path: "...", target: "..." } for explicit control
	 */
	files: z.array(componentFileSchema),

	/** Dependencies on other registry components */
	dependencies: z.array(openCodeNameSchema).default([]),

	/** NPM dependencies to install (supports pkg@version syntax) */
	npmDependencies: z.array(z.string()).optional(),

	/** NPM dev dependencies to install (supports pkg@version syntax) */
	npmDevDependencies: z.array(z.string()).optional(),

	/**
	 * MCP servers this component needs (Cargo-style)
	 * - String value: URL shorthand for remote server
	 * - Object value: Full MCP configuration
	 */
	mcpServers: z.record(mcpServerSchema).optional(),

	/** Scope MCP servers to this agent only? Default: "agent" */
	mcpScope: z.enum(["agent", "global"]).default("agent"),

	/**
	 * OpenCode configuration to merge into opencode.json
	 * Use this for: plugins, tools, agent config, instructions
	 */
	opencode: opencodeConfigSchema.optional(),

	/**
	 * @deprecated Use opencode.tools instead
	 * Tools to disable globally when this component is installed
	 */
	disabledTools: z.array(z.string()).optional(),
})

export type ComponentManifest = z.infer<typeof componentManifestSchema>

// =============================================================================
// NORMALIZER FUNCTIONS (Parse, Don't Validate - Law 2)
// =============================================================================

/**
 * Infer target path from source path
 * e.g., "plugin/foo.ts" -> ".opencode/plugin/foo.ts"
 */
export function inferTargetPath(sourcePath: string): string {
	return `.opencode/${sourcePath}`
}

/**
 * Normalize a file entry from string shorthand to full object
 */
export function normalizeFile(file: ComponentFile): ComponentFileObject {
	if (typeof file === "string") {
		return {
			path: file,
			target: inferTargetPath(file),
		}
	}
	return file
}

/**
 * Normalize an MCP server entry from URL shorthand to full object
 */
export function normalizeMcpServer(server: McpServer): McpServerObject {
	if (typeof server === "string") {
		return {
			type: "remote",
			url: server,
			enabled: true,
		}
	}
	return server
}

/**
 * Normalize all Cargo-style shorthands in a component manifest
 * Call this at the parse boundary to get fully-typed objects
 */
export function normalizeComponentManifest(
	manifest: ComponentManifest,
): NormalizedComponentManifest {
	return {
		...manifest,
		files: manifest.files.map(normalizeFile),
		mcpServers: manifest.mcpServers
			? Object.fromEntries(
					Object.entries(manifest.mcpServers).map(([name, server]) => [
						name,
						normalizeMcpServer(server),
					]),
				)
			: undefined,
	}
}

/**
 * Normalized component manifest with all shorthands expanded
 */
export interface NormalizedComponentManifest
	extends Omit<ComponentManifest, "files" | "mcpServers"> {
	files: ComponentFileObject[]
	mcpServers?: Record<string, McpServerObject>
}

// =============================================================================
// REGISTRY SCHEMA
// =============================================================================

/**
 * Semver regex for version validation
 */
const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/

export const registrySchema = z
	.object({
		/** Registry name */
		name: z.string().min(1, "Registry name cannot be empty"),

		/** Registry prefix - REQUIRED, all components must use this */
		prefix: openCodeNameSchema,

		/** Registry version (semver) */
		version: z.string().regex(semverRegex, {
			message: "Version must be valid semver (e.g., '1.0.0', '2.1.0-beta.1')",
		}),

		/** Registry author */
		author: z.string().min(1, "Author cannot be empty"),

		/** Components in this registry */
		components: z.array(componentManifestSchema),
	})
	.refine(
		(data) => {
			// All component names must start with the registry prefix
			return data.components.every((c) => c.name.startsWith(`${data.prefix}-`))
		},
		{
			message: "All component names must start with the registry prefix",
		},
	)
	.refine(
		(data) => {
			// All dependencies must exist within the registry
			const componentNames = new Set(data.components.map((c) => c.name))
			for (const component of data.components) {
				for (const dep of component.dependencies) {
					if (!componentNames.has(dep)) {
						return false
					}
				}
			}
			return true
		},
		{
			message: "All dependencies must reference components that exist in the registry",
		},
	)

export type Registry = z.infer<typeof registrySchema>

// =============================================================================
// PACKUMENT SCHEMA (npm-style versioned component)
// =============================================================================

export const packumentSchema = z.object({
	/** Component name */
	name: openCodeNameSchema,

	/** Latest version */
	"dist-tags": z.object({
		latest: z.string(),
	}),

	/** All versions */
	versions: z.record(componentManifestSchema),
})

export type Packument = z.infer<typeof packumentSchema>

// =============================================================================
// REGISTRY INDEX SCHEMA
// =============================================================================

export const registryIndexSchema = z.object({
	/** Registry metadata */
	name: z.string(),
	prefix: openCodeNameSchema,
	version: z.string(),
	author: z.string(),

	/** Component summaries for search */
	components: z.array(
		z.object({
			name: openCodeNameSchema,
			type: componentTypeSchema,
			description: z.string(),
		}),
	),
})

export type RegistryIndex = z.infer<typeof registryIndexSchema>
