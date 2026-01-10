/**
 * Self Update Command
 *
 * Updates OCX to the latest version using the appropriate method:
 * - curl: Download binary directly and replace
 * - npm: Run `npm install -g ocx@version`
 * - pnpm: Run `pnpm install -g ocx@version`
 * - bun: Run `bun install -g ocx@version`
 *
 * Follows the 5 Laws of Elegant Defense:
 * - Early Exit: Return early if already up to date (unless --force)
 * - Parse Don't Validate: Version check returns typed VersionCheckResult
 * - Atomic Predictability: Each install method is a focused switch case
 * - Fail Fast: Throw SelfUpdateError on any failure
 * - Intentional Naming: updateCommand, notifyUpdated, detectInstallMethod
 */

import type { Command } from "commander"
import { checkForUpdate } from "../../self-update/check.js"
import {
	detectInstallMethod,
	type InstallMethod,
	parseInstallMethod,
} from "../../self-update/detect-method.js"
import {
	atomicReplace,
	cleanupTempFile,
	downloadToTemp,
	getDownloadUrl,
} from "../../self-update/download.js"
import { notifyUpdated, notifyUpToDate } from "../../self-update/notify.js"
import { fetchChecksums, verifyChecksum } from "../../self-update/verify.js"
import { SelfUpdateError } from "../../utils/errors.js"
import { handleError } from "../../utils/handle-error.js"
import { createSpinner } from "../../utils/spinner.js"

// =============================================================================
// CONSTANTS
// =============================================================================

/** Semver pattern to validate version format before package manager invocation */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[\w.]+)?$/

// =============================================================================
// TYPES
// =============================================================================

interface UpdateOptions {
	force?: boolean
	method?: string
}

// =============================================================================
// COMMAND IMPLEMENTATION
// =============================================================================

/**
 * Execute the self-update command.
 *
 * @param options - Command options (--force, --method)
 */
async function updateCommand(options: UpdateOptions): Promise<void> {
	const method = options.method ? parseInstallMethod(options.method) : detectInstallMethod()

	// Check current version
	const result = await checkForUpdate()
	if (!result) {
		throw new SelfUpdateError("Failed to check for updates")
	}

	const { current, latest, updateAvailable } = result

	// Early exit: already up to date (unless forced)
	if (!updateAvailable && !options.force) {
		notifyUpToDate(current)
		return
	}

	const targetVersion = latest

	switch (method) {
		case "curl": {
			await updateViaCurl(current, targetVersion)
			break
		}

		case "npm":
		case "pnpm":
		case "bun":
		case "unknown": {
			await updateViaPackageManager(method, current, targetVersion)
			break
		}
	}
}

// =============================================================================
// UPDATE STRATEGIES
// =============================================================================

/**
 * Update via direct binary download (curl install method).
 *
 * SECURITY: Verifies checksum BEFORE replacing the binary.
 * Flow: Download -> Verify -> Swap (atomic)
 */
async function updateViaCurl(current: string, targetVersion: string): Promise<void> {
	// Get platform target name for checksum lookup
	const url = getDownloadUrl(targetVersion)
	const filename = url.split("/").pop()

	// Early exit: invalid URL (shouldn't happen, but guard)
	if (!filename) {
		throw new SelfUpdateError("Failed to determine binary filename from download URL")
	}

	// Fetch checksums for verification
	const checksums = await fetchChecksums(targetVersion)

	// SECURITY: Fail loudly if no checksum available
	const expectedHash = checksums.get(filename)
	if (!expectedHash) {
		throw new SelfUpdateError(`Security error: No checksum found for ${filename}. Update aborted.`)
	}

	// Download to temp file (does NOT replace binary yet)
	const { tempPath, execPath } = await downloadToTemp(targetVersion)

	// SECURITY: Verify checksum BEFORE replacing the binary
	try {
		await verifyChecksum(tempPath, expectedHash, filename)
	} catch (error) {
		// Checksum failed - clean up temp file and abort
		cleanupTempFile(tempPath)
		throw error
	}

	// Checksum verified - now safe to atomically swap
	atomicReplace(tempPath, execPath)

	notifyUpdated(current, targetVersion)
}

/**
 * Run a package manager command using Bun.spawn.
 * Throws SelfUpdateError on failure.
 */
async function runPackageManager(cmd: string[]): Promise<void> {
	const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" })
	const exitCode = await proc.exited
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text()
		throw new SelfUpdateError(`Package manager command failed: ${stderr.trim()}`)
	}
}

/**
 * Update via package manager.
 * Shells out to the package manager's global install command.
 *
 * SECURITY: Validates version format before invoking package manager.
 */
async function updateViaPackageManager(
	method: Exclude<InstallMethod, "curl">,
	current: string,
	targetVersion: string,
): Promise<void> {
	// SECURITY: Validate version format to prevent command injection
	if (!SEMVER_PATTERN.test(targetVersion)) {
		throw new SelfUpdateError(`Invalid version format: ${targetVersion}`)
	}

	const spin = createSpinner({ text: `Updating via ${method}...` })
	spin.start()

	try {
		switch (method) {
			case "npm": {
				await runPackageManager(["npm", "install", "-g", `ocx@${targetVersion}`])
				break
			}
			case "pnpm": {
				await runPackageManager(["pnpm", "install", "-g", `ocx@${targetVersion}`])
				break
			}
			case "bun": {
				await runPackageManager(["bun", "install", "-g", `ocx@${targetVersion}`])
				break
			}
			case "unknown": {
				throw new SelfUpdateError(
					"Could not detect install method. Update manually with one of:\n" +
						"  npm install -g ocx@latest\n" +
						"  pnpm install -g ocx@latest\n" +
						"  bun install -g ocx@latest",
				)
			}
		}

		spin.succeed(`Updated via ${method}`)
		notifyUpdated(current, targetVersion)
	} catch (error) {
		// Re-throw SelfUpdateError as-is
		if (error instanceof SelfUpdateError) {
			spin.fail(`Update failed`)
			throw error
		}

		spin.fail(`Update failed`)
		throw new SelfUpdateError(
			`Failed to run ${method}: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
}

// =============================================================================
// COMMAND REGISTRATION
// =============================================================================

/**
 * Register the self update command.
 *
 * @param parent - Parent command (self)
 */
export function registerSelfUpdateCommand(parent: Command): void {
	parent
		.command("update")
		.description("Update OCX to the latest version")
		.option("-f, --force", "Reinstall even if already up to date")
		.option("-m, --method <method>", "Override install method detection (curl|npm|pnpm|bun)")
		.action(async (options: UpdateOptions) => {
			try {
				await updateCommand(options)
			} catch (error) {
				handleError(error)
			}
		})
}
