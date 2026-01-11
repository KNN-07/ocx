/**
 * Environment detection utilities
 * Detects CI, TTY, color support for proper output handling
 */

/** Running in CI environment */
export const isCI = Boolean(
	process.env.CI ||
		process.env.GITHUB_ACTIONS ||
		process.env.GITLAB_CI ||
		process.env.CIRCLECI ||
		process.env.JENKINS_URL ||
		process.env.BUILDKITE,
)

/** Running in interactive terminal */
export const isTTY = Boolean(process.stdout.isTTY && !isCI)

/** Terminal supports colors */
export const supportsColor = Boolean(
	isTTY && process.env.FORCE_COLOR !== "0" && process.env.NO_COLOR === undefined,
)

/**
 * Parse a boolean environment variable with explicit semantics.
 *
 * Truthy: "true", "1", "yes", "on" (case-insensitive)
 * Falsy: "false", "0", "no", "off" (case-insensitive)
 *
 * @param value - The environment variable value
 * @param defaultValue - Default if value is empty/undefined/invalid
 * @returns Parsed boolean value
 *
 * @example
 * const noUpdateCheck = parseEnvBool(process.env.OCX_NO_UPDATE_CHECK, false)
 */
export function parseEnvBool(value: string | undefined, defaultValue: boolean): boolean {
	// Guard: empty or undefined returns default
	if (value == null || value === "") {
		return defaultValue
	}

	const normalized = value.trim().toLowerCase()

	// Explicit truthy values
	if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
		return true
	}

	// Explicit falsy values
	if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
		return false
	}

	// Unknown value: fall back to default
	return defaultValue
}
