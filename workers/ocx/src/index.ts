import { Hono } from "hono"
import { etag } from "hono/etag"
import { logger } from "hono/logger"
import { secureHeaders } from "hono/secure-headers"
import { trimTrailingSlash } from "hono/trailing-slash"

const VALID_SCHEMAS = ["ocx", "profile", "local", "lock", "registry"] as const
type SchemaName = (typeof VALID_SCHEMAS)[number]

const SCHEMA_FILES: Record<SchemaName, string> = {
	ocx: "docs/schemas/ocx.schema.json",
	profile: "docs/schemas/profile.json",
	local: "docs/schemas/local.json",
	lock: "docs/schemas/lock.schema.json",
	registry: "docs/schemas/registry.schema.json",
}

const app = new Hono<{ Bindings: Env }>()

app.use("*", logger())
app.use("*", secureHeaders())
app.use("*", trimTrailingSlash())
app.use("*", etag())

app.get("/", (c) => {
	return c.redirect(`https://github.com/${c.env.GITHUB_REPO}`)
})

app.get("/install.sh", async (c) => {
	const githubRawBase = `https://raw.githubusercontent.com/${c.env.GITHUB_REPO}/${c.env.GITHUB_BRANCH}`
	const response = await fetch(`${githubRawBase}/packages/cli/scripts/install.sh`)
	if (!response.ok) {
		return c.text("Install script not found", 404)
	}
	const content = await response.text()
	return c.text(content, 200, {
		"Content-Type": "text/plain; charset=utf-8",
		"Cache-Control": "public, max-age=300, must-revalidate",
		"Content-Disposition": 'inline; filename="install.sh"',
		Vary: "Accept-Encoding",
	})
})

// Backward compatibility redirects
app.get("/schema.json", (c) => c.redirect("/schemas/ocx.json", 301))
app.get("/lock.schema.json", (c) => c.redirect("/schemas/lock.json", 301))

// Unified schema route
app.get("/schemas/:name{.+\\.json}", async (c) => {
	const nameWithExt = c.req.param("name") // "registry.json"
	const name = nameWithExt.replace(/\.json$/, "") // "registry"

	// Validate against allowed schemas
	if (!VALID_SCHEMAS.includes(name as SchemaName)) {
		return c.json(
			{ error: "Invalid schema", validSchemas: VALID_SCHEMAS.map((s) => `${s}.json`) },
			400,
		)
	}

	const filePath = SCHEMA_FILES[name as SchemaName]

	const res = await fetch(
		`https://raw.githubusercontent.com/${c.env.GITHUB_REPO}/${c.env.GITHUB_BRANCH}/${filePath}`,
		{ cf: { cacheTtl: 3600, cacheEverything: true } },
	)

	if (!res.ok) {
		const status = res.status === 404 ? 404 : 502
		return c.json({ error: "Failed to fetch schema" }, status)
	}

	try {
		const content = await res.json()
		return c.json(content, 200, {
			"Cache-Control": "public, max-age=300, s-maxage=3600",
			Vary: "Accept-Encoding",
		})
	} catch {
		return c.json({ error: "Invalid schema format from upstream" }, 502)
	}
})

export default app
