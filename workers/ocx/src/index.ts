import { Hono } from "hono"
import { etag } from "hono/etag"
import { logger } from "hono/logger"
import { secureHeaders } from "hono/secure-headers"
import { trimTrailingSlash } from "hono/trailing-slash"

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

app.get("/schema.json", async (c) => {
	const githubRawBase = `https://raw.githubusercontent.com/${c.env.GITHUB_REPO}/${c.env.GITHUB_BRANCH}`
	const response = await fetch(`${githubRawBase}/docs/schemas/ocx.schema.json`)
	if (!response.ok) {
		return c.text("Schema not found", 404)
	}
	const content = await response.json()
	c.header("Cache-Control", "public, max-age=300, must-revalidate")
	c.header("Vary", "Accept-Encoding")
	return c.json(content)
})

app.get("/lock.schema.json", async (c) => {
	const githubRawBase = `https://raw.githubusercontent.com/${c.env.GITHUB_REPO}/${c.env.GITHUB_BRANCH}`
	const response = await fetch(`${githubRawBase}/docs/schemas/lock.schema.json`)
	if (!response.ok) {
		return c.text("Lock schema not found", 404)
	}
	const content = await response.json()
	c.header("Cache-Control", "public, max-age=300, must-revalidate")
	c.header("Vary", "Accept-Encoding")
	return c.json(content)
})

export default app
