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
 * 4. Exec path fallback: Check the runtime binary location
 * 5. Default: "unknown" if no patterns match
 *
 * @returns The detected installation method
 */
export function detectInstallMethod(): InstallMethod {
	// 1. Check for compiled binary (Bun single-file executable)
	if (typeof Bun !== "undefined" && Bun.main.startsWith("/$bunfs/")) {
		return "curl"
	}

	// 2. Analyze script path for package manager patterns
	const scriptPath = process.argv[1] || ""

	// npm patterns
	if (scriptPath.includes("/.npm/") || scriptPath.includes("/npm/")) return "npm"

	// pnpm patterns
	if (scriptPath.includes("/.pnpm/") || scriptPath.includes("/pnpm/")) return "pnpm"

	// yarn patterns (Classic - Berry doesn't support global)
	if (scriptPath.includes("/.yarn/") || scriptPath.includes("/yarn/global/")) return "yarn"

	// bun patterns
	if (scriptPath.includes("/.bun/") || scriptPath.includes("/bun/")) return "bun"

	// homebrew patterns (Intel and Apple Silicon)
	if (scriptPath.includes("/Cellar/") || scriptPath.includes("/homebrew/")) return "brew"

	// 3. Fallback: check npm_config_user_agent (works for npx/pnpx/bunx)
	const userAgent = process.env.npm_config_user_agent || ""
	if (userAgent.includes("pnpm")) return "pnpm"
	if (userAgent.includes("yarn")) return "yarn"
	if (userAgent.includes("bun")) return "bun"
	if (userAgent.includes("npm")) return "npm"

	// 4. Check process.execPath as last resort
	const execPath = process.execPath
	if (execPath.includes("/.bun/")) return "bun"
	if (execPath.includes("/node")) return "npm"

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
