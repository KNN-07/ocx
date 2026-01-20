import { stat } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"

/**
 * Returns the global OpenCode config directory path.
 * Uses XDG_CONFIG_HOME if set and absolute, otherwise ~/.config/opencode
 */
export function getGlobalConfigPath(): string {
	const xdg = process.env.XDG_CONFIG_HOME
	const base = xdg && isAbsolute(xdg) ? xdg : join(homedir(), ".config")
	return join(base, "opencode")
}

/**
 * Checks if the global OpenCode config directory exists.
 * Returns true if ~/.config/opencode/ (or XDG equivalent) is a directory.
 */
export async function globalDirectoryExists(): Promise<boolean> {
	try {
		const info = await stat(getGlobalConfigPath())
		return info.isDirectory()
	} catch {
		return false
	}
}

/**
 * Resolves a component target path for global or local mode.
 * Registry targets start with ".opencode/" which should be stripped for global installs.
 *
 * @param target - The target path from registry (e.g., ".opencode/plugin/foo.ts")
 * @param isGlobal - Whether installing globally
 * @returns Resolved path (e.g., "plugin/foo.ts" for global, unchanged for local)
 */
export function resolveTargetPath(target: string, isGlobal: boolean): string {
	if (isGlobal && target.startsWith(".opencode/")) {
		return target.slice(".opencode/".length)
	}
	return target
}
