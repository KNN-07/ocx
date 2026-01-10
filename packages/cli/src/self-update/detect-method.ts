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
 * - "bun": Installed globally via `bun add -g`
 * - "npm": Installed globally via `npm install -g`
 */
export type InstallMethod = "curl" | "npm" | "bun"

// =============================================================================
// INSTALLATION DETECTION
// =============================================================================

/**
 * Detect how OCX was installed.
 *
 * Detection priority:
 * 1. Compiled binary: Bun.main starts with `/$bunfs/` (bun's virtual filesystem)
 * 2. Bun global: execPath contains `.bun/install` or `bun/bin`
 * 3. npm global: execPath contains `node_modules` or `npm`
 * 4. Default: "curl" (standalone binary fallback)
 *
 * @returns The detected installation method
 */
export function detectInstallMethod(): InstallMethod {
	// Check if running as compiled binary first (most common case)
	// Bun.main will start with "/$bunfs/" for compiled binaries
	if (typeof Bun !== "undefined" && Bun.main.startsWith("/$bunfs/")) {
		return "curl"
	}

	const execPath = process.execPath

	// Check for bun global install path patterns
	if (execPath.includes(".bun/install") || execPath.includes("bun/bin")) {
		return "bun"
	}

	// Check for npm/node global install path patterns
	if (execPath.includes("node_modules") || execPath.includes("npm")) {
		return "npm"
	}

	// Default to curl (standalone binary)
	return "curl"
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
