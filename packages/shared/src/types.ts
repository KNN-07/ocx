/**
 * AgentCN Type Exports
 * Inferred from Zod schemas for type safety
 */

import type { z } from "zod"
import type {
	configSchema,
	manifestSchema,
	registryAgentSchema,
	registryCommandSchema,
	registryFileSchema,
	registryIndexSchema,
	registryItemSchema,
	registryPackageSchema,
	registryPluginSchema,
	registryPromptSchema,
	registrySkillSchema,
	registryTypeSchema,
	runtimeSchema,
} from "./schemas"

/** Supported runtime types */
export type Runtime = z.infer<typeof runtimeSchema>

/** Registry item types */
export type RegistryType = z.infer<typeof registryTypeSchema>

/** File entry within a registry item */
export type RegistryFile = z.infer<typeof registryFileSchema>

/** Agent registry item */
export type RegistryAgent = z.infer<typeof registryAgentSchema>

/** Plugin registry item */
export type RegistryPlugin = z.infer<typeof registryPluginSchema>

/** Skill registry item */
export type RegistrySkill = z.infer<typeof registrySkillSchema>

/** Command registry item */
export type RegistryCommand = z.infer<typeof registryCommandSchema>

/** Prompt registry item */
export type RegistryPrompt = z.infer<typeof registryPromptSchema>

/** Package registry item */
export type RegistryPackage = z.infer<typeof registryPackageSchema>

/** Union of all registry item types */
export type RegistryItem = z.infer<typeof registryItemSchema>

/** Registry index */
export type RegistryIndex = z.infer<typeof registryIndexSchema>

/** User config file */
export type Config = z.infer<typeof configSchema>

/** Installed packages manifest */
export type Manifest = z.infer<typeof manifestSchema>
