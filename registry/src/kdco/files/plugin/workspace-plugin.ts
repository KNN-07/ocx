import * as crypto from "node:crypto"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { type Plugin, tool } from "@opencode-ai/plugin"
import { z } from "zod"

// ==========================================
// PLAN SCHEMA & VALIDATION
// ==========================================

const PhaseStatus = z.enum(["PENDING", "IN PROGRESS", "COMPLETE", "BLOCKED"])

const TaskSchema = z.object({
	id: z.string().regex(/^\d+\.\d+$/, "Task ID must be hierarchical (e.g., '2.1')"),
	checked: z.boolean(),
	content: z.string().min(1, "Task content cannot be empty"),
	isCurrent: z.boolean().optional(),
	citation: z
		.string()
		.regex(/^ref:[a-z]+-[a-z]+-[a-z]+$/, "Citation must be ref:word-word-word format")
		.optional(),
})

const PhaseSchema = z.object({
	number: z.number().int().positive(),
	name: z.string().min(1, "Phase name cannot be empty"),
	status: PhaseStatus,
	tasks: z.array(TaskSchema).min(1, "Phase must have at least one task"),
})

const FrontmatterSchema = z.object({
	status: z.enum(["not-started", "in-progress", "complete", "blocked"]),
	phase: z.number().int().positive(),
	updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
})

const PlanSchema = z.object({
	frontmatter: FrontmatterSchema,
	goal: z.string().min(10, "Goal must be at least 10 characters"),
	context: z
		.array(
			z.object({
				decision: z.string(),
				rationale: z.string(),
				source: z.string(),
			}),
		)
		.optional(),
	phases: z.array(PhaseSchema).min(1, "Plan must have at least one phase"),
})

type ValidationLevel = "ERROR" | "WARNING"

interface ValidationIssue {
	level: ValidationLevel
	path: string
	message: string
}

interface ValidationReport {
	valid: boolean
	issues: ValidationIssue[]
	summary: { errors: number; warnings: number }
}

const VALIDATION_MESSAGES = {
	FRONTMATTER_MISSING:
		"Plan must have YAML frontmatter. Expected format:\n```\n---\nstatus: in-progress\nphase: 2\nupdated: 2026-01-02\n---\n```",
	GOAL_MISSING:
		"Plan must have a ## Goal section. Add after frontmatter:\n```\n## Goal\nOne sentence describing the desired outcome\n```",
	MULTIPLE_CURRENT:
		"Only one task may be marked CURRENT. Remove ← CURRENT marker from all but the active task.",
	PHASE_EMPTY: "Phase must have at least one task.",
	TASK_ID_FORMAT: "Task ID must be hierarchical (phase.task). Example: '2.1' for Phase 2, Task 1.",
}

/**
 * Parse markdown plan into structured data.
 * Returns null if parsing fails.
 */
function parsePlanMarkdown(content: string): z.infer<typeof PlanSchema> | null {
	try {
		// Extract frontmatter
		const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
		if (!fmMatch) return null

		const fmLines = fmMatch[1].split("\n")
		const frontmatter: Record<string, string | number> = {}
		for (const line of fmLines) {
			const [key, ...valueParts] = line.split(":")
			if (key && valueParts.length > 0) {
				const value = valueParts.join(":").trim()
				frontmatter[key.trim()] = key.trim() === "phase" ? parseInt(value, 10) : value
			}
		}

		// Extract goal
		const goalMatch = content.match(/## Goal\n([^\n#]+)/)
		const goal = goalMatch?.[1]?.trim() || ""

		// Extract phases
		const phases: z.infer<typeof PhaseSchema>[] = []
		const phaseRegex =
			/## Phase (\d+): ([^\[]+)\[([^\]]+)\]\n([\s\S]*?)(?=## Phase \d+:|## Notes|## Blockers|$)/g

		let phaseMatch = phaseRegex.exec(content)
		while (phaseMatch !== null) {
			const phaseNum = parseInt(phaseMatch[1], 10)
			const phaseName = phaseMatch[2].trim()
			const phaseStatus = phaseMatch[3].trim() as z.infer<typeof PhaseStatus>
			const phaseContent = phaseMatch[4]

			const tasks: z.infer<typeof TaskSchema>[] = []
			const taskRegex =
				/- \[([ x])\] (\*\*)?(\d+\.\d+) ([^←\n]+)(← CURRENT)?.*?(`ref:[a-z]+-[a-z]+-[a-z]+`)?/g

			let taskMatch = taskRegex.exec(phaseContent)
			while (taskMatch !== null) {
				tasks.push({
					id: taskMatch[3],
					checked: taskMatch[1] === "x",
					content: taskMatch[4].trim().replace(/\*\*/g, ""),
					isCurrent: !!taskMatch[5],
					citation: taskMatch[6]?.replace(/`/g, ""),
				})
				taskMatch = taskRegex.exec(phaseContent)
			}

			if (tasks.length > 0) {
				phases.push({
					number: phaseNum,
					name: phaseName,
					status: phaseStatus,
					tasks,
				})
			}
			phaseMatch = phaseRegex.exec(content)
		}

		return {
			frontmatter: frontmatter as z.infer<typeof FrontmatterSchema>,
			goal,
			phases,
		}
	} catch {
		return null
	}
}

/**
 * Validate parsed plan against schema and business rules.
 */
function validatePlan(parsed: unknown): ValidationReport {
	const issues: ValidationIssue[] = []

	// Tier 1: Schema validation (ERRORs)
	const result = PlanSchema.safeParse(parsed)
	if (!result.success) {
		for (const error of result.error.errors) {
			issues.push({
				level: "ERROR",
				path: error.path.join("."),
				message: error.message,
			})
		}
	}

	// Tier 2: Business rules (WARNINGs)
	if (result.success) {
		const plan = result.data
		let currentCount = 0
		let inProgressCount = 0

		for (const phase of plan.phases) {
			if (phase.status === "IN PROGRESS") inProgressCount++
			for (const task of phase.tasks) {
				if (task.isCurrent) currentCount++
			}
		}

		if (currentCount > 1) {
			issues.push({
				level: "ERROR",
				path: "phases.*.tasks.*.isCurrent",
				message: VALIDATION_MESSAGES.MULTIPLE_CURRENT,
			})
		}

		if (inProgressCount > 1) {
			issues.push({
				level: "WARNING",
				path: "phases.*.status",
				message: "Multiple phases marked IN PROGRESS. Consider focusing on one phase at a time.",
			})
		}
	}

	return {
		valid: issues.filter((i) => i.level === "ERROR").length === 0,
		issues,
		summary: {
			errors: issues.filter((i) => i.level === "ERROR").length,
			warnings: issues.filter((i) => i.level === "WARNING").length,
		},
	}
}

/**
 * Format validation errors for AI self-correction.
 */
function formatValidationErrors(report: ValidationReport): string {
	const lines = ["❌ Plan validation failed:", ""]
	for (const issue of report.issues) {
		const prefix = issue.level === "ERROR" ? "ERROR" : "WARNING"
		lines.push(`${prefix} [${issue.path}]: ${issue.message}`)
	}
	lines.push("", "Fix the errors above and try again.")
	return lines.join("\n")
}

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
 * Research functionality has been moved to the delegation system (background-agents).
 * Follows "Elegant Defense" philosophy: Flat, Safe, and Fast.
 */

// ==========================================
// RULES FOR INJECTION
// ==========================================

const PLAN_RULES = `<system-reminder>
<workspace-routing policy_level="critical">

## Agent Routing

| When you need to... | Delegate to |
|---------------------|-------------|
| Search THIS codebase (files, patterns, structure) | \`explore\` |
| Research OUTSIDE this codebase (docs, APIs, other repos, web) | \`librarian\` |
| Write human-facing content (commits, PRs, docs) | \`writer\` |

## Critical Constraints

**NEVER search the codebase yourself** - delegate to \`explore\`.
**NEVER research external sources yourself** - delegate to \`librarian\`.
**NEVER write commits/PRs/docs yourself** - delegate to \`writer\`.

<example>
User: "What does the OpenAI API say about function calling?"
Correct: delegate to librarian (external research)
Wrong: Try to answer from memory or use MCP tools directly
</example>

<example>
User: "Where is the auth middleware in this project?"
Correct: delegate to explore (codebase search)
Wrong: Use grep/glob directly
</example>

</workspace-routing>

<philosophy>
Load relevant skills before finalizing plan:
- Backend/logic work → \`skill\` load \`code-philosophy\`
- UI/frontend work → \`skill\` load \`frontend-philosophy\`
</philosophy>

<plan-format>
Use \`plan_save\` to save your implementation plan as markdown.

### Format
\`\`\`markdown
---
status: in-progress
phase: 2
updated: YYYY-MM-DD
---

# Implementation Plan

## Goal
[One sentence describing the outcome]

## Context & Decisions
| Decision | Rationale | Source |
|----------|-----------|--------|
| [choice] | [why] | \`ref:delegation-id\` |

## Phase 1: [Name] [COMPLETE]
- [x] 1.1 Task description
- [x] 1.2 Another task → \`ref:delegation-id\`

## Phase 2: [Name] [IN PROGRESS]
- [x] 2.1 Completed task
- [ ] **2.2 Current task** ← CURRENT
- [ ] 2.3 Pending task
\`\`\`

### Rules
1. **One CURRENT task** - Only one task may have ← CURRENT
2. **Cite decisions** - Use \`ref:delegation-id\` for research-informed choices
3. **Update immediately** - Mark tasks complete right after finishing
</plan-format>
</system-reminder>`

const BUILD_RULES = `<system-reminder>
<workspace-routing policy_level="critical">

## Agent Routing

| When you need to... | Delegate to |
|---------------------|-------------|
| Search THIS codebase (files, patterns, structure) | \`explore\` |
| Research OUTSIDE this codebase (docs, APIs, other repos, web) | \`librarian\` |
| Write human-facing content (commits, PRs, docs) | \`writer\` |

## Critical Constraints

**NEVER search the codebase yourself** - delegate to \`explore\`.
**NEVER research external sources yourself** - delegate to \`librarian\`.
**NEVER write commits/PRs/docs yourself** - delegate to \`writer\`.

</workspace-routing>

<build-workflow>

### Before Writing Code
1. Call \`plan_read\` to get the current plan
2. Call \`delegation_list\` ONCE to see available research
3. Call \`delegation_read\` for relevant findings
4. **REUSE code snippets from librarian research** - they are production-ready

### Philosophy Loading
Load the relevant skill BEFORE implementation:
- Frontend work → \`skill\` load \`frontend-philosophy\`
- Backend work → \`skill\` load \`code-philosophy\`

### Execution
1. Orient: Read plan with \`plan_read\` and check delegation findings
2. Load: Load relevant philosophy skill(s)
3. Execute: Implement phase by phase, update plan after each task
4. Cite: Reference delegation research with \`ref:delegation-id\` in plan
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
				description:
					"Save the implementation plan as markdown. Must include citations (ref:delegation-id) for decisions based on research. Plan is validated before saving.",
				args: {
					content: tool.schema.string().describe("The full plan in markdown format"),
				},
				async execute(args, toolCtx) {
					if (!toolCtx?.sessionID) throw new Error("plan_save requires sessionID")
					const rootID = await getRootSessionID(toolCtx.sessionID)
					const sessionDir = path.join(baseDir, rootID)
					await fs.mkdir(sessionDir, { recursive: true })

					// Parse and validate
					const parsed = parsePlanMarkdown(args.content)
					if (!parsed) {
						return `❌ Failed to parse plan markdown.\n\n${VALIDATION_MESSAGES.FRONTMATTER_MISSING}`
					}

					const report = validatePlan(parsed)
					if (!report.valid) {
						return formatValidationErrors(report)
					}

					await fs.writeFile(path.join(sessionDir, "plan.md"), args.content, "utf8")
					return `Plan saved. (${report.summary.warnings} warnings)`
				},
			}),

			plan_read: tool({
				description: "Read the current implementation plan for this session.",
				args: {},
				async execute(_args, toolCtx) {
					if (!toolCtx?.sessionID) throw new Error("plan_read requires sessionID")
					const rootID = await getRootSessionID(toolCtx.sessionID)
					const planPath = path.join(baseDir, rootID, "plan.md")
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

		// Compaction Hook - Inject plan context when session is compacted
		"experimental.session.compacting": async (
			input: { sessionID: string },
			output: { context: string[]; prompt?: string },
		) => {
			const rootID = await getRootSessionID(input.sessionID)
			const planPath = path.join(baseDir, rootID, "plan.md")

			let planContent: string | null = null
			try {
				planContent = await fs.readFile(planPath, "utf8")
			} catch (error) {
				if (!isNodeError(error) || error.code !== "ENOENT") throw error
			}

			if (!planContent) return

			// Extract current task from plan
			const currentMatch = planContent.match(/← CURRENT/)
			const currentTask = currentMatch
				? planContent
						.slice(Math.max(0, currentMatch.index! - 100), currentMatch.index! + 50)
						.match(/\d+\.\d+ [^\n←]+/)?.[0]
				: null

			output.context.push(`<workspace-context>
## Current Plan
${planContent}

## Resume Point
${currentTask ? `Current task: ${currentTask}` : "No task marked as CURRENT"}

## Verification
To verify any cited decision, use \`delegation_read("ref:id")\`.
</workspace-context>`)
		},
	}
}

export default WorkspacePlugin
