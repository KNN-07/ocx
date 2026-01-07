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

/**
 * Escape string for use inside bash double-quoted strings.
 * NOTE: Only for quoted contexts. Does not escape shell metacharacters (;|&)
 * which are safe inside double quotes.
 */
function escapeBash(s: string): string {
	return s
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\$/g, "\\$")
		.replace(/`/g, "\\`")
		.replace(/!/g, "\\!")
		.replace(/\n/g, " ") // Replace newlines with space
}

/** Escape string for use in AppleScript double-quoted strings */
function escapeAppleScript(str: string): string {
	return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")
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

/** Validates tmux environment detection */
const tmuxEnvSchema = z.object({
	TMUX: z.string().optional(),
})

/** Validates WSL environment detection */
const wslEnvSchema = z.object({
	WSL_DISTRO_NAME: z.string().optional(),
	WSLENV: z.string().optional(),
})

/** Validates Linux terminal environment detection */
const linuxTerminalEnvSchema = z.object({
	KITTY_WINDOW_ID: z.string().optional(),
	WEZTERM_PANE: z.string().optional(),
	ALACRITTY_WINDOW_ID: z.string().optional(),
	GHOSTTY_RESOURCES_DIR: z.string().optional(),
	TERM_PROGRAM: z.string().optional(),
	GNOME_TERMINAL_SERVICE: z.string().optional(),
	KONSOLE_VERSION: z.string().optional(),
})

type LinuxTerminal =
	| "kitty"
	| "wezterm"
	| "alacritty"
	| "ghostty"
	| "foot"
	| "gnome-terminal"
	| "konsole"
	| "xfce4-terminal"
	| "xdg-terminal-exec"
	| "x-terminal-emulator"
	| "xterm"

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

/**
 * Detect if running inside a tmux session.
 * Uses the tmuxEnvSchema for boundary validation.
 */
function isInsideTmux(): boolean {
	const parsed = tmuxEnvSchema.safeParse(process.env)
	if (!parsed.success) return false
	return !!parsed.data.TMUX
}

/**
 * Detect if running inside WSL (Windows Subsystem for Linux).
 * Checks environment variables and os.release() for Microsoft string.
 */
function isInsideWSL(): boolean {
	const parsed = wslEnvSchema.safeParse(process.env)
	if (parsed.success && (parsed.data.WSL_DISTRO_NAME || parsed.data.WSLENV)) {
		return true
	}

	// Fallback: check os.release() for Microsoft string
	try {
		return os.release().toLowerCase().includes("microsoft")
	} catch {
		return false
	}
}

/**
 * Open a new tmux window for the worktree session.
 * Uses the production-proven pattern from workmux:
 * - Creates a new window with proper cwd and name
 * - Uses temp script pattern for command execution
 * - Sends script path with -l flag to prevent escape sequence injection
 */
async function openTerminalTmux(
	cwd: string,
	command: string,
	name: string,
): Promise<Result<void, Error>> {
	const scriptPath = path.join(os.tmpdir(), `worktree-${Bun.randomUUIDv7()}.sh`)
	const escapedCwd = escapeBash(cwd)
	const escapedCommand = escapeBash(command)
	const scriptContent = `#!/bin/bash\ncd "${escapedCwd}" && ${escapedCommand}`

	try {
		await Bun.write(scriptPath, scriptContent)
		await fs.chmod(scriptPath, 0o755)

		// Create tmux window and get pane ID
		const createResult = Bun.spawnSync([
			"tmux",
			"new-window",
			"-n",
			name,
			"-c",
			cwd,
			"-P",
			"-F",
			"#{pane_id}",
		])

		if (createResult.exitCode !== 0) {
			return Result.err(
				new Error(`Failed to create tmux window: ${createResult.stderr.toString()}`),
			)
		}

		const paneId = createResult.stdout.toString().trim()

		// Send script path using literal flag (-l) for security
		Bun.spawnSync(["tmux", "send-keys", "-t", paneId, "-l", scriptPath])
		Bun.spawnSync(["tmux", "send-keys", "-t", paneId, "Enter"])

		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open a terminal in WSL via Windows Terminal (wt.exe) interop.
 * Uses temp script pattern for command execution.
 * Falls back to bash in current terminal if wt.exe not available.
 */
async function openTerminalWSL(cwd: string, command: string): Promise<Result<void, Error>> {
	const scriptPath = path.join(os.tmpdir(), `worktree-${Bun.randomUUIDv7()}.sh`)
	const escapedCwd = escapeBash(cwd)
	const escapedCommand = escapeBash(command)
	const scriptContent = `#!/bin/bash\ncd "${escapedCwd}" && ${escapedCommand}\nexec bash`

	try {
		await Bun.write(scriptPath, scriptContent)
		await fs.chmod(scriptPath, 0o755)

		// Try wt.exe first (Windows Terminal via PATH interop)
		const wtResult = Bun.spawnSync(["which", "wt.exe"])
		if (wtResult.exitCode === 0) {
			// wt.exe is available - use new tab in Windows Terminal
			const proc = Bun.spawn(["wt.exe", "-d", cwd, "bash", scriptPath], {
				detached: true,
				stdio: ["ignore", "ignore", "ignore"],
			})
			proc.unref()
			return Result.ok(undefined)
		}

		// Fallback: open in current terminal (new bash process)
		const proc = Bun.spawn(["bash", scriptPath], {
			cwd,
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		})
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

type Platform = "darwin" | "win32" | "linux"

/**
 * Open a new terminal window and execute a command using temp script files.
 * Cross-platform support for macOS, Windows, and Linux.
 * tmux detection takes priority when running inside a tmux session.
 */
async function openTerminal(
	cwd: string,
	command: string,
	name: string = "worktree",
): Promise<Result<void, string>> {
	// tmux takes priority - user may be inside tmux on any platform
	if (isInsideTmux()) {
		const result = await openTerminalTmux(cwd, command, name)
		return result.ok ? Result.ok(undefined) : Result.err(result.error.message)
	}

	// WSL check (Linux inside Windows) - before platform detection
	if (process.platform === "linux" && isInsideWSL()) {
		const result = await openTerminalWSL(cwd, command)
		return result.ok ? Result.ok(undefined) : Result.err(result.error.message)
	}

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

/**
 * Open Ghostty: AppleScript new tab with CLI fallback.
 * Production pattern - AppleScript keystroke simulation for tabs (no CLI tab support).
 */
async function openGhosttyTab(scriptPath: string): Promise<Result<void, Error>> {
	try {
		// Check if Ghostty is running
		const pgrepResult = Bun.spawnSync(["pgrep", "-x", "Ghostty"])
		const isRunning = pgrepResult.exitCode === 0

		if (isRunning) {
			// Try to open new tab via AppleScript keystroke
			const appleScript = `
				tell application "Ghostty" to activate
				delay 0.1
				tell application "System Events"
					tell process "Ghostty"
						keystroke "t" using command down
					end tell
				end tell
				delay 0.2
				tell application "System Events"
					tell process "Ghostty"
						keystroke "${escapeAppleScript(scriptPath)}"
						key code 36
					end tell
				end tell
			`
			const result = Bun.spawnSync(["osascript", "-e", appleScript])
			if (result.exitCode === 0) {
				return Result.ok(undefined)
			}
			// Fall through to new window if AppleScript fails
		}

		// Fallback: open new window
		const proc = Bun.spawn(["ghostty", "-e", "bash", scriptPath], {
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		})
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open iTerm2: AppleScript new tab pattern.
 * Creates tab in existing window or new window if none exists.
 */
async function openItermTab(scriptPath: string): Promise<Result<void, Error>> {
	const escapedPath = escapeAppleScript(scriptPath)
	const appleScript = `
		tell application "iTerm"
			if not (exists window 1) then
				reopen
			else
				tell current window
					create tab with default profile
				end tell
			end if
			activate
			tell first session of current tab of current window
				write text "${escapedPath}"
			end tell
		end tell
	`

	try {
		const result = Bun.spawnSync(["osascript", "-e", appleScript])
		if (result.exitCode !== 0) {
			return Result.err(new Error(`iTerm AppleScript failed: ${result.stderr.toString()}`))
		}
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open Kitty: Use `kitty @` remote control with fallback.
 * Requires allow_remote_control in kitty config for tabs.
 */
async function openKittyTab(cwd: string, scriptPath: string): Promise<Result<void, Error>> {
	try {
		// Try kitty @ remote control first (requires allow_remote_control)
		const remoteResult = Bun.spawnSync([
			"kitty",
			"@",
			"launch",
			"--type",
			"tab",
			"--cwd",
			cwd,
			"--",
			"bash",
			scriptPath,
		])

		if (remoteResult.exitCode === 0) {
			return Result.ok(undefined)
		}

		// Fallback: open new OS window (remote control not enabled)
		const proc = Bun.spawn(["kitty", "--directory", cwd, "-e", "bash", scriptPath], {
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		})
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open Alacritty: No tab support, opens new OS window.
 */
async function openAlacrittyWindow(cwd: string, scriptPath: string): Promise<Result<void, Error>> {
	try {
		const proc = Bun.spawn(["alacritty", "--working-directory", cwd, "-e", "bash", scriptPath], {
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		})
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open WezTerm: Uses `wezterm cli spawn` for new tab/window.
 */
async function openWezterm(cwd: string, scriptPath: string): Promise<Result<void, Error>> {
	try {
		const proc = Bun.spawn(["wezterm", "cli", "spawn", "--cwd", cwd, "--", "bash", scriptPath], {
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		})
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open Foot: Wayland-native terminal with --working-directory flag.
 */
async function openFoot(cwd: string, scriptPath: string): Promise<Result<void, Error>> {
	try {
		const proc = Bun.spawn(["foot", "--working-directory", cwd, "bash", scriptPath], {
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		})
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open Ghostty on Linux: Uses same CLI pattern as macOS fallback.
 */
async function openGhosttyLinux(cwd: string, scriptPath: string): Promise<Result<void, Error>> {
	try {
		const proc = Bun.spawn(["ghostty", "-e", "bash", scriptPath], {
			cwd,
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		})
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open GNOME Terminal with --working-directory flag.
 */
async function openGnomeTerminal(cwd: string, scriptPath: string): Promise<Result<void, Error>> {
	try {
		const proc = Bun.spawn(
			["gnome-terminal", "--working-directory", cwd, "--", "bash", scriptPath],
			{
				detached: true,
				stdio: ["ignore", "ignore", "ignore"],
			},
		)
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open Konsole with --workdir flag.
 */
async function openKonsole(cwd: string, scriptPath: string): Promise<Result<void, Error>> {
	try {
		const proc = Bun.spawn(["konsole", "--workdir", cwd, "-e", "bash", scriptPath], {
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		})
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open XFCE4 Terminal with --working-directory flag.
 * Uses -x flag which allows multiple arguments instead of -e.
 */
async function openXfce4Terminal(cwd: string, scriptPath: string): Promise<Result<void, Error>> {
	try {
		const proc = Bun.spawn(
			["xfce4-terminal", "--working-directory", cwd, "-x", "bash", scriptPath],
			{
				detached: true,
				stdio: ["ignore", "ignore", "ignore"],
			},
		)
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open xdg-terminal-exec: Modern XDG standard for launching preferred terminal.
 */
async function openXdgTerminalExec(scriptPath: string): Promise<Result<void, Error>> {
	try {
		const proc = Bun.spawn(["xdg-terminal-exec", "--", "bash", scriptPath], {
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		})
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open x-terminal-emulator: Debian/Ubuntu alternatives system.
 */
async function openXTerminalEmulator(scriptPath: string): Promise<Result<void, Error>> {
	try {
		const proc = Bun.spawn(["x-terminal-emulator", "-e", "bash", scriptPath], {
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		})
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open xterm: Last resort fallback terminal.
 */
async function openXterm(scriptPath: string): Promise<Result<void, Error>> {
	try {
		const proc = Bun.spawn(["xterm", "-e", "bash", scriptPath], {
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		})
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open Warp: Uses open command with bundle ID.
 */
async function openWarpWindow(scriptPath: string): Promise<Result<void, Error>> {
	try {
		const proc = Bun.spawn(["open", "-b", "dev.warp.Warp-Stable", scriptPath], {
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		})
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open Terminal.app: Uses open -a command.
 */
async function openTerminalAppWindow(scriptPath: string): Promise<Result<void, Error>> {
	try {
		const proc = Bun.spawn(["open", "-a", "Terminal", scriptPath], {
			stdio: ["ignore", "ignore", "pipe"],
		})
		const exitCode = await proc.exited
		if (exitCode !== 0) {
			const stderr = await new Response(proc.stderr).text()
			return Result.err(new Error(`Failed to open Terminal: ${stderr}`))
		}
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Open terminal on macOS with tab support where available.
 * Detects current terminal and dispatches to appropriate handler.
 */
async function openTerminalMacOS(cwd: string, command: string): Promise<Result<void, string>> {
	// Create temp script (existing pattern)
	const scriptPath = path.join(os.tmpdir(), `worktree-${Bun.randomUUIDv7()}.sh`)
	const escapedCwd = escapeBash(cwd)
	const escapedCommand = escapeBash(command)
	const scriptContent = `#!/bin/bash\ncd "${escapedCwd}" && ${escapedCommand}\nexec bash`

	try {
		await Bun.write(scriptPath, scriptContent)
		await fs.chmod(scriptPath, 0o755)
	} catch (error) {
		return Result.err(error instanceof Error ? error.message : String(error))
	}

	const terminal = detectCurrentMacTerminal()

	let result: Result<void, Error>
	switch (terminal) {
		case "ghostty":
			result = await openGhosttyTab(scriptPath)
			break
		case "iterm":
			result = await openItermTab(scriptPath)
			break
		case "kitty":
			result = await openKittyTab(cwd, scriptPath)
			break
		case "alacritty":
			result = await openAlacrittyWindow(cwd, scriptPath)
			break
		case "warp":
			result = await openWarpWindow(scriptPath)
			break
		default:
			result = await openTerminalAppWindow(scriptPath)
			break
	}

	return result.ok ? Result.ok(undefined) : Result.err(result.error.message)
}

/**
 * Open terminal on Windows with Windows Terminal (wt.exe) detection.
 * Falls back to cmd.exe if Windows Terminal not available.
 */
async function openTerminalWindows(cwd: string, command: string): Promise<Result<void, string>> {
	// Check for Windows Terminal first
	const wtCheck = Bun.spawnSync(["where", "wt"], {
		stdout: "pipe",
		stderr: "pipe",
	})

	if (wtCheck.exitCode === 0) {
		// Windows Terminal available - create batch script and use wt.exe
		const scriptPath = path.join(os.tmpdir(), `worktree-${Bun.randomUUIDv7()}.bat`)
		const escapedCwd = escapeBatch(cwd)
		const escapedCommand = escapeBatch(command)
		const scriptContent = `@echo off\r\ncd /d "${escapedCwd}"\r\n${escapedCommand}\r\ncmd /k`

		try {
			await Bun.write(scriptPath, scriptContent)

			const proc = Bun.spawn(["wt.exe", "-d", cwd, "cmd", "/k", scriptPath], {
				detached: true,
				stdio: ["ignore", "ignore", "ignore"],
			})
			proc.unref()
			return Result.ok(undefined)
		} catch (error) {
			console.debug(`[worktree] Windows Terminal failed, falling back to cmd.exe: ${error}`)
		}
	}

	// Fallback: cmd.exe approach
	const scriptPath = path.join(os.tmpdir(), `worktree-${Bun.randomUUIDv7()}.bat`)
	const escapedCwd = escapeBatch(cwd)
	const escapedCommand = escapeBatch(command)
	const scriptContent = `@echo off\r\ncd /d "${escapedCwd}"\r\n${escapedCommand}\r\ncmd /k`

	try {
		await Bun.write(scriptPath, scriptContent)

		const proc = Bun.spawn(["cmd", "/c", "start", "", scriptPath], {
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		})
		proc.unref()
		return Result.ok(undefined)
	} catch (error) {
		return Result.err(error instanceof Error ? error.message : String(error))
	}
}

/**
 * Open terminal on Linux with improved detection priority.
 * Priority: current terminal (env) > xdg-terminal-exec > x-terminal-emulator > modern > DE > xterm
 */
async function openTerminalLinux(cwd: string, command: string): Promise<Result<void, string>> {
	// Create temp script
	const scriptPath = path.join(os.tmpdir(), `worktree-${Bun.randomUUIDv7()}.sh`)
	const escapedCwd = escapeBash(cwd)
	const escapedCommand = escapeBash(command)
	const scriptContent = `#!/bin/bash\ncd "${escapedCwd}" && ${escapedCommand}\nexec bash`

	try {
		await Bun.write(scriptPath, scriptContent)
		await fs.chmod(scriptPath, 0o755)
	} catch (error) {
		return Result.err(error instanceof Error ? error.message : String(error))
	}

	// 1. Check current terminal via env detection (most accurate)
	const currentTerminal = detectCurrentLinuxTerminal()
	if (currentTerminal) {
		let result: Result<void, Error> | null
		switch (currentTerminal) {
			case "kitty":
				result = await openKittyTab(cwd, scriptPath)
				break
			case "wezterm":
				result = await openWezterm(cwd, scriptPath)
				break
			case "alacritty":
				result = await openAlacrittyWindow(cwd, scriptPath)
				break
			case "ghostty":
				result = await openGhosttyLinux(cwd, scriptPath)
				break
			case "foot":
				result = await openFoot(cwd, scriptPath)
				break
			case "gnome-terminal":
				result = await openGnomeTerminal(cwd, scriptPath)
				break
			case "konsole":
				result = await openKonsole(cwd, scriptPath)
				break
			default:
				console.debug(`[worktree] No direct handler for ${currentTerminal}, using fallback chain`)
				result = null // Force fallback chain
		}
		if (result?.ok) return Result.ok(undefined)
		// Fall through on failure to try other methods
	}

	// 2. xdg-terminal-exec (modern XDG standard)
	const xdgCheck = Bun.spawnSync(["which", "xdg-terminal-exec"])
	if (xdgCheck.exitCode === 0) {
		const result = await openXdgTerminalExec(scriptPath)
		if (result.ok) return Result.ok(undefined)
	}

	// 3. x-terminal-emulator (Debian/Ubuntu)
	const xteCheck = Bun.spawnSync(["which", "x-terminal-emulator"])
	if (xteCheck.exitCode === 0) {
		const result = await openXTerminalEmulator(scriptPath)
		if (result.ok) return Result.ok(undefined)
	}

	// 4. Fallback chain: modern terminals
	const modernTerminals = ["kitty", "alacritty", "wezterm", "ghostty", "foot"] as const
	for (const term of modernTerminals) {
		const check = Bun.spawnSync(["which", term])
		if (check.exitCode === 0) {
			let result: Result<void, Error>
			switch (term) {
				case "kitty":
					result = await openKittyTab(cwd, scriptPath)
					break
				case "alacritty":
					result = await openAlacrittyWindow(cwd, scriptPath)
					break
				case "wezterm":
					result = await openWezterm(cwd, scriptPath)
					break
				case "ghostty":
					result = await openGhosttyLinux(cwd, scriptPath)
					break
				case "foot":
					result = await openFoot(cwd, scriptPath)
					break
			}
			if (result.ok) return Result.ok(undefined)
		}
	}

	// 5. Fallback chain: DE terminals
	const deTerminals = ["gnome-terminal", "konsole", "xfce4-terminal"] as const
	for (const term of deTerminals) {
		const check = Bun.spawnSync(["which", term])
		if (check.exitCode === 0) {
			let result: Result<void, Error>
			switch (term) {
				case "gnome-terminal":
					result = await openGnomeTerminal(cwd, scriptPath)
					break
				case "konsole":
					result = await openKonsole(cwd, scriptPath)
					break
				case "xfce4-terminal":
					result = await openXfce4Terminal(cwd, scriptPath)
					break
			}
			if (result.ok) return Result.ok(undefined)
		}
	}

	// 6. Last resort: xterm
	const xtermResult = await openXterm(scriptPath)
	return xtermResult.ok ? Result.ok(undefined) : Result.err(xtermResult.error.message)
}

/** Environment variables for macOS terminal detection */
const macTerminalEnvSchema = z.object({
	TERM_PROGRAM: z.string().optional(),
	GHOSTTY_RESOURCES_DIR: z.string().optional(),
	ITERM_SESSION_ID: z.string().optional(),
	KITTY_WINDOW_ID: z.string().optional(),
	ALACRITTY_WINDOW_ID: z.string().optional(),
	__CFBundleIdentifier: z.string().optional(), // Warp uses this
})

type MacTerminal = "ghostty" | "iterm" | "warp" | "kitty" | "alacritty" | "terminal"

/**
 * Detect the CURRENT macOS terminal from environment variables.
 * Parses env at boundary using Zod schema for type safety.
 * Prioritizes terminal-specific env vars over TERM_PROGRAM for reliability.
 */
function detectCurrentMacTerminal(): MacTerminal {
	const env = macTerminalEnvSchema.parse(process.env)

	// Check specific env vars first (most reliable)
	if (env.GHOSTTY_RESOURCES_DIR) return "ghostty"
	if (env.ITERM_SESSION_ID) return "iterm"
	if (env.KITTY_WINDOW_ID) return "kitty"
	if (env.ALACRITTY_WINDOW_ID) return "alacritty"
	if (env.__CFBundleIdentifier === "dev.warp.Warp-Stable") return "warp"

	// Fallback to TERM_PROGRAM
	const termProgram = env.TERM_PROGRAM?.toLowerCase()
	if (termProgram === "ghostty") return "ghostty"
	if (termProgram === "iterm.app") return "iterm"
	if (termProgram === "warpterm") return "warp"
	if (termProgram === "apple_terminal") return "terminal"

	// Default to Terminal.app
	return "terminal"
}

/**
 * Detect the CURRENT Linux terminal from environment variables.
 * Parses env at boundary using Zod schema for type safety.
 * Prioritizes terminal-specific env vars for reliability.
 */
function detectCurrentLinuxTerminal(): LinuxTerminal | null {
	const env = linuxTerminalEnvSchema.parse(process.env)

	// Check specific env vars first (most reliable)
	if (env.KITTY_WINDOW_ID) return "kitty"
	if (env.WEZTERM_PANE) return "wezterm"
	if (env.ALACRITTY_WINDOW_ID) return "alacritty"
	if (env.GHOSTTY_RESOURCES_DIR) return "ghostty"
	if (env.GNOME_TERMINAL_SERVICE) return "gnome-terminal"
	if (env.KONSOLE_VERSION) return "konsole"

	// TERM_PROGRAM fallback
	const termProgram = env.TERM_PROGRAM?.toLowerCase()
	if (termProgram === "foot") return "foot"

	return null // Use fallback chain
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
				const { path: worktreePath, sessionId, branch } = state.pendingSpawn
				const terminalResult = await openTerminal(
					worktreePath,
					`opencode --session ${sessionId}`,
					branch,
				)

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
				const addResult = await git(["add", "-A"], worktreePath)
				if (!addResult.ok) console.warn(`[worktree] git add failed: ${addResult.error}`)

				const commitResult = await git(
					["commit", "-m", "chore(worktree): session snapshot", "--allow-empty"],
					worktreePath,
				)
				if (!commitResult.ok) console.warn(`[worktree] git commit failed: ${commitResult.error}`)

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
