import { Hono } from "hono"
import { cors } from "hono/cors"
import { etag } from "hono/etag"
import { logger } from "hono/logger"
import { secureHeaders } from "hono/secure-headers"
import { trimTrailingSlash } from "hono/trailing-slash"

const app = new Hono<{ Bindings: Env }>()

app.use("*", logger())
app.use("*", secureHeaders())
app.use("*", trimTrailingSlash())
app.use("*", cors())
app.use("*", etag())

app.get("/", (c) => {
	return c.redirect("/registry.json")
})

app.get("/registry.json", async (c) => {
	const githubRawBase = `https://raw.githubusercontent.com/${c.env.GITHUB_REPO}/${c.env.GITHUB_BRANCH}`
	const response = await fetch(`${githubRawBase}/registry/src/kdco/registry.json`)
	if (!response.ok) {
		return c.json({ error: "Registry not found", path: c.req.path }, 404)
	}
	const content = await response.json()
	c.header("Cache-Control", "public, max-age=0, must-revalidate")
	c.header("Vary", "Accept-Encoding, Origin")
	return c.json(content)
})

app.get("/files/:registry/:path{.+}", async (c) => {
	const registry = c.req.param("registry")
	const filePath = c.req.param("path")

	// Guard: only serve files for this registry's prefix
	if (registry !== c.env.REGISTRY_PREFIX) {
		return c.json({ error: "Registry not found", registry }, 404)
	}

	const githubRawBase = `https://raw.githubusercontent.com/${c.env.GITHUB_REPO}/${c.env.GITHUB_BRANCH}`
	const response = await fetch(`${githubRawBase}/registry/src/${registry}/files/${filePath}`)

	if (!response.ok) {
		return c.json({ error: "File not found", path: c.req.path }, 404)
	}

	const content = await response.text()

	// Set appropriate content type based on extension
	let contentType = "text/plain; charset=utf-8"
	if (filePath.endsWith(".ts")) contentType = "text/typescript; charset=utf-8"
	if (filePath.endsWith(".md")) contentType = "text/markdown; charset=utf-8"
	if (filePath.endsWith(".json")) contentType = "application/json; charset=utf-8"

	c.header("Cache-Control", "public, max-age=0, must-revalidate")
	c.header("Vary", "Accept-Encoding, Origin")

	return c.text(content, 200, {
		"Content-Type": contentType,
	})
})

export default app
