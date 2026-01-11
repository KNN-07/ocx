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
 * - "yarn": Installed globally via `yarn global add`
 * - "pnpm": Installed globally via `pnpm add -g`
 * - "bun": Installed globally via `bun add -g`
 * - "unknown": Unable to determine installation method
 */
export type InstallMethod = "curl" | "npm" | "yarn" | "pnpm" | "bun" | "unknown"

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
	const VALID_METHODS = ["curl", "npm", "yarn", "pnpm", "bun"] as const
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
// Most specific patterns first to avoid false positives
// =============================================================================

/** Check if running as compiled binary (Bun single-file executable) */
const isCompiledBinary = () => Bun.main.startsWith("/$bunfs/")

/** Check if running via npx/bunx/pnpx temp execution (not a persistent install) */
const isTempExecution = (path: string) =>
	path.includes("/_npx/") || path.includes("/.cache/bunx/") || path.includes("/.pnpm/_temp/")

/** Check if installed via Yarn global */
const isYarnGlobalInstall = (path: string) =>
	path.includes("/.yarn/global") || path.includes("/.config/yarn/global")

/** Check if installed via pnpm global */
const isPnpmGlobalInstall = (path: string) =>
	path.includes("/.pnpm/") || path.includes("/pnpm/global")

/** Check if installed via Bun global */
const isBunGlobalInstall = (path: string) =>
	path.includes("/.bun/bin") || path.includes("/.bun/install/global")

/** Check if installed via npm global (generic node_modules - least specific) */
const isNpmGlobalInstall = (path: string) =>
	path.includes("/.npm/") || path.includes("/node_modules/")

// =============================================================================
// INSTALLATION DETECTION
// =============================================================================

/**
 * Detect how OCX was installed by analyzing paths.
 * Uses O(1) path analysis instead of slow shell commands.
 *
 * Detection priority (MOST SPECIFIC FIRST):
 * 1. Compiled binary: Bun.main starts with `/$bunfs/` (bun's virtual filesystem)
 * 2. Temp execution: npx/bunx/pnpx temp paths (not a persistent install)
 * 3. Yarn global: `/.yarn/global` or `/.config/yarn/global` paths
 * 4. pnpm global: `/.pnpm/` or `/pnpm/global` paths
 * 5. Bun global: `/.bun/bin` or `/.bun/install/global` paths
 * 6. npm global: Generic `/node_modules/` (least specific, checked last)
 * 7. npm_config_user_agent: Fallback for package manager invocations
 * 8. Default: "unknown" if no patterns match
 *
 * @returns The detected installation method
 */
export function detectInstallMethod(): InstallMethod {
	// Compiled binary detection (curl install)
	if (isCompiledBinary()) {
		return "curl"
	}

	const scriptPath = process.argv[1] ?? ""

	// Package manager detection - MOST SPECIFIC FIRST
	// Temp execution paths (npx/bunx/pnpx) - not a persistent install
	if (isTempExecution(scriptPath)) return "unknown"

	// Yarn global - must check before generic node_modules
	if (isYarnGlobalInstall(scriptPath)) return "yarn"

	// pnpm global - specific pnpm paths
	if (isPnpmGlobalInstall(scriptPath)) return "pnpm"

	// Bun global - specific bun paths
	if (isBunGlobalInstall(scriptPath)) return "bun"

	// npm global - generic node_modules (LEAST SPECIFIC, checked last)
	if (isNpmGlobalInstall(scriptPath)) return "npm"

	// Fallback: check npm_config_user_agent
	const userAgent = process.env.npm_config_user_agent ?? ""
	if (userAgent.includes("yarn")) return "yarn"
	if (userAgent.includes("pnpm")) return "pnpm"
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
