/**
 * Build binary script for OCX CLI
 * Creates standalone executables for multiple platforms
 */

export {}

import { readFileSync } from "node:fs"
import { join } from "node:path"

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"))
const _version = pkg.version // Available for future use (e.g., versioned binaries)

// Target matrix matching OpenCode's platform support
// - baseline: for CPUs without AVX2 support
// - musl: for Alpine Linux / musl libc
const targets = [
	// macOS
	"bun-darwin-arm64",
	"bun-darwin-x64",
	"bun-darwin-x64-baseline",
	// Linux (glibc)
	"bun-linux-arm64",
	"bun-linux-x64",
	"bun-linux-x64-baseline",
	// Linux (musl/Alpine)
	"bun-linux-arm64-musl",
	"bun-linux-x64-musl",
	"bun-linux-x64-baseline-musl",
	// Windows
	"bun-windows-x64",
	"bun-windows-x64-baseline",
] as const

type Target = (typeof targets)[number]

const outDir = "./dist/bin"

async function buildBinary(target: Target) {
	const ext = target.includes("windows") ? ".exe" : ""
	const outfile = join(outDir, `ocx-${target.replace("bun-", "")}${ext}`)

	console.log(`Building ${target}...`)

	// Use bun's compile for the actual binary
	const proc = Bun.spawn([
		"bun",
		"build",
		"--compile",
		`--target=${target}`,
		"--minify",
		`--outfile=${outfile}`,
		"./src/index.ts",
	])

	await proc.exited

	if (proc.exitCode !== 0) {
		console.error(`Failed to compile binary for ${target}`)
		process.exit(1)
	}

	console.log(`✓ ${outfile}`)
}

// Parse args
const args = process.argv.slice(2)
const targetArg = args.find((a) => a.startsWith("--target="))
const allFlag = args.includes("--all")

if (allFlag) {
	// Build all targets
	for (const target of targets) {
		await buildBinary(target)
	}
} else if (targetArg) {
	// Build specific target
	const target = targetArg.replace("--target=", "") as Target
	if (!targets.includes(target)) {
		console.error(`Invalid target: ${target}`)
		console.error(`Valid targets: ${targets.join(", ")}`)
		process.exit(1)
	}
	await buildBinary(target)
} else {
	// Default: build for current platform
	const platform = process.platform
	const arch = process.arch

	let target: Target
	if (platform === "darwin" && arch === "arm64") {
		target = "bun-darwin-arm64"
	} else if (platform === "darwin") {
		target = "bun-darwin-x64"
	} else if (platform === "linux" && arch === "arm64") {
		target = "bun-linux-arm64"
	} else if (platform === "linux") {
		target = "bun-linux-x64"
	} else if (platform === "win32") {
		target = "bun-windows-x64-baseline"
	} else {
		console.error(`Unsupported platform: ${platform}-${arch}`)
		process.exit(1)
	}

	await buildBinary(target)
}

console.log("\n✓ Binary build complete")
