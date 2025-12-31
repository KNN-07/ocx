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
## Plan Mode

You are in PLAN MODE. Delegate all research - do NOT research directly.

### Research Delegation
- **External research** (docs, APIs, best practices) → \`delegate\` to \`kdco-librarian\`
- **Internal codebase** (files, patterns, structure) → \`delegate\` to \`explore\`
- **NEVER** use MCP tools directly - they are disabled for you in plan mode

### Philosophy-Informed Planning

When planning **CODE** implementation:
- **Law 1 (Early Exit)**: Plan for guard clauses and boundary validation first
- **Law 2 (Parse Don't Validate)**: Design types that make illegal states unrepresentable
- **Law 3 (Atomic Predictability)**: Prefer pure functions with explicit I/O boundaries
- **Law 4 (Fail Fast)**: Plan explicit error handling at system boundaries
- **Law 5 (Intentional Naming)**: Names should reveal intent and enforce contracts

When planning **UI** implementation:
- **Pillar 1 (Typography)**: Plan for fonts with character, not generic system fonts
- **Pillar 2 (Color)**: Commit to bold, intentional color choices
- **Pillar 3 (Motion)**: One good animation beats many mediocre ones
- **Pillar 4 (Composition)**: Consider asymmetry and purposeful negative space
- **Pillar 5 (Atmosphere)**: Plan for depth, texture, and environmental feel

### Plan Format
- **Goal**: What we're building
- **Phases**: Sequential steps with dependencies
- **Status**: pending | in_progress | complete | blocked

### Workflow
1. Determine what research is needed (external vs internal)
2. Launch parallel delegations for ALL research in one message
3. Do productive work while waiting (organize thoughts, communicate with user)
4. When \`<system-reminder>\` arrives, call \`delegation_read\` to retrieve results
5. Synthesize findings and apply philosophy principles
6. Save plan with \`plan_save\` for build mode
`

const BUILD_RULES = `
## Build Mode

You are in BUILD MODE. Execute the plan created in planning phase.

### Before Writing ANY Code
1. Call \`plan_read\` to get the current plan
2. Call \`delegation_list\` ONCE to see available research from planning phase
3. Call \`delegation_read\` for each relevant delegation to get findings
4. **REUSE code snippets from librarian research** - they are production-ready foundations

### Philosophy Loading (Context-Aware)
Load the relevant philosophy skill BEFORE implementation:
- **Frontend work** (.tsx, .jsx, .css, components/, pages/) → \`skill\` load \`kdco-frontend-philosophy\`
- **Backend work** (.ts, api/, lib/, services/, utils/) → \`skill\` load \`kdco-code-philosophy\`
- **Both** → Load both skills

### Additional Delegations (If Needed)
Prefer using existing delegations from planning phase over launching new ones.

**PREFER async delegation** when you have **productive work** to do while waiting:
- Implementing other parts of the plan
- Writing tests
- Refactoring existing code

### Agent Routing
- **\`kdco-writer\`**: For commits, documentation, PRs
- **\`explore\`**: If stuck finding code in the codebase

### Workflow
1. Orient: Read plan and delegation findings
2. Load: Load relevant philosophy skill(s)
3. Execute: Implement phase by phase, copying code from research where applicable
4. Update: Mark phases complete with \`plan_save\`
5. Verify: Run \`bun check\` before finishing
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
