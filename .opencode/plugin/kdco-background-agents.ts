/**
 * kdco-background-agents
 * Unified delegation system for OpenCode
 *
 * Replaces native `task` tool with persistent, async-first agent delegation.
 * All agent outputs are persisted to storage, orchestrator receives only key references.
 *
 * Based on oh-my-opencode by @code-yeongyu (MIT License)
 * https://github.com/code-yeongyu/oh-my-opencode
 */

/// <reference types="bun-types" />

import * as crypto from "node:crypto"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { type Plugin, tool, type ToolContext } from "@opencode-ai/plugin"
import type { Event, Message, Part, TextPart, createOpencodeClient } from "@opencode-ai/sdk"

// ==========================================
// TYPE DEFINITIONS
// ==========================================

type OpencodeClient = ReturnType<typeof createOpencodeClient>

interface SessionMessageItem {
	info: Message
	parts: Part[]
}

interface AssistantSessionMessageItem {
	info: Message & { role: "assistant" }
	parts: Part[]
}

interface DelegationProgress {
	toolCalls: number
	lastUpdate: Date
	lastMessage?: string
	lastMessageAt?: Date
}

const MAX_RUN_TIME_MS = 5 * 60 * 1000 // 5 minutes

interface Delegation {
	id: string
	key: string
	sessionID: string
	parentSessionID: string
	parentMessageID: string
	parentAgent: string
	description: string
	prompt: string
	agent: string
	status: "running" | "complete" | "error" | "cancelled" | "timeout"
	startedAt: Date
	completedAt?: Date
	progress: DelegationProgress
	error?: string
	parentModel?: { providerID: string; modelID: string }
}

interface DelegateInput {
	parentSessionID: string
	parentMessageID: string
	parentAgent: string
	description: string
	prompt: string
	agent: string
	key: string
	parentModel?: { providerID: string; modelID: string }
}

interface DelegationListItem {
	key: string
	status: string
	description: string
}

// ==========================================
// DELEGATION MANAGER
// ==========================================

class DelegationManager {
	private delegations: Map<string, Delegation> = new Map()
	private keyToId: Map<string, string> = new Map() // key -> delegation id lookup
	private client: OpencodeClient
	private baseDir: string

	constructor(client: OpencodeClient, baseDir: string) {
		this.client = client
		this.baseDir = baseDir
	}

	/**
	 * Resolves the root session ID by walking up the parent chain.
	 */
	private async getRootSessionID(sessionID: string): Promise<string> {
		let currentID = sessionID
		// Prevent infinite loops with max depth
		for (let depth = 0; depth < 10; depth++) {
			try {
				const session = await this.client.session.get({
					path: { id: currentID },
				})

				if (!session.data?.parentID) {
					return currentID
				}

				currentID = session.data.parentID
			} catch {
				// If we can't fetch the session, assume current is root or best effort
				return currentID
			}
		}
		return currentID
	}

	/**
	 * Get the delegations directory for a session scope (root session)
	 */
	private async getDelegationsDir(sessionID: string): Promise<string> {
		const rootID = await this.getRootSessionID(sessionID)
		return path.join(this.baseDir, rootID)
	}

	/**
	 * Ensure the delegations directory exists
	 */
	private async ensureDelegationsDir(sessionID: string): Promise<string> {
		const dir = await this.getDelegationsDir(sessionID)
		await fs.mkdir(dir, { recursive: true })
		return dir
	}

	/**
	 * Generate a unique delegation ID
	 */
	private generateId(): string {
		const timestamp = Date.now().toString(36)
		const random = Math.random().toString(36).substring(2, 8)
		return `dlg_${timestamp}_${random}`
	}

	/**
	 * Delegate a task to an agent
	 */
	async delegate(input: DelegateInput): Promise<Delegation> {
		await this.debugLog(`delegate() called with description: ${input.description}`)

		const key = input.key
		await this.debugLog(`Using key: ${key}`)

		// Check for key collisions
		if (this.keyToId.has(key)) {
			throw new Error(`Delegation key collision: "${key}" is already in use in this session.`)
		}

		// Create isolated session for delegation
		const sessionResult = await this.client.session.create({
			body: {
				title: `Delegation: ${input.description}`,
				parentID: input.parentSessionID,
			},
		})

		await this.debugLog(`session.create result: ${JSON.stringify(sessionResult.data)}`)

		if (!sessionResult.data?.id) {
			throw new Error("Failed to create delegation session")
		}

		const delegation: Delegation = {
			id: this.generateId(),
			key,
			sessionID: sessionResult.data.id,
			parentSessionID: input.parentSessionID,
			parentMessageID: input.parentMessageID,
			parentAgent: input.parentAgent,
			description: input.description,
			prompt: input.prompt,
			agent: input.agent,
			status: "running",
			startedAt: new Date(),
			progress: {
				toolCalls: 0,
				lastUpdate: new Date(),
			},
			parentModel: input.parentModel,
		}

		await this.debugLog(`Created delegation ${delegation.id} with key: ${delegation.key}`)
		this.delegations.set(delegation.id, delegation)
		this.keyToId.set(delegation.key, delegation.id)
		await this.debugLog(
			`Delegation added to map. Current delegations: ${Array.from(this.delegations.keys()).join(", ")}`,
		)

		// Set a timer for the global max run time
		setTimeout(() => {
			const current = this.delegations.get(delegation.id)
			if (current && current.status === "running") {
				this.handleTimeout(delegation.id)
			}
		}, MAX_RUN_TIME_MS + 5000) // Adding 5s buffer

		// Ensure delegations directory exists (early check)
		await this.ensureDelegationsDir(input.parentSessionID)

		// Fire the prompt asynchronously
		this.client.session
			.promptAsync({
				path: { id: delegation.sessionID },
				body: {
					agent: input.agent,
					model: input.parentModel,
					// Anti-recursion: disable nested delegations
					tools: {
						task: false,
						delegate: false,
					},
					parts: [{ type: "text", text: input.prompt }],
				},
			})
			.catch((error: Error) => {
				delegation.status = "error"
				delegation.error = error.message
				delegation.completedAt = new Date()
				this.persistOutput(delegation, `Error: ${error.message}`)
				this.notifyParent(delegation)
			})

		return delegation
	}

	/**
	 * Handle delegation timeout
	 */
	private async handleTimeout(delegationId: string): Promise<void> {
		const delegation = this.delegations.get(delegationId)
		if (!delegation || delegation.status !== "running") return

		await this.debugLog(`handleTimeout for delegation ${delegation.id}`)

		delegation.status = "timeout"
		delegation.completedAt = new Date()
		delegation.error = `Delegation timed out after ${MAX_RUN_TIME_MS / 1000}s`

		// Try to cancel the session
		try {
			await this.client.session.delete({
				path: { id: delegation.sessionID },
			})
		} catch {
			// Ignore
		}

		// Get whatever result was produced so far
		const result = await this.getResult(delegation)
		await this.persistOutput(delegation, result + "\n\n[TIMEOUT REACHED]")

		// Notify parent session
		await this.notifyParent(delegation)
	}

	/**
	 * Wait for a delegation to complete (polling)
	 */
	private async waitForCompletion(delegationId: string): Promise<void> {
		const pollInterval = 1000
		const startTime = Date.now()

		const delegation = this.delegations.get(delegationId)
		if (!delegation) return

		while (
			delegation.status === "running" &&
			Date.now() - startTime < MAX_RUN_TIME_MS + 10000 // Slightly more than global limit
		) {
			await new Promise((resolve) => setTimeout(resolve, pollInterval))
		}
	}

	/**
	 * Handle session.idle event - called when a session becomes idle
	 */
	async handleSessionIdle(sessionID: string): Promise<void> {
		const delegation = this.findBySession(sessionID)
		if (!delegation || delegation.status !== "running") return

		await this.debugLog(`handleSessionIdle for delegation ${delegation.id}`)

		delegation.status = "complete"
		delegation.completedAt = new Date()

		// Get and persist the result
		const result = await this.getResult(delegation)
		await this.persistOutput(delegation, result)

		// Notify parent session
		await this.notifyParent(delegation)
	}

	/**
	 * Get the result from a delegation's session
	 */
	private async getResult(delegation: Delegation): Promise<string> {
		try {
			const messages = await this.client.session.messages({
				path: { id: delegation.sessionID },
			})

			const messageData = messages.data as SessionMessageItem[] | undefined

			if (!messageData || messageData.length === 0) {
				await this.debugLog(`getResult: No messages found for session ${delegation.sessionID}`)
				return `Delegation "${delegation.description}" completed but produced no output.`
			}

			await this.debugLog(
				`getResult: Found ${messageData.length} messages. Roles: ${messageData.map((m) => m.info.role).join(", ")}`,
			)

			// Find the last message from the assistant/model
			const isAssistantMessage = (m: SessionMessageItem): m is AssistantSessionMessageItem =>
				m.info.role === "assistant"

			const assistantMessages = messageData.filter(isAssistantMessage)

			if (assistantMessages.length === 0) {
				await this.debugLog(
					`getResult: No assistant messages found in ${JSON.stringify(messageData.map((m) => ({ role: m.info.role, keys: Object.keys(m) })))}`,
				)
				return `Delegation "${delegation.description}" completed but produced no assistant response.`
			}

			const lastMessage = assistantMessages[assistantMessages.length - 1]

			// Extract text parts from the message
			const isTextPart = (p: Part): p is TextPart => p.type === "text"
			const textParts = lastMessage.parts.filter(isTextPart)

			if (textParts.length === 0) {
				await this.debugLog(
					`getResult: No text parts found in message: ${JSON.stringify(lastMessage)}`,
				)
				return `Delegation "${delegation.description}" completed but produced no text content.`
			}

			return textParts.map((p) => p.text).join("\n")
		} catch (error) {
			await this.debugLog(
				`getResult error: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
			return `Delegation "${delegation.description}" completed but result could not be retrieved: ${
				error instanceof Error ? error.message : "Unknown error"
			}`
		}
	}

	/**
	 * Persist delegation output to storage
	 */
	private async persistOutput(delegation: Delegation, content: string): Promise<void> {
		try {
			// Ensure we resolve the root session ID of the PARENT session for storage
			const dir = await this.ensureDelegationsDir(delegation.parentSessionID)
			const filePath = path.join(dir, `${delegation.key}.md`)

			const header = `# ${delegation.description}

**Agent:** ${delegation.agent}
**Status:** ${delegation.status}
**Started:** ${delegation.startedAt.toISOString()}
**Completed:** ${delegation.completedAt?.toISOString() || "N/A"}

---

`
			await fs.writeFile(filePath, header + content, "utf8")
			await this.debugLog(`Persisted output to ${filePath}`)
		} catch (error) {
			await this.debugLog(
				`Failed to persist output: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}

	/**
	 * Notify parent session that delegation is complete
	 */
	private async notifyParent(delegation: Delegation): Promise<void> {
		try {
			const notification = `<system-reminder>
Delegation complete.

**Description:** "${delegation.description}"
**Key:** \`${delegation.key}\`
**Status:** ${delegation.status}

Use \`delegation_read\` with key "${delegation.key}" to retrieve the full result.
</system-reminder>`

			await this.client.session.prompt({
				path: { id: delegation.parentSessionID },
				body: {
					noReply: true,
					agent: delegation.parentAgent,
					parts: [{ type: "text", text: notification }],
				},
			})

			await this.debugLog(`Notified parent session ${delegation.parentSessionID}`)
		} catch (error) {
			await this.debugLog(
				`Failed to notify parent: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}

	/**
	 * Read a delegation's output by key. Blocks if the delegation is still running.
	 */
	async readOutput(sessionID: string, key: string): Promise<string> {
		// Try to find the file
		let filePath: string | undefined
		try {
			const dir = await this.getDelegationsDir(sessionID)
			filePath = path.join(dir, `${key}.md`)
			// Check if file exists
			await fs.access(filePath)
			return await fs.readFile(filePath, "utf8")
		} catch {
			// File doesn't exist yet, continue to check memory
		}

		// Check if it's currently running in memory
		const delegationId = this.keyToId.get(key)
		if (delegationId) {
			const delegation = this.delegations.get(delegationId)
			if (delegation && delegation.status === "running") {
				await this.debugLog(`readOutput: waiting for delegation ${delegation.id} to complete`)
				await this.waitForCompletion(delegation.id)

				// Re-check after waiting
				const dir = await this.getDelegationsDir(sessionID)
				filePath = path.join(dir, `${key}.md`)
				try {
					return await fs.readFile(filePath, "utf8")
				} catch {
					// Still failed to read
				}

				// If still no file after waiting (e.g. error/timeout/cancel)
				const updated = this.delegations.get(delegationId)
				if (updated && updated.status !== "running") {
					return `Delegation "${updated.description}" ended with status: ${updated.status}. ${updated.error || ""}`
				}
			}
		}

		throw new Error(`Delegation not found: ${key}`)
	}

	/**
	 * List all delegations for a session
	 */
	async listDelegations(sessionID: string): Promise<DelegationListItem[]> {
		const results: DelegationListItem[] = []

		// Add in-memory delegations that match this session (or parent)
		// Note: This simple filtering might miss cross-session lookups if not using rootID
		// But usually we just list what we started or what is persisted
		for (const delegation of this.delegations.values()) {
			// We ideally want all delegations in the root scope
			// But for now, let's just list active ones known to this instance
			results.push({
				key: delegation.key,
				status: delegation.status,
				description: delegation.description,
			})
		}

		// Check filesystem for persisted delegations
		try {
			const dir = await this.getDelegationsDir(sessionID)
			const files = await fs.readdir(dir)

			for (const file of files) {
				if (file.endsWith(".md")) {
					const key = file.replace(".md", "")
					// Deduplicate: prioritize in-memory status
					if (!results.find((r) => r.key === key)) {
						results.push({
							key,
							status: "complete", // Assume complete if on disk and not in memory map
							description: "(loaded from storage)",
						})
					}
				}
			}
		} catch {
			// Directory may not exist yet
		}

		return results
	}

	/**
	 * Delete a delegation by key
	 */
	async deleteDelegation(sessionID: string, key: string): Promise<boolean> {
		// Cancel if running
		const delegationId = this.keyToId.get(key)
		if (delegationId) {
			const delegation = this.delegations.get(delegationId)
			if (delegation?.status === "running") {
				try {
					await this.client.session.delete({
						path: { id: delegation.sessionID },
					})
				} catch {
					// Session may already be deleted
				}
				delegation.status = "cancelled"
				delegation.completedAt = new Date()
			}
			this.delegations.delete(delegationId)
			this.keyToId.delete(key)
		}

		// Remove from filesystem
		try {
			const dir = await this.getDelegationsDir(sessionID)
			const filePath = path.join(dir, `${key}.md`)
			await fs.unlink(filePath)
			return true
		} catch {
			return false
		}
	}

	/**
	 * Find a delegation by its session ID
	 */
	findBySession(sessionID: string): Delegation | undefined {
		return Array.from(this.delegations.values()).find((d) => d.sessionID === sessionID)
	}

	/**
	 * Handle message events for progress tracking
	 */
	handleMessageEvent(sessionID: string, messageText?: string): void {
		const delegation = this.findBySession(sessionID)
		if (!delegation || delegation.status !== "running") return

		delegation.progress.lastUpdate = new Date()
		if (messageText) {
			delegation.progress.lastMessage = messageText
			delegation.progress.lastMessageAt = new Date()
		}
	}

	/**
	 * Log debug messages
	 */
	async debugLog(msg: string): Promise<void> {
		// Only log if debug is enabled (could be env var or static const)
		// For now, mirroring previous behavior but writing to the new baseDir/debug.log
		const timestamp = new Date().toISOString()
		const line = `${timestamp}: ${msg}\n`
		const debugFile = path.join(this.baseDir, "background-agents-debug.log")

		try {
			await fs.appendFile(debugFile, line, "utf8")
		} catch {
			// Ignore errors, try to ensure dir once if it fails?
			// Simpler to just ignore for debug logs
		}
	}
}

// ==========================================
// TOOL CREATORS
// ==========================================

interface DelegateArgs {
	description: string
	prompt: string
	agent: string
	key: string
}

interface DelegationReadArgs {
	key: string
}

interface DelegationDeleteArgs {
	key: string
}

function createDelegate(manager: DelegationManager): ReturnType<typeof tool> {
	return tool({
		description: `Delegate a task to an agent. Output is automatically persisted and accessible via key.

Use this for:
- Research tasks (will be auto-saved)
- Parallel work that can run in background
- Any task where you want persistent, retrievable output

Returns immediately with a key. Use \`delegation_read\` with that key to retrieve the result (will wait if still running).`,
		args: {
			description: tool.schema
				.string()
				.describe('Short description of the task (e.g., "Research authentication patterns")'),
			prompt: tool.schema
				.string()
				.describe("The full detailed prompt for the agent. Must be in English."),
			agent: tool.schema
				.string()
				.describe('The agent type to use (e.g., "coder", "explore", "general", "kdco-librarian")'),
			key: tool.schema
				.string()
				.describe(
					"Unique key for the result (e.g., 'typescript-version'). Used to retrieve the result later.",
				),
		},
		async execute(args: DelegateArgs, toolCtx: ToolContext): Promise<string> {
			if (!toolCtx?.sessionID) {
				throw new Error("delegate requires sessionID")
			}
			if (!toolCtx?.messageID) {
				throw new Error("delegate requires messageID")
			}

			const delegation = await manager.delegate({
				parentSessionID: toolCtx.sessionID,
				parentMessageID: toolCtx.messageID,
				parentAgent: toolCtx.agent,
				description: args.description,
				prompt: args.prompt,
				agent: args.agent,
				key: args.key,
			})

			return `Delegation started.
Key: ${delegation.key}
Agent: ${delegation.agent}

The task is running in the background. You will be notified when it completes.
Use \`delegation_read\` with key "${delegation.key}" to retrieve the result.`
		},
	})
}

function createDelegationRead(manager: DelegationManager): ReturnType<typeof tool> {
	return tool({
		description: `Read the output of a delegation by its key.
Use this to retrieve results from delegated tasks.`,
		args: {
			key: tool.schema.string().describe("The delegation key"),
		},
		async execute(args: DelegationReadArgs, toolCtx: ToolContext): Promise<string> {
			if (!toolCtx?.sessionID) {
				throw new Error("delegation_read requires sessionID")
			}

			return await manager.readOutput(toolCtx.sessionID, args.key)
		},
	})
}

function createDelegationList(manager: DelegationManager): ReturnType<typeof tool> {
	return tool({
		description: `List all delegations for the current session.
Shows both running and completed delegations.`,
		args: {},
		async execute(_args: Record<string, never>, toolCtx: ToolContext): Promise<string> {
			if (!toolCtx?.sessionID) {
				throw new Error("delegation_list requires sessionID")
			}

			const delegations = await manager.listDelegations(toolCtx.sessionID)

			if (delegations.length === 0) {
				return "No delegations found for this session."
			}

			const lines = delegations.map((d) => `- **${d.key}** [${d.status}]: ${d.description}`)

			return `## Delegations\n\n${lines.join("\n")}`
		},
	})
}

function createDelegationDelete(manager: DelegationManager): ReturnType<typeof tool> {
	return tool({
		description: `Delete a delegation by key. If the delegation is still running, it will be cancelled.`,
		args: {
			key: tool.schema.string().describe("The delegation key to delete"),
		},
		async execute(args: DelegationDeleteArgs, toolCtx: ToolContext): Promise<string> {
			if (!toolCtx?.sessionID) {
				throw new Error("delegation_delete requires sessionID")
			}

			const success = await manager.deleteDelegation(toolCtx.sessionID, args.key)
			return success ? `Delegation "${args.key}" deleted.` : `Delegation "${args.key}" not found.`
		},
	})
}

// ==========================================
// PLUGIN EXPORT
// ==========================================

export const BackgroundAgentsPlugin: Plugin = async (ctx) => {
	const { client, directory } = ctx

	// Project-level storage directory (shared across sessions)
	// Matches logic in kdco-workspace-plugin.ts
	const realDir = await fs.realpath(directory)
	const normalizedDir = realDir.endsWith(path.sep) ? realDir.slice(0, -1) : realDir
	const projectHash = crypto.createHash("sha256").update(normalizedDir).digest("hex").slice(0, 40)
	const baseDir = path.join(os.homedir(), ".local", "share", "opencode", "delegations", projectHash)

	// Ensure base directory exists (for debug logs etc)
	await fs.mkdir(baseDir, { recursive: true })

	const manager = new DelegationManager(client as OpencodeClient, baseDir)

	await manager.debugLog("BackgroundAgentsPlugin initialized with delegation system")

	return {
		// Disable native task tool - delegate replaces it
		tools: {
			task: false,
		},
		tool: {
			delegate: createDelegate(manager),
			delegation_read: createDelegationRead(manager),
			delegation_list: createDelegationList(manager),
			delegation_delete: createDelegationDelete(manager),
		},
		// Event hook
		event: async ({ event }: { event: Event }): Promise<void> => {
			if (event.type === "session.idle") {
				const sessionID = event.properties.sessionID
				const delegation = manager.findBySession(sessionID)
				if (delegation) {
					await manager.handleSessionIdle(sessionID)
				}
			}

			if (event.type === "message.updated") {
				const sessionID = event.properties.info.sessionID
				if (sessionID) {
					manager.handleMessageEvent(sessionID)
				}
			}
		},
	}
}

export default BackgroundAgentsPlugin
