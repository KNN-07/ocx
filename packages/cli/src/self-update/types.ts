/**
 * Self-Update Type Definitions
 *
 * Provides interfaces for version information, enabling testable version checks
 * through dependency injection.
 * @module
 */

// =============================================================================
// VERSION PROVIDER
// =============================================================================

/**
 * Provider for version information, enabling testable version checks.
 * Implementations can provide version from build-time constants, package.json,
 * or test fixtures.
 */
export interface VersionProvider {
	/** The current CLI version string (e.g., "1.2.3") */
	readonly version: string
}
