/**
 * Installation Method Detection
 *
 * Detects how OCX was installed to determine the appropriate update mechanism.
 * Follows the 5 Laws of Elegant Defense:
 * - Early Exit: Check compiled binary first (most common case)
 * - Parse Don't Validate: Returns typed InstallMethod union
 * - Atomic Predictability: Pure functions based only on process state
 * - Fail Fast: N/A (always returns a valid method)
 * - Intentional Naming: Self-documenting function names
 */

import { SelfUpdateError } from "../utils/errors"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Possible installation methods for OCX.
 * - "curl": Standalone compiled binary (installed via curl script)
 * - "npm": Installed globally via `npm install -g`
 * - "pnpm": Installed globally via `pnpm add -g`
 * - "bun": Installed globally via `bun add -g`
 * - "yarn": Installed globally via `yarn global add` (Classic only, Berry doesn't support global)
 * - "brew": Installed via Homebrew
 * - "unknown": Unable to determine installation method
 */
export type InstallMethod = "curl" | "npm" | "pnpm" | "bun" | "yarn" | "brew" | "unknown"

// =============================================================================
// PARSING (Law 2: Parse, Don't Validate)
// =============================================================================

/**
 * Parse and validate an install method string.
 * @param input - The method string to parse
 * @returns A valid InstallMethod
 * @throws SelfUpdateError if input is invalid
 */
export function parseInstallMethod(input: string): InstallMethod {
	const VALID_METHODS = ["curl", "npm", "pnpm", "bun", "yarn", "brew"] as const
	const method = VALID_METHODS.find((m) => m === input)
	if (!method) {
		throw new SelfUpdateError(
			`Invalid install method: "${input}"\nValid methods: ${VALID_METHODS.join(", ")}`,
		)
	}
	return method
}

// =============================================================================
// DETECTION PREDICATES (Law 5: Intentional Naming)
// =============================================================================

/** Check if running as compiled binary (Bun single-file executable) */
const isCompiledBinary = () => Bun.main.startsWith("/$bunfs/")

/** Check if installed via Bun global */
const isBunGlobalInstall = (path: string) =>
	path.includes("/.bun/bin") || path.includes("/.bun/install/global")

/** Check if installed via pnpm global */
const isPnpmGlobalInstall = (path: string) =>
	path.includes("/.pnpm/") || path.includes("/pnpm/global")

/** Check if installed via Yarn global */
const isYarnGlobalInstall = (path: string) =>
	path.includes("/.yarn/") || path.includes("/yarn/global")

/** Check if installed via Homebrew */
const isBrewInstall = (path: string) => path.includes("/Cellar/") || path.includes("/homebrew/")

/** Check if installed via npm global */
const isNpmGlobalInstall = (path: string) =>
	path.includes("/.npm/") || path.includes("/node_modules/")

// =============================================================================
// INSTALLATION DETECTION
// =============================================================================

/**
 * Detect how OCX was installed by analyzing paths.
 * Uses O(1) path analysis instead of slow shell commands.
 *
 * Detection priority:
 * 1. Compiled binary: Bun.main starts with `/$bunfs/` (bun's virtual filesystem)
 * 2. Script path patterns: Analyze process.argv[1] for package manager directories
 * 3. npm_config_user_agent: Works for npx/pnpx/bunx invocations
 * 4. Default: "unknown" if no patterns match
 *
 * @returns The detected installation method
 */
export function detectInstallMethod(): InstallMethod {
	// Compiled binary detection (curl install)
	if (isCompiledBinary()) {
		return "curl"
	}

	const scriptPath = process.argv[1] ?? ""

	// Package manager detection using predicates
	if (isBunGlobalInstall(scriptPath)) return "bun"
	if (isPnpmGlobalInstall(scriptPath)) return "pnpm"
	if (isYarnGlobalInstall(scriptPath)) return "yarn"
	if (isBrewInstall(scriptPath)) return "brew"
	if (isNpmGlobalInstall(scriptPath)) return "npm"

	// Fallback: check npm_config_user_agent
	const userAgent = process.env.npm_config_user_agent ?? ""
	if (userAgent.includes("pnpm")) return "pnpm"
	if (userAgent.includes("yarn")) return "yarn"
	if (userAgent.includes("bun")) return "bun"
	if (userAgent.includes("npm")) return "npm"

	// Unknown - will show helpful message to user
	return "unknown"
}

// =============================================================================
// EXECUTABLE PATH UTILITIES
// =============================================================================

/**
 * Get the path to the current OCX executable.
 *
 * For compiled binaries, returns `process.execPath` (the binary itself).
 * For npm/bun installs, returns `process.argv[1]` (the script path).
 *
 * @returns Absolute path to the OCX executable or script
 */
export function getExecutablePath(): string {
	// For compiled binaries, use process.execPath
	// For npm/bun, process.execPath returns the node/bun binary, not ocx
	if (typeof Bun !== "undefined" && Bun.main.startsWith("/$bunfs/")) {
		return process.execPath
	}

	// Script path for non-compiled (npm/bun global installs)
	return process.argv[1] ?? process.execPath
}
