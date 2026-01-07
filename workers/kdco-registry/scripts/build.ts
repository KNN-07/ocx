import * as fs from "node:fs/promises"
import * as path from "node:path"
import { buildRegistry } from "ocx"

const result = await buildRegistry({
	source: ".",
	out: "dist",
})

console.log(`✓ Built ${result.componentsCount} components to ${result.outputPath}`)

// Copy schemas to dist
const schemasDir = path.join(import.meta.dir, "..", "schemas")
const distSchemasDir = path.join(import.meta.dir, "..", "dist", "schemas")
try {
	await fs.cp(schemasDir, distSchemasDir, { recursive: true })
	console.log("✓ Copied schemas to dist")
} catch (_error) {
	console.log("⚠ No schemas directory found, skipping")
}
