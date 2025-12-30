/**
 * Spinner utility for async operations
 * Uses ora, disabled in CI/non-TTY environments
 */

import ora, { type Ora } from "ora"
import { isTTY } from "./env"

export interface SpinnerOptions {
	text: string
	quiet?: boolean
}

/**
 * Create a spinner that works in TTY, falls back gracefully in CI
 */
export function createSpinner(options: SpinnerOptions): Ora {
	const shouldSpin = isTTY && !options.quiet

	const spinner = ora({
		text: options.text,
		isSilent: !shouldSpin,
	})

	return spinner
}

/**
 * Run an async function with a spinner
 */
export async function withSpinner<T>(
	options: SpinnerOptions,
	fn: (spinner: Ora) => Promise<T>,
): Promise<T> {
	const spinner = createSpinner(options)
	spinner.start()

	try {
		const result = await fn(spinner)
		spinner.succeed()
		return result
	} catch (error) {
		spinner.fail()
		throw error
	}
}
