/**
 * Config Barrel Export
 *
 * Exports configuration providers and utilities.
 */

export { type ConfigProvider, LocalConfigProvider } from "./provider.js"
export type {
	ConfigOrigin,
	ConfigSource,
	ResolvedConfig,
	ResolvedConfigWithOrigin,
} from "./resolver.js"
export { ConfigResolver } from "./resolver.js"
