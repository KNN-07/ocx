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
