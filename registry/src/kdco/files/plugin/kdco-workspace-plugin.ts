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

const PLAN_RULES = `<system-reminder>
<kdco-routing policy_level="critical">

## Agent Routing

| When you need to... | Delegate to |
|---------------------|-------------|
| Search THIS codebase (files, patterns, structure) | \`explore\` |
| Research OUTSIDE this codebase (docs, APIs, other repos, web) | \`kdco-librarian\` |
| Write human-facing content (commits, PRs, docs) | \`kdco-writer\` |

## Critical Constraints

**NEVER search the codebase yourself** - delegate to \`explore\`.
**NEVER research external sources yourself** - delegate to \`kdco-librarian\`.
**NEVER write commits/PRs/docs yourself** - delegate to \`kdco-writer\`.

<example>
User: "What does the OpenAI API say about function calling?"
Correct: delegate to kdco-librarian (external research)
Wrong: Try to answer from memory or use MCP tools directly
</example>

<example>
User: "Where is the auth middleware in this project?"
Correct: delegate to explore (codebase search)
Wrong: Use grep/glob directly
</example>

</kdco-routing>

<philosophy>
Load relevant skills before finalizing plan:
- Backend/logic work → \`skill\` load \`kdco-code-philosophy\`
- UI/frontend work → \`skill\` load \`kdco-frontend-philosophy\`
</philosophy>

<plan-format>
Use \`plan_save\` with structure:
- **Goal**: What we're building
- **Phases**: Sequential steps with dependencies
- **Status**: pending | in_progress | complete | blocked
</plan-format>
</system-reminder>`

const BUILD_RULES = `<system-reminder>
<kdco-routing policy_level="critical">

## Agent Routing

| When you need to... | Delegate to |
|---------------------|-------------|
| Search THIS codebase (files, patterns, structure) | \`explore\` |
| Research OUTSIDE this codebase (docs, APIs, other repos, web) | \`kdco-librarian\` |
| Write human-facing content (commits, PRs, docs) | \`kdco-writer\` |

## Critical Constraints

**NEVER search the codebase yourself** - delegate to \`explore\`.
**NEVER research external sources yourself** - delegate to \`kdco-librarian\`.
**NEVER write commits/PRs/docs yourself** - delegate to \`kdco-writer\`.

</kdco-routing>

<build-workflow>

### Before Writing Code
1. Call \`plan_read\` to get the current plan
2. Call \`delegation_list\` ONCE to see available research
3. Call \`delegation_read\` for relevant findings
4. **REUSE code snippets from librarian research** - they are production-ready

### Philosophy Loading
Load the relevant skill BEFORE implementation:
- Frontend work → \`skill\` load \`kdco-frontend-philosophy\`
- Backend work → \`skill\` load \`kdco-code-philosophy\`

### Execution
1. Orient: Read plan and delegation findings
2. Load: Load relevant philosophy skill(s)
3. Execute: Implement phase by phase
4. Update: Mark phases complete with \`plan_save\`
5. Verify: Run \`bun check\` before finishing

</build-workflow>
</system-reminder>`

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
