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
			"Must be lowercase alphanumeric with single hyphen separators (e.g., 'my-component', 'my-plugin'). Cannot start/end with hyphen or have consecutive hyphens.",
	})

/**
 * Namespace schema - valid identifier for registry namespace
 * Same rules as openCodeNameSchema
 */
export const namespaceSchema = openCodeNameSchema

/**
 * Qualified component reference: namespace/component
 * Used in CLI commands and lockfile keys
 */
export const qualifiedComponentSchema = z
	.string()
	.regex(/^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/, {
		message:
			'Must be in format "namespace/component" (e.g., "kdco/librarian"). Both parts must be lowercase alphanumeric with hyphens.',
	})

/**
 * Parse a qualified component reference into namespace and component.
 * Throws Error if format is invalid (Law 4: Fail Fast, Fail Loud).
 */
export function parseQualifiedComponent(ref: string): { namespace: string; component: string } {
	if (!ref.includes("/")) {
		throw new Error(`Invalid component reference: "${ref}". Use format: namespace/component`)
	}
	const [namespace, component] = ref.split("/")
	if (!namespace || !component) {
		throw new Error(
			`Invalid component reference: "${ref}". Both namespace and component are required.`,
		)
	}
	return { namespace, component }
}

/**
 * Create a qualified component reference from namespace and component
 */
export function createQualifiedComponent(namespace: string, component: string): string {
	return `${namespace}/${component}`
}

/**
 * Dependency reference schema (Cargo-style):
 * - Bare string: "utils" -> same namespace (implicit)
 * - Qualified: "acme/utils" -> cross-namespace (explicit)
 */
export const dependencyRefSchema = z.string().refine(
	(dep) => {
		// Either a bare component name or a qualified namespace/component
		const barePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/
		const qualifiedPattern = /^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/
		return barePattern.test(dep) || qualifiedPattern.test(dep)
	},
	{
		message:
			'Dependency must be either a bare name (e.g., "utils") or qualified (e.g., "acme/utils")',
	},
)

// =============================================================================
// FILE TARGET SCHEMAS
// =============================================================================

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

export type McpServer = z.infer<typeof mcpServerObjectSchema>

/**
 * Cargo-style MCP server reference:
 * - String: URL shorthand for remote server (e.g., "https://mcp.example.com")
 * - Object: Full configuration
 */
export const mcpServerRefSchema = z.union([z.string().url(), mcpServerObjectSchema])

export type McpServerRef = z.infer<typeof mcpServerRefSchema>

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
 * Permission configuration schema (matches opencode.json permission schema)
 * Supports both simple values and per-path patterns
 */
export const permissionConfigSchema = z.object({
	/** Bash command permissions */
	bash: z
		.union([z.enum(["ask", "allow", "deny"]), z.record(z.enum(["ask", "allow", "deny"]))])
		.optional(),
	/** File edit permissions */
	edit: z
		.union([z.enum(["ask", "allow", "deny"]), z.record(z.enum(["ask", "allow", "deny"]))])
		.optional(),
	/** MCP server permissions */
	mcp: z.record(z.enum(["ask", "allow", "deny"])).optional(),
})

export type PermissionConfig = z.infer<typeof permissionConfigSchema>

/**
 * OpenCode configuration block
 * Mirrors opencode.json structure exactly for 1:1 mapping
 */
export const opencodeConfigSchema = z.object({
	/** MCP servers (matches opencode.json 'mcp' field) */
	mcp: z.record(mcpServerRefSchema).optional(),

	/** NPM plugin packages to add to opencode.json 'plugin' array */
	plugin: z.array(z.string()).optional(),

	/** Tool enable/disable patterns */
	tools: z.record(z.boolean()).optional(),

	/** Per-agent configuration */
	agent: z.record(agentConfigSchema).optional(),

	/** Global instructions to append */
	instructions: z.array(z.string()).optional(),

	/** Permission configuration */
	permission: permissionConfigSchema.optional(),
})

export type OpencodeConfig = z.infer<typeof opencodeConfigSchema>

// =============================================================================
// COMPONENT MANIFEST SCHEMA
// =============================================================================

export const componentManifestSchema = z.object({
	/** Component name (clean, no namespace prefix) */
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

	/**
	 * Dependencies on other components (Cargo-style)
	 * - Bare string: "utils" -> same namespace (implicit)
	 * - Qualified: "acme/utils" -> cross-namespace (explicit)
	 */
	dependencies: z.array(dependencyRefSchema).default([]),

	/** NPM dependencies to install (supports pkg@version syntax) */
	npmDependencies: z.array(z.string()).optional(),

	/** NPM dev dependencies to install (supports pkg@version syntax) */
	npmDevDependencies: z.array(z.string()).optional(),

	/**
	 * OpenCode configuration to merge into opencode.json
	 * Use this for: mcp servers, plugins, tools, agent config, instructions, permissions
	 */
	opencode: opencodeConfigSchema.optional(),
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
export function normalizeMcpServer(server: McpServerRef): McpServer {
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
 * Normalized opencode config with MCP servers expanded
 */
export interface NormalizedOpencodeConfig extends Omit<OpencodeConfig, "mcp"> {
	mcp?: Record<string, McpServer>
}

/**
 * Normalized component manifest with all shorthands expanded
 */
export interface NormalizedComponentManifest extends Omit<ComponentManifest, "files" | "opencode"> {
	files: ComponentFileObject[]
	opencode?: NormalizedOpencodeConfig
}

/**
 * Normalize all Cargo-style shorthands in a component manifest
 * Call this at the parse boundary to get fully-typed objects
 */
export function normalizeComponentManifest(
	manifest: ComponentManifest,
): NormalizedComponentManifest {
	// Normalize MCP servers inside opencode block
	let normalizedOpencode: NormalizedOpencodeConfig | undefined
	if (manifest.opencode) {
		// Destructure to exclude mcp from spread (Law 2: Parse, Don't Validate)
		// Only include mcp if present - avoid setting undefined (which would overwrite during mergeDeep)
		const { mcp, ...rest } = manifest.opencode
		normalizedOpencode = {
			...rest,
			...(mcp && {
				mcp: Object.fromEntries(
					Object.entries(mcp).map(([name, server]) => [name, normalizeMcpServer(server)]),
				),
			}),
		}
	}

	return {
		...manifest,
		files: manifest.files.map(normalizeFile),
		opencode: normalizedOpencode,
	}
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

		/** Registry namespace - used in qualified component references (e.g., kdco/librarian) */
		namespace: namespaceSchema,

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
			// All dependencies must either:
			// 1. Be a bare name that exists in this registry
			// 2. Be a qualified cross-namespace reference (validated at install time)
			const componentNames = new Set(data.components.map((c) => c.name))
			for (const component of data.components) {
				for (const dep of component.dependencies) {
					// Only validate bare (same-namespace) dependencies
					if (!dep.includes("/") && !componentNames.has(dep)) {
						return false
					}
				}
			}
			return true
		},
		{
			message:
				"Bare dependencies must reference components that exist in the registry. Use qualified references (e.g., 'other-registry/component') for cross-namespace dependencies.",
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
	namespace: namespaceSchema,
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
