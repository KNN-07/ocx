/**
 * OCX Worktree Plugin
 *
 * Creates isolated git worktrees for AI development sessions with
 * seamless terminal spawning across macOS, Windows, and Linux.
 *
 * Inspired by opencode-worktree-session by Felix Anhalt
 * https://github.com/felixAnhalt/opencode-worktree-session
 * License: MIT
 *
 * Rewritten for OCX with production-proven patterns.
 */

import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { type Plugin, tool } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"

import { z } from "zod"

// =============================================================================
// TYPES & SCHEMAS
// =============================================================================

/** Result type for fallible operations */
interface OkResult<T> {
  readonly ok: true
  readonly value: T
}
interface ErrResult<E> {
  readonly ok: false
  readonly error: E
}
type Result<T, E> = OkResult<T> | ErrResult<E>

const Result = {
  ok: <T>(value: T): OkResult<T> => ({ ok: true, value }),
  err: <E>(error: E): ErrResult<E> => ({ ok: false, error }),
}

/**
 * Git branch name validation - blocks invalid refs and shell metacharacters
 * Characters blocked: control chars (0x00-0x1f, 0x7f), ~^:?*[]\, and shell metacharacters
 */
function isValidBranchName(name: string): boolean {
  // Check for control characters
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return false
  }
  // Check for invalid git ref characters and shell metacharacters
  if (/[~^:?*[\]\\;&|`$()]/.test(name)) return false
  return true
}

/** Escape a string for safe use in bash double-quoted strings */
function escapeBash(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/!/g, "\\!")
    .replace(/\n/g, " ") // Replace newlines with space
}

/** Escape a string for safe use in Windows batch files */
function escapeBatch(s: string): string {
  return s
    .replace(/%/g, "%%")
    .replace(/\^/g, "^^")
    .replace(/&/g, "^&")
    .replace(/</g, "^<")
    .replace(/>/g, "^>")
    .replace(/\|/g, "^|")
}

const branchNameSchema = z
  .string()
  .min(1, "Branch name cannot be empty")
  .max(255, "Branch name too long")
  .refine((name) => isValidBranchName(name), "Contains invalid git ref characters")
  .refine((name) => !name.includes(".."), "Cannot contain consecutive dots")
  .refine((name) => !name.startsWith(".") && !name.endsWith("."), "Cannot start or end with dot")
  .refine((name) => !name.endsWith(".lock"), "Cannot end with .lock")

const sessionSchema = z.object({
  id: z.string(),
  branch: z.string(),
  path: z.string(),
  createdAt: z.string(),
})

const stateSchema = z.object({
  sessions: z.array(sessionSchema).default([]),
  pendingSpawn: z
    .object({
      branch: z.string(),
      path: z.string(),
      sessionId: z.string(),
    })
    .nullable()
    .default(null),
  pendingDelete: z
    .object({
      branch: z.string(),
      path: z.string(),
    })
    .nullable()
    .default(null),
})

const configSchema = z
  .object({
    postWorktree: z
      .object({
        cmd: z.string(),
        args: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .passthrough()

type State = z.infer<typeof stateSchema>
type Config = z.infer<typeof configSchema>

// =============================================================================
// GIT MODULE
// =============================================================================

/**
 * Execute a git command safely using Bun.spawn with explicit array.
 * Avoids shell interpolation entirely by passing args as array.
 */
async function git(args: string[], cwd: string): Promise<Result<string, string>> {
  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (exitCode !== 0) {
      return Result.err(stderr.trim() || `git ${args[0]} failed`)
    }
    return Result.ok(stdout.trim())
  } catch (error) {
    return Result.err(error instanceof Error ? error.message : String(error))
  }
}

async function branchExists(cwd: string, branch: string): Promise<boolean> {
  const result = await git(["rev-parse", "--verify", branch], cwd)
  return result.ok
}

async function createWorktree(
  repoRoot: string,
  branch: string,
  baseBranch?: string,
): Promise<Result<string, string>> {
  const worktreePath = path.join(repoRoot, ".opencode", "worktrees", branch)

  // Ensure parent directory exists
  await fs.mkdir(path.dirname(worktreePath), { recursive: true })

  const exists = await branchExists(repoRoot, branch)

  if (exists) {
    // Checkout existing branch into worktree
    const result = await git(["worktree", "add", worktreePath, branch], repoRoot)
    return result.ok ? Result.ok(worktreePath) : result
  } else {
    // Create new branch from base
    const base = baseBranch ?? "HEAD"
    const result = await git(["worktree", "add", "-b", branch, worktreePath, base], repoRoot)
    return result.ok ? Result.ok(worktreePath) : result
  }
}

async function removeWorktree(
  repoRoot: string,
  worktreePath: string,
): Promise<Result<void, string>> {
  const result = await git(["worktree", "remove", "--force", worktreePath], repoRoot)
  return result.ok ? Result.ok(undefined) : Result.err(result.error)
}

// =============================================================================
// TERMINAL MODULE (Temp Script Approach)
// =============================================================================

/**
 * Terminal Spawning via Temp Script Files
 *
 * This approach is production-validated by DeepChat, Cline, Gemini CLI, and pnpm.
 * Instead of complex multi-layer escaping, we write the command to a temp script
 * and execute the script. This completely avoids shell injection issues.
 *
 * Cleanup: We rely on OS temp directory cleanup (standard practice).
 * The scripts are tiny (~100 bytes) and the OS cleans /tmp periodically.
 */

type Platform = "darwin" | "win32" | "linux"

/**
 * Open a new terminal window and execute a command using temp script files.
 * Cross-platform support for macOS, Windows, and Linux.
 */
async function openTerminal(cwd: string, command: string): Promise<Result<void, string>> {
  const platform = process.platform as Platform

  try {
    switch (platform) {
      case "darwin":
        return await openTerminalMacOS(cwd, command)
      case "win32":
        return await openTerminalWindows(cwd, command)
      case "linux":
        return await openTerminalLinux(cwd, command)
      default:
        return Result.err(`Unsupported platform: ${platform}`)
    }
  } catch (error) {
    return Result.err(error instanceof Error ? error.message : String(error))
  }
}

async function createTempScript(content: string, extension: string): Promise<string> {
  const scriptPath = path.join(os.tmpdir(), `ocx-terminal-${Bun.randomUUIDv7()}${extension}`)
  await fs.writeFile(scriptPath, content, { mode: 0o755 })
  return scriptPath
}

async function openTerminalMacOS(cwd: string, command: string): Promise<Result<void, string>> {
  // Write command to temp script file
  const scriptContent = `#!/bin/bash
cd "${escapeBash(cwd)}"
${escapeBash(command)}
exec bash
`
  const scriptPath = await createTempScript(scriptContent, ".sh")

  // Use 'open' command to launch Terminal with the script
  // This is cleaner than AppleScript and avoids escaping issues
  const proc = Bun.spawn(["open", "-a", "Terminal", scriptPath], {
    stdio: ["ignore", "ignore", "pipe"],
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    return Result.err(`Failed to open Terminal: ${stderr}`)
  }

  return Result.ok(undefined)
}

async function openTerminalWindows(cwd: string, command: string): Promise<Result<void, string>> {
  // Write command to temp batch file
  const scriptContent = `@echo off
cd /d "${escapeBatch(cwd)}"
${escapeBatch(command)}
cmd /k
`
  const scriptPath = await createTempScript(scriptContent, ".bat")

  // Start new CMD window with the batch file
  Bun.spawn(["cmd", "/c", "start", "", scriptPath], {
    stdio: ["ignore", "ignore", "ignore"],
  })

  return Result.ok(undefined)
}

async function openTerminalLinux(cwd: string, command: string): Promise<Result<void, string>> {
  // Write command to temp script file
  const scriptContent = `#!/bin/bash
cd "${escapeBash(cwd)}"
${escapeBash(command)}
exec bash
`
  const scriptPath = await createTempScript(scriptContent, ".sh")

  // Detect and use available terminal
  const terminal = await detectLinuxTerminal()

  try {
    if (terminal === "x-terminal-emulator") {
      Bun.spawn(["x-terminal-emulator", "-e", "bash", scriptPath], {
        stdio: ["ignore", "ignore", "ignore"],
      })
    } else if (terminal === "gnome-terminal") {
      Bun.spawn(["gnome-terminal", "--", "bash", scriptPath], {
        stdio: ["ignore", "ignore", "ignore"],
      })
    } else if (terminal === "konsole") {
      Bun.spawn(["konsole", "-e", "bash", scriptPath], {
        stdio: ["ignore", "ignore", "ignore"],
      })
    } else if (terminal === "xfce4-terminal") {
      // xfce4-terminal's -e flag takes a single command string, unlike other terminals
      Bun.spawn(["xfce4-terminal", "-e", `bash "${scriptPath}"`], {
        stdio: ["ignore", "ignore", "ignore"],
      })
    } else {
      // Fallback to xterm
      Bun.spawn(["xterm", "-e", "bash", scriptPath], {
        stdio: ["ignore", "ignore", "ignore"],
      })
    }
    return Result.ok(undefined)
  } catch (error) {
    return Result.err(error instanceof Error ? error.message : String(error))
  }
}

async function detectLinuxTerminal(): Promise<string> {
  // Check for Debian alternatives system first (Ubuntu, Mint, etc.)
  try {
    const debianCheck = Bun.file("/etc/debian_version")
    if (await debianCheck.exists()) {
      return "x-terminal-emulator"
    }
  } catch {
    /* ignore */
  }

  // Detect desktop environment
  const session = (process.env.DESKTOP_SESSION ?? "").toUpperCase()
  const desktop = (process.env.XDG_CURRENT_DESKTOP ?? "").toUpperCase()

  if (session.includes("GNOME") || desktop.includes("GNOME")) return "gnome-terminal"
  if (session.includes("KDE") || desktop.includes("KDE")) return "konsole"
  if (session.includes("XFCE") || desktop.includes("XFCE")) return "xfce4-terminal"

  // Fallback
  return process.env.COLORTERM || process.env.TERM || "xterm"
}

// =============================================================================
// STATE MODULE
// =============================================================================

function getStatePath(directory: string): string {
  return path.join(directory, ".opencode", "worktree-state.json")
}

async function loadState(directory: string): Promise<State> {
  const statePath = getStatePath(directory)
  const file = Bun.file(statePath)

  if (!(await file.exists())) {
    return { sessions: [], pendingSpawn: null, pendingDelete: null }
  }

  try {
    const raw = await file.json()
    const result = stateSchema.safeParse(raw)
    if (!result.success) {
      console.warn(`[worktree] Invalid state file, using defaults`)
      return { sessions: [], pendingSpawn: null, pendingDelete: null }
    }
    return result.data
  } catch {
    return { sessions: [], pendingSpawn: null, pendingDelete: null }
  }
}

async function saveState(directory: string, state: State): Promise<void> {
  const statePath = getStatePath(directory)
  await fs.mkdir(path.dirname(statePath), { recursive: true })
  await Bun.write(statePath, JSON.stringify(state, null, 2))
}

// =============================================================================
// POST-HOOK MODULE
// =============================================================================

/**
 * Execute the post-worktree hook if configured.
 *
 * SECURITY NOTE: We trust user-provided config for post-worktree commands.
 * This is intentional and follows industry norms (git hooks, npm scripts,
 * Makefile targets all trust user-configured commands).
 *
 * The config file (.opencode/opencode-worktree-config.json) is under user
 * control - any "injection" is the user configuring their own environment.
 * This is equivalent to a user adding a malicious git hook to their own repo.
 */
async function runPostHook(config: Config, worktreePath: string): Promise<void> {
  const hook = config.postWorktree
  if (!hook?.cmd) return

  const args = hook.args ?? [worktreePath]

  try {
    Bun.spawn([hook.cmd, ...args], {
      cwd: worktreePath,
      stdio: ["ignore", "ignore", "ignore"],
    })
  } catch (error) {
    console.warn(`[worktree] Post-hook failed: ${error}`)
  }
}

async function loadConfig(directory: string): Promise<Config> {
  const configPath = path.join(directory, ".opencode", "opencode-worktree-config.json")
  const file = Bun.file(configPath)

  if (!(await file.exists())) {
    return {}
  }

  try {
    const raw = await file.json()
    const result = configSchema.safeParse(raw)
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
      console.warn(`[worktree] Config validation issues: ${issues}`)
      return {}
    }
    return result.data
  } catch {
    return {}
  }
}

// =============================================================================
// PLUGIN ENTRY
// =============================================================================

export const WorktreePlugin: Plugin = async (ctx) => {
  const { directory } = ctx

  return {
    tool: {
      worktree_create: tool({
        description:
          "Create a new git worktree for isolated development. A new terminal will open with OpenCode in the worktree.",
        args: {
          branch: tool.schema
            .string()
            .describe("Branch name for the worktree (e.g., 'feature/dark-mode')"),
          baseBranch: tool.schema
            .string()
            .optional()
            .describe("Base branch to create from (defaults to HEAD)"),
        },
        async execute(args, toolCtx) {
          // Validate branch name at boundary
          const branchResult = branchNameSchema.safeParse(args.branch)
          if (!branchResult.success) {
            return `❌ Invalid branch name: ${branchResult.error.issues[0]?.message}`
          }

          // Validate base branch name at boundary
          if (args.baseBranch) {
            const baseResult = branchNameSchema.safeParse(args.baseBranch)
            if (!baseResult.success) {
              return `❌ Invalid base branch name: ${baseResult.error.issues[0]?.message}`
            }
          }

          // Create worktree
          const result = await createWorktree(directory, args.branch, args.baseBranch)
          if (!result.ok) {
            return `Failed to create worktree: ${result.error}`
          }

          // Load config for post-hook
          const config = await loadConfig(directory)

          // Run post-hook if configured
          await runPostHook(config, result.value)

          // Mark pending spawn for session.idle
          const state = await loadState(directory)
          state.pendingSpawn = {
            branch: args.branch,
            path: result.value,
            sessionId: toolCtx?.sessionID ?? "unknown",
          }
          state.sessions.push({
            id: toolCtx?.sessionID ?? "unknown",
            branch: args.branch,
            path: result.value,
            createdAt: new Date().toISOString(),
          })
          await saveState(directory, state)

          return `Worktree created at ${result.value}\n\nA new terminal will open with OpenCode when this response completes.`
        },
      }),

      worktree_delete: tool({
        description:
          "Delete the current worktree and clean up. Changes will be committed before removal.",
        args: {},
        async execute(_args, toolCtx) {
          const state = await loadState(directory)

          // Find current session's worktree
          const session = state.sessions.find((s) => s.id === toolCtx?.sessionID)
          if (!session) {
            return `No worktree associated with this session`
          }

          // Mark pending delete for session.idle
          state.pendingDelete = { branch: session.branch, path: session.path }
          await saveState(directory, state)

          return `Worktree marked for cleanup. It will be removed when this session ends.`
        },
      }),
    },

    event: async ({ event }: { event: Event }): Promise<void> => {
      if (event.type !== "session.idle") return

      const state = await loadState(directory)

      // Handle pending spawn
      if (state.pendingSpawn) {
        const { path: worktreePath, sessionId } = state.pendingSpawn
        const terminalResult = await openTerminal(worktreePath, `opencode --session ${sessionId}`)

        if (!terminalResult.ok) {
          console.warn(`[worktree] Failed to open terminal: ${terminalResult.error}`)
        }

        state.pendingSpawn = null
        await saveState(directory, state)
      }

      // Handle pending delete
      if (state.pendingDelete) {
        const { path: worktreePath, branch } = state.pendingDelete

        // Commit any uncommitted changes
        await git(["add", "-A"], worktreePath)
        await git(
          ["commit", "-m", "chore(worktree): session snapshot", "--allow-empty"],
          worktreePath,
        )

        // Remove worktree
        const removeResult = await removeWorktree(directory, worktreePath)
        if (!removeResult.ok) {
          console.warn(`[worktree] Failed to remove worktree: ${removeResult.error}`)
        }

        // Update state
        state.pendingDelete = null
        state.sessions = state.sessions.filter((s) => s.branch !== branch)
        await saveState(directory, state)
      }
    },
  }
}

export default WorktreePlugin
