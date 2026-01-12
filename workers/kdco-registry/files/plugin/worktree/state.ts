/**
 * SQLite State Module for Worktree Plugin
 *
 * Provides atomic, crash-safe persistence for worktree sessions and pending operations.
 * Uses bun:sqlite for zero external dependencies.
 *
 * Database location: ~/.local/share/opencode/plugins/worktree/{project-id}.sqlite
 * Project ID is the first git root commit SHA (40-char hex), with SHA-256 path hash fallback (16-char).
 */

import { Database } from "bun:sqlite"
import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { z } from "zod"

// =============================================================================
// TYPES
// =============================================================================

/** Represents an active worktree session */
export interface Session {
	id: string
	branch: string
	path: string
	createdAt: string
}

/** Pending spawn operation to be processed on session.idle */
export interface PendingSpawn {
	branch: string
	path: string
	sessionId: string
}

/** Pending delete operation to be processed on session.idle */
export interface PendingDelete {
	branch: string
	path: string
}

// =============================================================================
// SCHEMAS (Boundary Validation)
// =============================================================================

const sessionSchema = z.object({
	id: z.string().min(1),
	branch: z.string().min(1),
	path: z.string().min(1),
	createdAt: z.string().min(1),
})

const pendingSpawnSchema = z.object({
	branch: z.string().min(1),
	path: z.string().min(1),
	sessionId: z.string().min(1),
})

const pendingDeleteSchema = z.object({
	branch: z.string().min(1),
	path: z.string().min(1),
})

// =============================================================================
// DATABASE UTILITIES
// =============================================================================

/**
 * Generate a 16-char hash from a directory path.
 * Used as fallback when git root commit is unavailable.
 */
function hashPath(dir: string): string {
	const hash = crypto.createHash("sha256").update(dir).digest("hex")
	return hash.slice(0, 16)
}

/**
 * Generate a unique project ID from the project root path.
 *
 * Uses the first root commit SHA for stability across renames/moves.
 * Falls back to path hash for non-git repos or empty repos.
 * Caches result in .git/opencode for performance.
 *
 * Handles git worktrees where .git is a file containing gitdir reference.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns 40-char hex SHA (git root) or 16-char hash (fallback)
 */
export async function getProjectId(projectRoot: string): Promise<string> {
	// Guard clause (Law 1: Early Exit)
	if (!projectRoot || typeof projectRoot !== "string") {
		throw new Error("getProjectId: projectRoot is required and must be a string")
	}

	// Resolve .git path - handle both regular repos and worktrees
	const gitPath = path.join(projectRoot, ".git")
	const stat = await fs.promises.stat(gitPath).catch(() => null)

	if (!stat) {
		// .git doesn't exist - not a git repo, use path hash fallback
		console.warn(`getProjectId: No .git found at ${projectRoot}, using path hash`)
		return hashPath(projectRoot)
	}

	let gitDir = gitPath
	if (stat.isFile()) {
		// Worktree case: .git is a file containing gitdir reference
		const content = await Bun.file(gitPath).text()
		const match = content.match(/^gitdir:\s*(.+)$/m)

		if (!match) {
			throw new Error(`getProjectId: .git file exists but has invalid format at ${gitPath}`)
		}

		// Resolve path (handles both relative and absolute)
		const gitdirPath = match[1].trim()
		const resolvedGitdir = path.resolve(projectRoot, gitdirPath)

		// Navigate from .git/worktrees/branch to .git
		gitDir = path.resolve(resolvedGitdir, "../..")

		// Validate resolved path exists
		const gitDirStat = await fs.promises.stat(gitDir).catch(() => null)
		if (!gitDirStat?.isDirectory()) {
			throw new Error(`getProjectId: Resolved gitdir ${gitDir} is not a directory`)
		}
	}

	// Try to read cached ID from .git/opencode
	const cacheFile = path.join(gitDir, "opencode")
	const cached = await Bun.file(cacheFile)
		.text()
		.catch(() => null)

	if (cached) {
		const trimmed = cached.trim()
		// Validate cache content (40-char hex for git hash, or 16-char for path hash)
		if (/^[a-f0-9]{40}$/i.test(trimmed) || /^[a-f0-9]{16}$/i.test(trimmed)) {
			return trimmed
		}
		// Invalid cache - log warning, regenerate
		console.warn(`getProjectId: Invalid cache content at ${cacheFile}, regenerating`)
	}

	// Try to get first root commit SHA
	const proc = Bun.spawn(["git", "rev-list", "--max-parents=0", "--all"], {
		cwd: projectRoot,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			GIT_DIR: undefined, // Clear to avoid ghost mode interference
			GIT_WORK_TREE: undefined,
		},
	})

	// 5-second timeout to prevent hanging on slow/unresponsive git
	const timeout = new Promise<string>((_, reject) =>
		setTimeout(() => reject(new Error("git command timeout")), 5000),
	)

	let output: string
	try {
		output = await Promise.race([new Response(proc.stdout).text(), timeout])
	} catch {
		// Timeout or read error - fallback to path hash
		console.warn("getProjectId: git rev-list timed out, using path hash")
		return hashPath(projectRoot)
	}

	const exitCode = await proc.exited
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text()
		console.warn(`getProjectId: git rev-list failed (${exitCode}): ${stderr.trim()}`)
		return hashPath(projectRoot) // Fallback to path hash
	}

	const roots = output
		.split("\n")
		.filter(Boolean)
		.map((s) => s.trim())
		.toSorted()

	if (roots.length > 0 && /^[a-f0-9]{40}$/i.test(roots[0])) {
		const projectId = roots[0]

		// Cache the result (warn on failure, don't throw)
		try {
			await Bun.write(cacheFile, projectId)
		} catch (e) {
			console.warn("Failed to cache project ID:", e)
		}

		return projectId
	}

	// No valid roots found - fallback to path hash
	console.warn("getProjectId: No valid git root commits found, using path hash")
	return hashPath(projectRoot)
}

/**
 * Get the worktree path for a given project and branch.
 *
 * @param projectRoot - Absolute path to the project root
 * @param branch - Branch name for the worktree
 * @returns Absolute path to the worktree directory
 */
export async function getWorktreePath(projectRoot: string, branch: string): Promise<string> {
	if (!branch || typeof branch !== "string") {
		throw new Error("branch is required")
	}
	const projectId = await getProjectId(projectRoot)
	return path.join(os.homedir(), ".local", "share", "opencode", "worktree", projectId, branch)
}

/**
 * Get the database directory path.
 * Location: ~/.local/share/opencode/plugins/worktree/
 */
function getDbDirectory(): string {
	const home = os.homedir()
	return path.join(home, ".local", "share", "opencode", "plugins", "worktree")
}

/**
 * Get the full database file path for a project.
 * @param projectRoot - Absolute path to the project root
 */
async function getDbPath(projectRoot: string): Promise<string> {
	const projectId = await getProjectId(projectRoot)
	return path.join(getDbDirectory(), `${projectId}.sqlite`)
}

/**
 * Initialize the SQLite database for worktree state.
 * Creates the database file and schema if they don't exist.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Configured Database instance
 *
 * @example
 * ```ts
 * const db = await initStateDb("/home/user/my-project")
 * const sessions = getAllSessions(db)
 * db.close()
 * ```
 */
export async function initStateDb(projectRoot: string): Promise<Database> {
	// Guard: validate project root
	if (!projectRoot || typeof projectRoot !== "string") {
		throw new Error("initStateDb requires a valid project root path")
	}

	const dbPath = await getDbPath(projectRoot)
	const dbDir = path.dirname(dbPath)

	// Create directory synchronously (required before opening DB)
	fs.mkdirSync(dbDir, { recursive: true })

	// Open database (creates if doesn't exist)
	const db = new Database(dbPath)

	// Configure SQLite for concurrent access
	db.exec("PRAGMA journal_mode=WAL")
	db.exec("PRAGMA busy_timeout=5000")

	// Create tables with schema
	db.exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			branch TEXT NOT NULL,
			path TEXT NOT NULL,
			created_at TEXT NOT NULL
		)
	`)

	db.exec(`
		CREATE TABLE IF NOT EXISTS pending_operations (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			type TEXT NOT NULL,
			branch TEXT NOT NULL,
			path TEXT NOT NULL,
			session_id TEXT
		)
	`)

	return db
}

// =============================================================================
// SESSION CRUD
// =============================================================================

/**
 * Add a new session to the database.
 * Uses atomic INSERT OR REPLACE for idempotency.
 *
 * @param db - Database instance from initStateDb
 * @param session - Session data to persist
 */
export function addSession(db: Database, session: Session): void {
	// Parse at boundary for type safety
	const parsed = sessionSchema.parse(session)

	const stmt = db.prepare(`
		INSERT OR REPLACE INTO sessions (id, branch, path, created_at)
		VALUES ($id, $branch, $path, $createdAt)
	`)

	stmt.run({
		$id: parsed.id,
		$branch: parsed.branch,
		$path: parsed.path,
		$createdAt: parsed.createdAt,
	})
}

/**
 * Get a session by ID.
 *
 * @param db - Database instance from initStateDb
 * @param sessionId - Session ID to look up
 * @returns Session if found, null otherwise
 */
export function getSession(db: Database, sessionId: string): Session | null {
	// Guard: empty session ID
	if (!sessionId) return null

	const stmt = db.prepare(`
		SELECT id, branch, path, created_at as createdAt
		FROM sessions
		WHERE id = $id
	`)

	const row = stmt.get({ $id: sessionId }) as Record<string, string> | null
	if (!row) return null

	return {
		id: row.id,
		branch: row.branch,
		path: row.path,
		createdAt: row.createdAt,
	}
}

/**
 * Remove a session by branch name.
 * Deletes all sessions matching the branch.
 *
 * @param db - Database instance from initStateDb
 * @param branch - Branch name to remove
 */
export function removeSession(db: Database, branch: string): void {
	// Guard: empty branch
	if (!branch) return

	const stmt = db.prepare(`DELETE FROM sessions WHERE branch = $branch`)
	stmt.run({ $branch: branch })
}

/**
 * Get all active sessions.
 *
 * @param db - Database instance from initStateDb
 * @returns Array of all sessions, empty if none
 */
export function getAllSessions(db: Database): Session[] {
	const stmt = db.prepare(`
		SELECT id, branch, path, created_at as createdAt
		FROM sessions
		ORDER BY created_at ASC
	`)

	const rows = stmt.all() as Array<Record<string, string>>
	return rows.map((row) => ({
		id: row.id,
		branch: row.branch,
		path: row.path,
		createdAt: row.createdAt,
	}))
}

// =============================================================================
// PENDING SPAWN OPERATIONS
// =============================================================================

/**
 * Set a pending spawn operation. Uses singleton pattern (last-write-wins).
 *
 * If a pending spawn already exists, it will be REPLACED and a warning logged.
 * This is intentional: only the most recent spawn request should be processed.
 *
 * @param db - Database instance from initStateDb
 * @param spawn - Spawn operation data
 */
export function setPendingSpawn(db: Database, spawn: PendingSpawn): void {
	// Parse at boundary for type safety
	const parsed = pendingSpawnSchema.parse(spawn)

	// Check for existing operations and warn about replacement
	const existingSpawn = getPendingSpawn(db)
	const existingDelete = getPendingDelete(db)

	if (existingSpawn) {
		console.warn(`Replacing pending spawn: "${existingSpawn.branch}" → "${parsed.branch}"`)
	} else if (existingDelete) {
		console.warn(`Pending spawn replacing pending delete for: "${existingDelete.branch}"`)
	}

	// Atomic: replace any existing pending operation
	const stmt = db.prepare(`
		INSERT OR REPLACE INTO pending_operations (id, type, branch, path, session_id)
		VALUES (1, 'spawn', $branch, $path, $sessionId)
	`)

	stmt.run({
		$branch: parsed.branch,
		$path: parsed.path,
		$sessionId: parsed.sessionId,
	})
}

/**
 * Get the pending spawn operation if one exists.
 *
 * @param db - Database instance from initStateDb
 * @returns PendingSpawn if exists and type is 'spawn', null otherwise
 */
export function getPendingSpawn(db: Database): PendingSpawn | null {
	const stmt = db.prepare(`
		SELECT type, branch, path, session_id as sessionId
		FROM pending_operations
		WHERE id = 1 AND type = 'spawn'
	`)

	const row = stmt.get() as Record<string, string> | null
	if (!row) return null

	return {
		branch: row.branch,
		path: row.path,
		sessionId: row.sessionId,
	}
}

/**
 * Clear any pending spawn operation.
 * Removes the row if it's a spawn type, leaves deletes untouched.
 *
 * @param db - Database instance from initStateDb
 */
export function clearPendingSpawn(db: Database): void {
	const stmt = db.prepare(`DELETE FROM pending_operations WHERE id = 1 AND type = 'spawn'`)
	stmt.run()
}

// =============================================================================
// PENDING DELETE OPERATIONS
// =============================================================================

/**
 * Set a pending delete operation. Uses singleton pattern (last-write-wins).
 *
 * If a pending delete already exists, it will be REPLACED and a warning logged.
 * This is intentional: only the most recent delete request should be processed.
 *
 * @param db - Database instance from initStateDb
 * @param del - Delete operation data
 */
export function setPendingDelete(db: Database, del: PendingDelete): void {
	// Parse at boundary for type safety
	const parsed = pendingDeleteSchema.parse(del)

	// Check for existing operations and warn about replacement
	const existingDelete = getPendingDelete(db)
	const existingSpawn = getPendingSpawn(db)

	if (existingDelete) {
		console.warn(`Replacing pending delete: "${existingDelete.branch}" → "${parsed.branch}"`)
	} else if (existingSpawn) {
		console.warn(`Pending delete replacing pending spawn for: "${existingSpawn.branch}"`)
	}

	// Atomic: replace any existing pending operation
	const stmt = db.prepare(`
		INSERT OR REPLACE INTO pending_operations (id, type, branch, path, session_id)
		VALUES (1, 'delete', $branch, $path, NULL)
	`)

	stmt.run({
		$branch: parsed.branch,
		$path: parsed.path,
	})
}

/**
 * Get the pending delete operation if one exists.
 *
 * @param db - Database instance from initStateDb
 * @returns PendingDelete if exists and type is 'delete', null otherwise
 */
export function getPendingDelete(db: Database): PendingDelete | null {
	const stmt = db.prepare(`
		SELECT type, branch, path
		FROM pending_operations
		WHERE id = 1 AND type = 'delete'
	`)

	const row = stmt.get() as Record<string, string> | null
	if (!row) return null

	return {
		branch: row.branch,
		path: row.path,
	}
}

/**
 * Clear any pending delete operation.
 * Removes the row if it's a delete type, leaves spawns untouched.
 *
 * @param db - Database instance from initStateDb
 */
export function clearPendingDelete(db: Database): void {
	const stmt = db.prepare(`DELETE FROM pending_operations WHERE id = 1 AND type = 'delete'`)
	stmt.run()
}
