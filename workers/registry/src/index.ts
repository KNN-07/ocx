import type { Context } from "hono"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { etag } from "hono/etag"
import { logger } from "hono/logger"
import { secureHeaders } from "hono/secure-headers"
import { trimTrailingSlash } from "hono/trailing-slash"

// =============================================================================
// Types
// =============================================================================

interface ComponentManifest {
	name: string
	type: string
	description: string
	files: Array<{ path: string; target: string }>
	dependencies: string[]
	mcpServers?: Record<string, unknown>
	mcpScope?: string
}

interface RegistryData {
	name: string
	prefix: string
	version: string
	author: string
	components: ComponentManifest[]
}

type AppEnv = {
	Bindings: Env
	Variables: {
		registry: RegistryData
	}
}

// =============================================================================
// Errors (Law 4: Fail Fast, Fail Loud)
// =============================================================================

class RegistryError extends Error {
	constructor(
		public code: string,
		public status: number,
		message: string,
	) {
		super(message)
		this.name = "RegistryError"
	}

	toResponse(c: Context) {
		return c.json({ error: this.code, message: this.message }, this.status as 400)
	}
}

// =============================================================================
// Data Fetching (Law 2: Parse at Boundary, Then Trust)
// =============================================================================

async function fetchRegistryData(env: Env): Promise<RegistryData> {
	const githubRawBase = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}`
	const url = `${githubRawBase}/registry/src/${env.REGISTRY_PREFIX}/registry.json`

	const response = await fetch(url)
	if (!response.ok) {
		throw new RegistryError(
			response.status === 404 ? "REGISTRY_NOT_FOUND" : "FETCH_ERROR",
			response.status,
			`Failed to fetch registry: ${response.status} ${response.statusText}`,
		)
	}

	return response.json() as Promise<RegistryData>
}

// =============================================================================
// App Setup
// =============================================================================

const app = new Hono<AppEnv>()

// Global middleware
app.use("*", logger())
app.use("*", secureHeaders())
app.use("*", trimTrailingSlash())
app.use("*", cors())
app.use("*", etag())

// Global error handler (Law 4: Fail Loud with details)
app.onError((err, c) => {
	if (err instanceof RegistryError) {
		return err.toResponse(c)
	}
	console.error("Unexpected error:", err)
	return c.json({ error: "INTERNAL_ERROR", message: err.message }, 500)
})

// Registry middleware - attach registry to context for /components/* routes
// (Law 2: Parse once at boundary, then trust the typed data)
app.use("/components/*", async (c, next) => {
	const registry = await fetchRegistryData(c.env)
	c.set("registry", registry)
	await next()
})

// =============================================================================
// Routes
// =============================================================================

/**
 * GET / - Redirect to /index.json
 */
app.get("/", (c) => {
	return c.redirect("/index.json")
})

/**
 * GET /index.json - Registry index with component summaries
 * Returns: { name, prefix, version, author, components: [{name, type, description}] }
 */
app.get("/index.json", async (c) => {
	const registry = await fetchRegistryData(c.env)

	const index = {
		name: registry.name,
		prefix: registry.prefix,
		version: registry.version,
		author: registry.author,
		components: registry.components.map((comp) => ({
			name: comp.name,
			type: comp.type,
			description: comp.description,
		})),
	}

	c.header("Cache-Control", "public, max-age=0, must-revalidate")
	c.header("Vary", "Accept-Encoding, Origin")
	return c.json(index)
})

/**
 * GET /components/{name}.json - Component packument (npm-style)
 * Returns: { name, "dist-tags": { latest }, versions: { "x.x.x": ComponentManifest } }
 */
app.get("/components/:name{.+\\.json$}", async (c) => {
	const registry = c.get("registry")
	const nameWithExt = c.req.param("name")
	const name = nameWithExt.replace(/\.json$/, "")

	const component = registry.components.find((comp) => comp.name === name)
	if (!component) {
		throw new RegistryError("COMPONENT_NOT_FOUND", 404, `Component '${name}' not found`)
	}

	const packument = {
		name: component.name,
		"dist-tags": {
			latest: registry.version,
		},
		versions: {
			[registry.version]: component,
		},
	}

	c.header("Cache-Control", "public, max-age=0, must-revalidate")
	c.header("Vary", "Accept-Encoding, Origin")
	return c.json(packument)
})

/**
 * GET /components/{name}/{path} - Raw file content
 * Returns: file content as text with appropriate Content-Type
 */
app.get("/components/:name/:path{.+}", async (c) => {
	const registry = c.get("registry")
	const name = c.req.param("name")
	const filePath = c.req.param("path")

	// Find component (Law 1: Early exit for invalid state)
	const component = registry.components.find((comp) => comp.name === name)
	if (!component) {
		throw new RegistryError("COMPONENT_NOT_FOUND", 404, `Component '${name}' not found`)
	}

	// Validate the requested file exists in the component's files array
	const fileEntry = component.files.find((f) => f.path === filePath)
	if (!fileEntry) {
		throw new RegistryError(
			"FILE_NOT_FOUND",
			404,
			`File '${filePath}' not found in component '${name}'`,
		)
	}

	// Determine the file's location based on component type
	const typeToDir: Record<string, string> = {
		"ocx:plugin": "plugin",
		"ocx:skill": "skill",
		"ocx:agent": "agent",
		"ocx:philosophy": "philosophy",
	}
	const typeDir = typeToDir[component.type] || component.type.replace("ocx:", "")

	// Build the GitHub raw URL
	const githubRawBase = `https://raw.githubusercontent.com/${c.env.GITHUB_REPO}/${c.env.GITHUB_BRANCH}`
	const fullPath = `${githubRawBase}/registry/src/${c.env.REGISTRY_PREFIX}/files/${typeDir}/${filePath}`

	const response = await fetch(fullPath)
	if (!response.ok) {
		throw new RegistryError(
			"FILE_FETCH_ERROR",
			response.status,
			`Failed to fetch file from GitHub: ${response.status}`,
		)
	}

	const content = await response.text()

	// Set appropriate content type based on extension (Law 5: Intentional naming)
	const extensionContentTypes: Record<string, string> = {
		".ts": "text/typescript; charset=utf-8",
		".md": "text/markdown; charset=utf-8",
		".json": "application/json; charset=utf-8",
	}
	const ext = filePath.substring(filePath.lastIndexOf("."))
	const contentType = extensionContentTypes[ext] || "text/plain; charset=utf-8"

	c.header("Cache-Control", "public, max-age=0, must-revalidate")
	c.header("Vary", "Accept-Encoding, Origin")

	return c.text(content, 200, {
		"Content-Type": contentType,
	})
})

export default app
