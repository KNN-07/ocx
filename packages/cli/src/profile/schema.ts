import { z } from "zod"
import { ghostConfigSchema } from "../schemas/ghost.js"

/**
 * Profile name validation schema.
 * - Must start with a letter
 * - Can contain alphanumeric, dots, underscores, hyphens
 * - 1-32 characters
 * Based on CCS variant-service.ts pattern.
 */
export const profileNameSchema = z
	.string()
	.min(1, "Profile name is required")
	.max(32, "Profile name must be 32 characters or less")
	.regex(
		/^[a-zA-Z][a-zA-Z0-9._-]*$/,
		"Profile name must start with a letter and contain only alphanumeric characters, dots, underscores, or hyphens",
	)

export type ProfileName = z.infer<typeof profileNameSchema>

/**
 * Represents a loaded profile with all its data.
 */
export const profileSchema = z.object({
	/** Profile name (directory name) */
	name: profileNameSchema,
	/** Ghost configuration from ghost.jsonc */
	ghost: ghostConfigSchema,
	/** OpenCode configuration from opencode.jsonc (optional, passthrough) */
	opencode: z.record(z.unknown()).optional(),
	/** Whether AGENTS.md exists in this profile */
	hasAgents: z.boolean(),
})

export type Profile = z.infer<typeof profileSchema>
