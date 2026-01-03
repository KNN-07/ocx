/**
 * Registry Schemas
 *
 * Re-exports all registry-related schemas and types from ocx-schemas.
 */

// Type aliases for backwards compatibility with existing CLI code
export type {
	AgentConfig,
	ComponentFile,
	ComponentFileObject,
	ComponentManifest,
	ComponentType,
	McpServer,
	McpServerRef,
	NormalizedComponentManifest,
	NormalizedOpencodeConfig,
	OpencodeConfig,
	Packument,
	PermissionConfig,
	Registry,
	RegistryIndex,
} from "ocx-schemas"
// Re-export everything from ocx-schemas
export * from "ocx-schemas"
