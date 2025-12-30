import { existsSync } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"

export interface CLIResult {
	stdout: string
	stderr: string
	output: string
	exitCode: number
}

export async function createTempDir(prefix: string): Promise<string> {
	const path = join(
		process.cwd(),
		"tests/fixtures",
		`tmp-${prefix}-${Math.random().toString(36).slice(2)}`,
	)
	await mkdir(path, { recursive: true })
	return path
}

export async function cleanupTempDir(path: string): Promise<void> {
	if (existsSync(path)) {
		await rm(path, { recursive: true, force: true })
	}
}

/**
 * Strips JSONC comments for parsing in tests
 * Minimal version that avoids breaking URLs
 */
export function stripJsonc(content: string): string {
	return content
		.split("\n")
		.map((line) => {
			const trimmed = line.trim()
			if (trimmed.startsWith("//")) return ""
			// This is still naive but better for our tests which don't use complex JSONC
			return line
		})
		.join("\n")
		.replace(/\/\*[\s\S]*?\*\//g, "")
}

export async function runCLI(args: string[], cwd: string): Promise<CLIResult> {
	const indexPath = join(process.cwd(), "packages/cli/src/index.ts")

	const proc = Bun.spawn(["bun", "run", indexPath, ...args], {
		cwd,
		env: {
			...process.env,
			FORCE_COLOR: "0",
		},
		stdout: "pipe",
		stderr: "pipe",
	})

	const stdout = await new Response(proc.stdout).text()
	const stderr = await new Response(proc.stderr).text()
	const exitCode = await proc.exited

	return {
		stdout,
		stderr,
		output: stdout + stderr,
		exitCode,
	}
}
