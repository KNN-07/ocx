/**
 * Build script for OCX CLI
 * Compiles TypeScript to JavaScript
 */

import { readFileSync } from "node:fs"

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"))

await Bun.build({
	entrypoints: ["./src/index.ts"],
	outdir: "./dist",
	target: "bun",
	format: "esm",
	minify: false,
	sourcemap: "external",
	define: {
		__VERSION__: JSON.stringify(pkg.version),
	},
})

console.log(`✓ Build complete: ./dist/index.js (v${pkg.version})`)
