import { type Plugin, tool } from "@opencode-ai/plugin";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

/**
 * AgentCN Workspace Plugin
 *
 * Provides research persistence and plan management.
 * Follows "Elegant Defense" philosophy: Flat, Safe, and Fast.
 */
// WorkspacePlugin export
export const WorkspacePlugin: Plugin = async (ctx) => {
	const { directory } = ctx;

	// Project-level storage directory (shared across sessions)
	// Use realpath to ensure stable hashing even if accessed via symlinks
	const realDir = await fs.realpath(directory);
	const normalizedDir = realDir.endsWith(path.sep)
		? realDir.slice(0, -1)
		: realDir;

	const projectHash = crypto
		.createHash("sha256")
		.update(normalizedDir)
		.digest("hex")
		.slice(0, 40);

	const baseDir = path.join(
		os.homedir(),
		".local",
		"share",
		"opencode",
		"workspace",
		projectHash,
	);

	/**
	 * Resolves the root session ID by walking up the parent chain.
	 * Follows Law 1 (Early Exit) and Law 4 (Fail Fast).
	 */
	async function getRootSessionID(sessionID?: string): Promise<string> {
		if (!sessionID) {
			throw new Error("sessionID is required to resolve root session scope");
		}

		let currentID = sessionID;
		// Law 4: Guard against infinite loops or deep trees
		for (let depth = 0; depth < 10; depth++) {
			const session = await ctx.client.session.get({
				path: { id: currentID },
			});

			// Law 1: Found root session (no parent)
			if (!session.data?.parentID) {
				return currentID;
			}

			currentID = session.data.parentID;
		}

		throw new Error(
			"Failed to resolve root session: maximum traversal depth exceeded",
		);
	}

	// Log directory for debugging
	console.log(`[Workspace] Project Hash: ${projectHash}`);
	console.log(`[Workspace] Storage Dir: ${baseDir}`);

	return {
		tool: {
			research_save: tool({
				description: "Save a research finding to the project workspace.",
				args: {
					key: tool.schema
						.string()
						.describe("A unique slug for this research (e.g., 'auth-flow')"),
					content: tool.schema
						.string()
						.describe("The distilled knowledge to persist"),
				},
				async execute(args, toolCtx) {
					// Law 1: Guard clause
					if (!toolCtx?.sessionID) {
						throw new Error("research_save requires sessionID in toolCtx");
					}

					// Law 2: Parse at boundary
					const rootID = await getRootSessionID(toolCtx.sessionID);
					const researchDir = path.join(baseDir, rootID, "research");

					// Law 4: Fail Loud (let filesystem errors bubble)
					await fs.mkdir(researchDir, { recursive: true });

					const filePath = path.join(researchDir, `${args.key}.md`);
					await fs.writeFile(filePath, args.content, "utf8");

					return `Research saved to ${args.key}`;
				},
			}),

			research_list: tool({
				description: "List all research findings available in this project.",
				args: {},
				async execute(_args, toolCtx) {
					// Law 1: Guard clause
					if (!toolCtx?.sessionID) {
						throw new Error("research_list requires sessionID in toolCtx");
					}

					const rootID = await getRootSessionID(toolCtx.sessionID);
					const researchDir = path.join(baseDir, rootID, "research");

					// Law 4: Guard directory existence
					try {
						const files = await fs.readdir(researchDir);
						const keys = files
							.filter((f) => f.endsWith(".md"))
							.map((f) => f.replace(".md", ""));

						if (keys.length === 0) return "No research findings found.";
						return `Available research: ${keys.join(", ")}`;
					} catch (error) {
						// If directory doesn't exist, no research exists for this session
						if ((error as any).code === "ENOENT") {
							return "No research findings found.";
						}
						throw error;
					}
				},
			}),

			research_read: tool({
				description:
					"Read a specific research finding from the project workspace.",
				args: {
					key: tool.schema.string().describe("The key of the research to read"),
				},
				async execute(args, toolCtx) {
					// Law 1: Guard clause
					if (!toolCtx?.sessionID) {
						throw new Error("research_read requires sessionID in toolCtx");
					}

					const rootID = await getRootSessionID(toolCtx.sessionID);
					const filePath = path.join(
						baseDir,
						rootID,
						"research",
						`${args.key}.md`,
					);

					try {
						return await fs.readFile(filePath, "utf8");
					} catch (error) {
						if ((error as any).code === "ENOENT") {
							throw new Error(`Research not found: ${args.key}`);
						}
						throw error;
					}
				},
			}),

			plan_save: tool({
				description: "Save the current implementation plan for this session.",
				args: {
					goal: tool.schema
						.string()
						.describe("The overall implementation goal"),
					phases: tool.schema
						.array(
							tool.schema.object({
								name: tool.schema.string().describe("Name of the phase"),
								status: tool.schema
									.enum(["pending", "in_progress", "complete", "blocked"])
									.describe("Current status of the phase"),
								steps: tool.schema
									.array(tool.schema.string())
									.describe("Actionable steps in this phase"),
								dependencies: tool.schema
									.array(tool.schema.string())
									.optional()
									.describe("Names of phases this phase depends on"),
							}),
						)
						.describe("Array of implementation phases"),
				},
				async execute(args, toolCtx) {
					// Law 1: Guard clause
					if (!toolCtx?.sessionID) {
						throw new Error("plan_save requires sessionID in toolCtx");
					}

					const rootID = await getRootSessionID(toolCtx.sessionID);
					const sessionDir = path.join(baseDir, rootID);
					await fs.mkdir(sessionDir, { recursive: true });

					const planPath = path.join(sessionDir, "plan.json");
					const planData = {
						goal: args.goal,
						phases: args.phases,
						updatedAt: new Date().toISOString(),
					};

					await fs.writeFile(
						planPath,
						JSON.stringify(planData, null, 2),
						"utf8",
					);
					return `Plan saved to ${planPath}`;
				},
			}),

			plan_read: tool({
				description: "Read the current implementation plan for this session.",
				args: {},
				async execute(_args, toolCtx) {
					// Law 1: Guard clause
					if (!toolCtx?.sessionID) {
						throw new Error("plan_read requires sessionID in toolCtx");
					}

					const rootID = await getRootSessionID(toolCtx.sessionID);
					const planPath = path.join(baseDir, rootID, "plan.json");

					try {
						return await fs.readFile(planPath, "utf8");
					} catch (error) {
						if ((error as any).code === "ENOENT") {
							return "No plan found for this session.";
						}
						throw error;
					}
				},
			}),
		},
	};
};

export default WorkspacePlugin;
