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
