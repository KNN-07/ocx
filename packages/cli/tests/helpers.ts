import { existsSync } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { parse as parseJsonc } from "jsonc-parser"

export { parseJsonc }

export interface CLIResult {
	stdout: string
	stderr: string
	output: string
	exitCode: number
}

export async function createTempDir(prefix: string): Promise<string> {
	const path = join(
		import.meta.dir,
		"fixtures",
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

export async function runCLI(args: string[], cwd: string): Promise<CLIResult> {
	const indexPath = join(import.meta.dir, "..", "src/index.ts")

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
