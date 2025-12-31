import * as crypto from "node:crypto"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { type Plugin, tool } from "@opencode-ai/plugin"

/**
 * Type guard for Node.js filesystem errors (ENOENT, EACCES, etc.)
 * Follows "Parse, Don't Validate" - handle uncertainty at boundaries.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error
}

/**
 * Expected input for experimental.chat.system.transform hook.
 * Note: The official SDK types this as {}, but runtime provides these properties.
 * See: https://github.com/sst/opencode/issues/6142
 */
interface SystemTransformInput {
	agent?: string
	sessionID?: string
}

/**
 * KDCO Workspace Plugin
 *
 * Provides plan management and targeted rule injection.
 * Research functionality has been moved to the delegation system (kdco-background-agents).
 * Follows "Elegant Defense" philosophy: Flat, Safe, and Fast.
 */

// ==========================================
// RULES FOR INJECTION
// ==========================================

const PLAN_RULES = `
## Planning Workflow

1. **Delegate Research**: Use \`@librarian\` for external documentation and best practices
2. **Use @explore**: For codebase-specific questions
3. **Create Plan**: Structure with goal, phases, dependencies, and status
4. **Persist**: Save with \`plan_save\` for build mode to execute

## Plan Format

- **Goal**: What we're building
- **Phases**: Sequential steps with dependencies  
- **Status**: pending | in_progress | complete | blocked

## Delegation

- **@librarian**: External docs, API research, best practices (saves findings automatically)
- **@explore**: Codebase search, file patterns
`

const BUILD_RULES = `
## Implementation Workflow

1. **Orient**: Call \`plan_read\` to get the current plan
2. **Check Delegations**: Call \`delegation_list\` and \`delegation_read\` to use existing findings
3. **Load Philosophy**: Call \`skill\` to load \`kdco-code-philosophy\` before writing code
4. **Execute**: Implement the plan phase by phase
5. **Update Progress**: Mark phases complete with \`plan_save\`
6. **Verify**: Run \`bun check\` before finishing

## Important

- Follow the plan - don't deviate without justification
- Rely on existing delegations from planning phase
- Use **@writer** for commits and documentation
- Use **@explore** if you get stuck finding code
`

export const WorkspacePlugin: Plugin = async (ctx) => {
	const { directory } = ctx

	// Project-level storage directory (shared across sessions)
	const realDir = await fs.realpath(directory)
	const normalizedDir = realDir.endsWith(path.sep) ? realDir.slice(0, -1) : realDir
	const projectHash = crypto.createHash("sha256").update(normalizedDir).digest("hex").slice(0, 40)
	const baseDir = path.join(os.homedir(), ".local", "share", "opencode", "workspace", projectHash)

	/**
	 * Resolves the root session ID by walking up the parent chain.
	 */
	async function getRootSessionID(sessionID?: string): Promise<string> {
		if (!sessionID) {
			throw new Error("sessionID is required to resolve root session scope")
		}

		let currentID = sessionID
		for (let depth = 0; depth < 10; depth++) {
			const session = await ctx.client.session.get({
				path: { id: currentID },
			})

			if (!session.data?.parentID) {
				return currentID
			}

			currentID = session.data.parentID
		}

		throw new Error("Failed to resolve root session: maximum traversal depth exceeded")
	}

	return {
		tool: {
			plan_save: tool({
				description: "Save the current implementation plan for this session.",
				args: {
					goal: tool.schema.string().describe("The overall implementation goal"),
					phases: tool.schema
						.array(
							tool.schema.object({
								name: tool.schema.string().describe("Name of the phase"),
								status: tool.schema
									.enum(["pending", "in_progress", "complete", "blocked"])
									.describe("Current status of the phase"),
								steps: tool.schema.array(tool.schema.string()).describe("Actionable steps"),
								dependencies: tool.schema.array(tool.schema.string()).optional(),
							}),
						)
						.describe("Implementation phases"),
				},
				async execute(args, toolCtx) {
					if (!toolCtx?.sessionID) throw new Error("plan_save requires sessionID")
					const rootID = await getRootSessionID(toolCtx.sessionID)
					const sessionDir = path.join(baseDir, rootID)
					await fs.mkdir(sessionDir, { recursive: true })
					const planData = {
						goal: args.goal,
						phases: args.phases,
						updatedAt: new Date().toISOString(),
					}
					await fs.writeFile(
						path.join(sessionDir, "plan.json"),
						JSON.stringify(planData, null, 2),
						"utf8",
					)
					return `Plan saved.`
				},
			}),

			plan_read: tool({
				description: "Read the current implementation plan for this session.",
				args: {},
				async execute(_args, toolCtx) {
					if (!toolCtx?.sessionID) throw new Error("plan_read requires sessionID")
					const rootID = await getRootSessionID(toolCtx.sessionID)
					const planPath = path.join(baseDir, rootID, "plan.json")
					try {
						return await fs.readFile(planPath, "utf8")
					} catch (error) {
						if (isNodeError(error) && error.code === "ENOENT") return "No plan found."
						throw error
					}
				},
			}),
		},

		// Targeted Rule Injection
		"experimental.chat.system.transform": async (input: SystemTransformInput, output) => {
			const agent = input.agent
			if (agent === "plan") {
				output.system.push(PLAN_RULES)
			} else if (agent === "build") {
				output.system.push(BUILD_RULES)
			}
		},
	}
}

export default WorkspacePlugin
