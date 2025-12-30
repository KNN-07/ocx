/**
 * Build script for OCX CLI
 * Compiles TypeScript to JavaScript
 */

export {}

await Bun.build({
	entrypoints: ["./src/index.ts"],
	outdir: "./dist",
	target: "bun",
	format: "esm",
	minify: false,
	sourcemap: "external",
})

console.log("✓ Build complete: ./dist/index.js")
