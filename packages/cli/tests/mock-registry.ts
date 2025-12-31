import type { Server } from "bun"

export interface MockRegistry {
	server: Server<unknown>
	url: string
	stop: () => void
	setFileContent: (componentName: string, fileName: string, content: string) => void
}

/**
 * Start a mock HTTP registry server for testing
 */
export function startMockRegistry(): MockRegistry {
	const customFiles = new Map<string, string>()

	const components = {
		"kdco-test-plugin": {
			name: "kdco-test-plugin",
			type: "ocx:plugin",
			description: "A test plugin",
			files: [{ path: "index.ts", target: ".opencode/plugin/kdco-test-plugin.ts" }],
			dependencies: [],
		},
		"kdco-test-skill": {
			name: "kdco-test-skill",
			type: "ocx:skill",
			description: "A test skill",
			files: [{ path: "SKILL.md", target: ".opencode/skill/kdco-test-skill/SKILL.md" }],
			dependencies: ["kdco-test-plugin"],
		},
		"kdco-test-agent": {
			name: "kdco-test-agent",
			type: "ocx:agent",
			description: "A test agent",
			files: [{ path: "agent.md", target: ".opencode/agent/kdco-test-agent.md" }],
			dependencies: ["kdco-test-skill"],
			mcpServers: {
				"test-mcp": {
					type: "remote",
					url: "https://mcp.test.com",
				},
			},
		},
	}

	const server = Bun.serve({
		port: 0, // Random port
		fetch(req) {
			const url = new URL(req.url)
			const path = url.pathname

			if (path === "/index.json") {
				return Response.json({
					name: "Test Registry",
					prefix: "kdco",
					version: "1.0.0",
					author: "Test Author",
					components: Object.values(components).map((c) => ({
						name: c.name,
						type: c.type,
						description: c.description,
					})),
				})
			}

			const componentMatch = path.match(/^\/components\/(.+)\.json$/)
			if (componentMatch) {
				const name = componentMatch[1]
				const component = components[name as keyof typeof components]
				if (component) {
					return Response.json({
						name: component.name,
						"dist-tags": {
							latest: "1.0.0",
						},
						versions: {
							"1.0.0": component,
						},
					})
				}
			}

			const fileMatch = path.match(/^\/components\/(.+)\/(.+)$/)
			if (fileMatch) {
				const [, name, filePath] = fileMatch
				const customKey = `${name}:${filePath}`
				if (customFiles.has(customKey)) {
					return new Response(customFiles.get(customKey))
				}
				return new Response(`Content of ${filePath} for ${name}`)
			}

			return new Response("Not Found", { status: 404 })
		},
	})

	return {
		server,
		url: `http://localhost:${server.port}`,
		stop: () => server.stop(),
		setFileContent: (componentName: string, fileName: string, content: string) => {
			customFiles.set(`${componentName}:${fileName}`, content)
		},
	}
}
