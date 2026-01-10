// Copyright 2024-2026 the OCX authors. MIT license.

/**
 * Self-update notification display for terminal output.
 *
 * Provides Rustup-style update notifications with terminal-aware formatting.
 * Follows the 5 Laws of Elegant Defense:
 *
 * - **Early Exit**: TTY check before output
 * - **Intentional Naming**: {@linkcode notifyUpdate}, {@linkcode notifyUpdated}, {@linkcode notifyUpToDate}
 *
 * @example
 * ```ts
 * import { notifyUpdate } from "./notify"
 *
 * notifyUpdate("1.0.0", "1.1.0")
 * // Prints: "info: update available - 1.1.0 (current: 1.0.0)"
 * ```
 *
 * @module
 */

import kleur from "kleur"

/**
 * Display update notification in Rustup style.
 * Only displays if stdout is a TTY.
 *
 * Output format:
 *   info: update available - 1.3.0 (current: 1.2.2)
 *     run `ocx self update` to upgrade
 */
export function notifyUpdate(current: string, latest: string): void {
	if (!process.stdout.isTTY) return

	console.error(
		`${kleur.cyan("info")}: update available - ${kleur.green(latest)} (current: ${kleur.dim(current)})`,
	)
	console.error(`  run ${kleur.cyan("`ocx self update`")} to upgrade`)
}

/**
 * Display "already up to date" message.
 *
 * Output format:
 *   info: ocx unchanged - 1.2.2
 */
export function notifyUpToDate(version: string): void {
	console.error(`${kleur.cyan("info")}: ocx unchanged - ${kleur.dim(version)}`)
}

/**
 * Display successful update message.
 *
 * Output format:
 *     ocx updated - 1.3.0 (from 1.2.2)
 */
export function notifyUpdated(from: string, to: string): void {
	console.error(`  ${kleur.green("ocx updated")} - ${to} (from ${from})`)
}
