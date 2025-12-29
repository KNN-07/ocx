/**
 * AgentCN Registry Schemas
 * Follows ShadCN pattern: discriminated union types based on 'type' field
 */

import { z } from "zod"
import { REGISTRY_TYPES, RUNTIMES } from "./constants"

/** Runtime adapter types */
export const runtimeSchema = z.enum(RUNTIMES)

/** Registry item type enum */
export const registryTypeSchema = z.enum(REGISTRY_TYPES)

/** File entry within a registry item */
export const registryFileSchema = z.object({
	/** Relative path within the package source (stored in .agentcn/<package>/) */
	path: z.string(),
	/** File content (populated when fetched from registry) */
	content: z.string().optional(),
	/**
	 * Runtime target pattern for symlinking.
	 * Uses {runtime} placeholder, e.g., "{runtime}/agent/@agentcn/plan.md"
	 * Resolved at install time based on selected runtime.
	 */
	target: z.string(),
	/** File type hint for determining runtime directory */
	type: z.enum(["agent", "plugin", "skill", "command", "prompt", "config", "other"]),
})

/** Base schema for all registry items */
const registryItemBaseSchema = z.object({
	/** Unique package name */
	name: z.string(),
	/** Human-readable description */
	description: z.string().optional(),
	/** Package version (semver) */
	version: z.string().optional(),
	/** npm dependencies to install */
	dependencies: z.array(z.string()).optional(),
	/** Other AgentCN packages this depends on */
	registryDependencies: z.array(z.string()).optional(),
	/** Supported runtimes (defaults to all) */
	runtimes: z.array(runtimeSchema).optional(),
	/** Author information */
	author: z.string().optional(),
	/** License */
	license: z.string().optional(),
	/** Repository URL */
	repository: z.string().optional(),
	/** Package documentation (markdown) */
	docs: z.string().optional(),
})

/** Agent registry item */
export const registryAgentSchema = registryItemBaseSchema.extend({
	type: z.literal("registry:agent"),
	files: z.array(registryFileSchema),
})

/** Plugin registry item */
export const registryPluginSchema = registryItemBaseSchema.extend({
	type: z.literal("registry:plugin"),
	files: z.array(registryFileSchema),
})

/** Skill registry item */
export const registrySkillSchema = registryItemBaseSchema.extend({
	type: z.literal("registry:skill"),
	files: z.array(registryFileSchema),
})

/** Command registry item */
export const registryCommandSchema = registryItemBaseSchema.extend({
	type: z.literal("registry:command"),
	files: z.array(registryFileSchema),
})

/** Prompt registry item */
export const registryPromptSchema = registryItemBaseSchema.extend({
	type: z.literal("registry:prompt"),
	files: z.array(registryFileSchema),
})

/** Package registry item (meta-package bundling multiple items) */
export const registryPackageSchema = registryItemBaseSchema.extend({
	type: z.literal("registry:package"),
	files: z.array(registryFileSchema),
})

/** Union of all registry item types */
export const registryItemSchema = z.discriminatedUnion("type", [
	registryAgentSchema,
	registryPluginSchema,
	registrySkillSchema,
	registryCommandSchema,
	registryPromptSchema,
	registryPackageSchema,
])

/** Registry index (list of all available packages) */
export const registryIndexSchema = z.object({
	version: z.string(),
	packages: z.array(
		z.object({
			name: z.string(),
			type: registryTypeSchema,
			description: z.string().optional(),
			version: z.string().optional(),
		}),
	),
})

/** User's agentcn.json config file */
export const configSchema = z.object({
	$schema: z.string().optional(),
	/** Registry URL (defaults to https://agentcn.dev/r) */
	registry: z.string().optional(),
	/** Target runtime */
	runtime: runtimeSchema.optional(),
	/** Installed packages manifest */
	packages: z
		.record(
			z.string(),
			z.object({
				version: z.string(),
				installedAt: z.string(),
			}),
		)
		.optional(),
})

/** Manifest file tracking installed files and hashes */
export const manifestSchema = z.object({
	version: z.string(),
	installedAt: z.string(),
	packages: z.record(
		z.string(),
		z.object({
			version: z.string(),
			installedAt: z.string(),
			files: z.record(
				z.string(), // file path
				z.object({
					hash: z.string(),
					modified: z.boolean(),
				}),
			),
		}),
	),
})
