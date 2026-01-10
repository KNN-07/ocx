/**
 * Self-Update Version Checking
 *
 * Checks for newer OCX versions with minimal impact on CLI startup time.
 * Follows the 5 Laws of Elegant Defense:
 * - Early Exit: Return null on any failure (silent)
 * - Parse Don't Validate: Use typed VersionCheckResult
 * - Atomic Predictability: Pure comparison logic
 * - Fail Fast: Abort on timeout, don't block UX
 * - Intentional Naming: Self-documenting function names
 */

import { fetchPackageVersion } from "../utils/npm-registry.js"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of checking for available updates.
 * Contains current version, latest version, and whether an update is available.
 */
export interface VersionCheckResult {
	current: string
	latest: string
	updateAvailable: boolean
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Timeout for version check - non-blocking UX is priority */
const VERSION_CHECK_TIMEOUT_MS = 200

/** Package name on npm registry */
const PACKAGE_NAME = "ocx"

// =============================================================================
// VERSION UTILITIES
// =============================================================================

// Version injected at build time
declare const __VERSION__: string

/**
 * Get the current OCX CLI version.
 * Falls back to "0.0.0-dev" during development.
 */
function getCurrentVersion(): string {
	return typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.0.0-dev"
}

/**
 * Parse a semver string into components.
 * Returns null if invalid.
 *
 * @param v - Version string (e.g., "1.2.3" or "1.2.3-beta.1")
 * @returns Parsed version or null if invalid
 */
function parseVersion(v: string): { major: number; minor: number; patch: number } | null {
	const [main = ""] = v.split("-") // Ignore prerelease for comparison
	const parts = main.split(".")
	const major = parseInt(parts[0] ?? "", 10)
	const minor = parseInt(parts[1] ?? "", 10)
	const patch = parseInt(parts[2] ?? "", 10)

	// Early exit: invalid version components
	if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
		return null
	}

	return { major, minor, patch }
}

/**
 * Compare two semver versions.
 * Returns null if either version is invalid (cannot compare).
 *
 * @param a - First version string (e.g., "1.2.3")
 * @param b - Second version string (e.g., "1.0.0")
 * @returns Negative if a < b, 0 if equal, positive if a > b, null if invalid
 */
function compareSemver(a: string, b: string): number | null {
	const vA = parseVersion(a)
	const vB = parseVersion(b)

	// Early exit: can't compare invalid versions
	if (!vA || !vB) {
		return null
	}

	if (vA.major !== vB.major) return vA.major - vB.major
	if (vA.minor !== vB.minor) return vA.minor - vB.minor
	return vA.patch - vB.patch
}

// =============================================================================
// VERSION CHECK
// =============================================================================

/**
 * Check if a newer version of OCX is available.
 *
 * Uses npm registry with 200ms timeout to ensure non-blocking UX.
 * Returns null on timeout or any error (silent failure by design).
 *
 * @returns Version check result, or null if check failed/timed out
 */
export async function checkForUpdate(): Promise<VersionCheckResult | null> {
	const current = getCurrentVersion()

	// Early exit: dev version, don't check
	if (current === "0.0.0-dev") {
		return null
	}

	try {
		// Create abort controller for timeout
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), VERSION_CHECK_TIMEOUT_MS)

		// Race fetch against timeout using AbortSignal
		const fetchPromise = fetchPackageVersion(PACKAGE_NAME)

		// We need to wrap fetch in a race since fetchPackageVersion has its own timeout
		const result = await Promise.race([
			fetchPromise,
			new Promise<null>((_, reject) => {
				controller.signal.addEventListener("abort", () => {
					reject(new Error("Version check timed out"))
				})
			}),
		])

		clearTimeout(timeoutId)

		// Early exit: race returned null (shouldn't happen, but guard)
		if (!result) {
			return null
		}

		const latest = result.version

		// Compare versions
		const comparison = compareSemver(latest, current)

		// Early exit: can't compare (invalid versions)
		if (comparison === null) {
			return null
		}

		return {
			current,
			latest,
			updateAvailable: comparison > 0,
		}
	} catch {
		// Silent failure - don't block CLI startup for version check
		return null
	}
}
