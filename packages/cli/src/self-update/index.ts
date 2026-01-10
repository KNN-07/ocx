/**
 * Self-Update Hook Integration
 *
 * Registers a post-action hook to check for updates after CLI commands.
 * Follows the 5 Laws of Elegant Defense:
 * - Early Exit: Multiple guard clauses for skip conditions
 * - Parse Don't Validate: Uses typed VersionCheckResult from check module
 * - Atomic Predictability: Pure shouldCheckForUpdate function
 * - Fail Fast: Silent failure on any error (non-blocking UX)
 * - Intentional Naming: Self-documenting function names
 */

import type { Command } from "commander"
import { checkForUpdate } from "./check.js"
import { notifyUpdate } from "./notify.js"

// =============================================================================
// UPDATE CHECK CONDITIONS
// =============================================================================

/**
 * Check environment conditions for running update check.
 * Returns false if any condition indicates we should skip.
 */
function shouldCheckForUpdate(): boolean {
	// Skip if explicitly disabled via env
	if (process.env.OCX_SELF_UPDATE === "off") return false
	if (process.env.OCX_NO_UPDATE_CHECK) return false

	// Skip in CI environments
	if (process.env.CI) return false

	// Skip if not a TTY (can't display notification anyway)
	if (!process.stdout.isTTY) return false

	return true
}

// =============================================================================
// HOOK REGISTRATION
// =============================================================================

/**
 * Register post-action hook for update checks.
 * Call this on the root program to check after every command.
 *
 * The hook runs after each command completes and silently checks for updates.
 * If a newer version is available, it displays a notification to stderr.
 *
 * @param program - The root Commander program instance
 */
export function registerUpdateCheckHook(program: Command): void {
	program.hook("postAction", async (thisCommand) => {
		// Skip if running self update command itself
		if (thisCommand.name() === "update" && thisCommand.parent?.name() === "self") {
			return
		}

		// Check environment conditions
		if (!shouldCheckForUpdate()) return

		// Non-blocking check with silent failure
		try {
			const result = await checkForUpdate()
			if (result?.updateAvailable) {
				notifyUpdate(result.current, result.latest)
			}
		} catch {
			// Silent failure - never interrupt user workflow
		}
	})
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export { checkForUpdate } from "./check.js"
export { notifyUpdate, notifyUpdated, notifyUpToDate } from "./notify.js"
