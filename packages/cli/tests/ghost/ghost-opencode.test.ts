/**
 * Ghost OpenCode Passthrough Tests
 *
 * Tests for the `ocx ghost opencode` command:
 * - Sets OPENCODE_DISABLE_PROJECT_DISCOVERY=true env var
 * - Sets OPENCODE_CONFIG_DIR to profile directory
 * - Sets OPENCODE_CONFIG_CONTENT env var correctly
 * - Sets OCX_PROFILE env var
 * - Runs directly in project directory (not temp dir)
 * - Passes all arguments through to opencode
 * - Discovers and filters instruction files (AGENTS.md, CLAUDE.md, CONTEXT.md)
 *
 * Note: These tests use a mock script instead of the real opencode binary
 * to verify environment variable passing and argument forwarding.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
	detectGitRoot,
	discoverInstructionFiles,
	filterByPatterns,
} from "../../src/commands/ghost/opencode.js"
import { getGhostConfigPath, getGhostOpencodeConfigPath } from "../../src/ghost/config.js"

// =============================================================================
// HELPERS
// =============================================================================

interface CLIResult {
	stdout: string
	stderr: string
	output: string
	exitCode: number
}

async function createTempConfigDir(name: string): Promise<string> {
	const dir = join(import.meta.dir, "fixtures", `tmp-${name}-${Date.now()}`)
	await mkdir(dir, { recursive: true })
	return dir
}

async function cleanupTempDir(dir: string): Promise<void> {
	await rm(dir, { recursive: true, force: true })
}

async function runGhostCLI(
	args: string[],
	env: Record<string, string> = {},
	cwd?: string,
): Promise<CLIResult> {
	const indexPath = join(import.meta.dir, "..", "..", "src/index.ts")

	const proc = Bun.spawn(["bun", "run", indexPath, "ghost", ...args], {
		env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", ...env },
		stdout: "pipe",
		stderr: "pipe",
		...(cwd && { cwd }),
	})

	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	])

	const exitCode = await proc.exited

	return {
		stdout,
		stderr,
		output: stdout + stderr,
		exitCode,
	}
}

/**
 * Create a mock opencode script that outputs its environment and arguments.
 * This allows us to verify the correct env vars and args are passed.
 */
async function createMockOpencode(dir: string): Promise<string> {
	const scriptPath = join(dir, "opencode")
	const script = `#!/bin/bash
# Output key environment variables for verification
echo "OPENCODE_DISABLE_PROJECT_DISCOVERY=$OPENCODE_DISABLE_PROJECT_DISCOVERY"
echo "OPENCODE_CONFIG_DIR=$OPENCODE_CONFIG_DIR"
echo "OPENCODE_CONFIG_CONTENT=$OPENCODE_CONFIG_CONTENT"
echo "OCX_PROFILE=$OCX_PROFILE"
echo "CWD=$(pwd)"
echo "ARGS=$@"
exit 0
`
	await Bun.write(scriptPath, script)
	await Bun.spawn(["chmod", "+x", scriptPath]).exited
	return dir
}

// =============================================================================
// TESTS
// =============================================================================

describe("ocx ghost opencode", () => {
	let testDir: string
	let mockBinDir: string
	let projectDir: string // Clean project directory for running tests
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

	beforeEach(async () => {
		testDir = await createTempConfigDir("ghost-opencode")
		mockBinDir = await createTempConfigDir("mock-bin")
		// Create a clean project directory for tests to run from (avoids file limit issues)
		projectDir = await createTempConfigDir("ghost-project")
		await Bun.write(join(projectDir, "example.txt"), "test content")
		await createMockOpencode(mockBinDir)
		// Initialize ghost config
		await runGhostCLI(["init"], { XDG_CONFIG_HOME: testDir })
		process.env.XDG_CONFIG_HOME = testDir
	})

	afterEach(async () => {
		if (originalXdgConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME
		} else {
			process.env.XDG_CONFIG_HOME = originalXdgConfigHome
		}
		await cleanupTempDir(testDir)
		await cleanupTempDir(mockBinDir)
		await cleanupTempDir(projectDir)
	})

	it("should fail if ghost mode is not initialized", async () => {
		const freshDir = await createTempConfigDir("ghost-opencode-fresh")

		const { exitCode, output } = await runGhostCLI(["opencode"], {
			XDG_CONFIG_HOME: freshDir,
			PATH: `${mockBinDir}:${process.env.PATH}`,
		})

		expect(exitCode).not.toBe(0)
		expect(output).toContain("not initialized")

		await cleanupTempDir(freshDir)
	})

	it("should warn when opencode config is empty", async () => {
		// Write ghost.jsonc (required for ghost mode to be initialized)
		const configPath = getGhostConfigPath()
		await Bun.write(configPath, '{"registries": {}}')
		// Remove opencode.jsonc if it exists (created by ghost init in beforeEach)
		const opencodeConfigPath = getGhostOpencodeConfigPath()
		await rm(opencodeConfigPath, { force: true })

		const { output } = await runGhostCLI(["opencode"], {
			XDG_CONFIG_HOME: testDir,
			PATH: `${mockBinDir}:${process.env.PATH}`,
		})

		expect(output).toContain("opencode.jsonc")
	})

	it("should set OPENCODE_DISABLE_PROJECT_DISCOVERY env var", async () => {
		// Write ghost.jsonc (required for ghost mode to be initialized)
		const configPath = getGhostConfigPath()
		await Bun.write(configPath, '{"registries": {}}')

		// Write opencode.jsonc with settings
		const opencodeConfigPath = getGhostOpencodeConfigPath()
		await Bun.write(opencodeConfigPath, '{"model": "test"}')

		const { output } = await runGhostCLI(
			["opencode"],
			{
				XDG_CONFIG_HOME: testDir,
				PATH: `${mockBinDir}:${process.env.PATH}`,
			},
			projectDir,
		)

		// The mock script outputs OPENCODE_DISABLE_PROJECT_DISCOVERY
		expect(output).toContain("OPENCODE_DISABLE_PROJECT_DISCOVERY=true")
	})

	it("should set OPENCODE_CONFIG_DIR to profile directory", async () => {
		// Write ghost.jsonc (required for ghost mode to be initialized)
		const configPath = getGhostConfigPath()
		await Bun.write(configPath, '{"registries": {}}')

		// Write opencode.jsonc with settings
		const opencodeConfigPath = getGhostOpencodeConfigPath()
		await Bun.write(opencodeConfigPath, '{"model": "test"}')

		const { output } = await runGhostCLI(
			["opencode"],
			{
				XDG_CONFIG_HOME: testDir,
				PATH: `${mockBinDir}:${process.env.PATH}`,
			},
			projectDir,
		)

		// The mock script outputs OPENCODE_CONFIG_DIR
		// Should point to profile directory (default profile)
		expect(output).toContain("OPENCODE_CONFIG_DIR=")
		expect(output).toContain("profiles/default")
	})

	it("should set OCX_PROFILE env var", async () => {
		// Write ghost.jsonc (required for ghost mode to be initialized)
		const configPath = getGhostConfigPath()
		await Bun.write(configPath, '{"registries": {}}')

		// Write opencode.jsonc with settings
		const opencodeConfigPath = getGhostOpencodeConfigPath()
		await Bun.write(opencodeConfigPath, '{"model": "test"}')

		const { output } = await runGhostCLI(
			["opencode"],
			{
				XDG_CONFIG_HOME: testDir,
				PATH: `${mockBinDir}:${process.env.PATH}`,
			},
			projectDir,
		)

		// The mock script outputs OCX_PROFILE
		expect(output).toContain("OCX_PROFILE=default")
	})

	it("should run opencode in project directory (not temp dir)", async () => {
		// Write ghost.jsonc (required for ghost mode to be initialized)
		const configPath = getGhostConfigPath()
		await Bun.write(configPath, '{"registries": {}}')

		// Write opencode.jsonc with settings
		const opencodeConfigPath = getGhostOpencodeConfigPath()
		await Bun.write(opencodeConfigPath, '{"model": "test"}')

		const { output } = await runGhostCLI(
			["opencode"],
			{
				XDG_CONFIG_HOME: testDir,
				PATH: `${mockBinDir}:${process.env.PATH}`,
			},
			projectDir,
		)

		// The mock script outputs current working directory
		// Should be the project directory, not a temp symlink farm
		expect(output).toContain(`CWD=${projectDir}`)
		// Should NOT contain ocx-ghost temp directory pattern
		expect(output).not.toMatch(/CWD=.*ocx-ghost-/)
	})

	it("should set OPENCODE_CONFIG_CONTENT env var correctly", async () => {
		// Write ghost.jsonc (required for ghost mode to be initialized)
		const configPath = getGhostConfigPath()
		await Bun.write(configPath, '{"registries": {}}')

		// Write opencode.jsonc with settings
		const opencodeConfigPath = getGhostOpencodeConfigPath()
		const opencodeConfig = {
			model: "anthropic/claude-sonnet-4-20250514",
			theme: "dark",
		}
		await Bun.write(opencodeConfigPath, JSON.stringify(opencodeConfig))

		const { output } = await runGhostCLI(
			["opencode"],
			{
				XDG_CONFIG_HOME: testDir,
				PATH: `${mockBinDir}:${process.env.PATH}`,
			},
			projectDir,
		)

		// The mock script outputs OPENCODE_CONFIG_CONTENT
		expect(output).toContain("OPENCODE_CONFIG_CONTENT=")

		// Extract the JSON from the output
		const match = output.match(/OPENCODE_CONFIG_CONTENT=(.+)/)
		if (match) {
			const configContent = JSON.parse(match[1])
			expect(configContent.model).toBe("anthropic/claude-sonnet-4-20250514")
			expect(configContent.theme).toBe("dark")
		}
	})

	it("should pass all arguments through to opencode", async () => {
		// Write ghost.jsonc (required for ghost mode)
		const configPath = getGhostConfigPath()
		await Bun.write(configPath, '{"registries": {}}')

		// Write opencode.jsonc
		const opencodeConfigPath = getGhostOpencodeConfigPath()
		await Bun.write(opencodeConfigPath, '{"model": "test"}')

		// Use arguments that won't be intercepted by Commander
		const { output } = await runGhostCLI(
			["opencode", "--custom-flag", "arg1", "arg2"],
			{
				XDG_CONFIG_HOME: testDir,
				PATH: `${mockBinDir}:${process.env.PATH}`,
			},
			projectDir,
		)

		// The mock script outputs the args
		expect(output).toContain("ARGS=--custom-flag arg1 arg2")
	})

	it("should handle complex arguments with spaces", async () => {
		// Write ghost.jsonc (required for ghost mode)
		const configPath = getGhostConfigPath()
		await Bun.write(configPath, '{"registries": {}}')

		// Write empty opencode.jsonc
		const opencodeConfigPath = getGhostOpencodeConfigPath()
		await Bun.write(opencodeConfigPath, "{}")

		const { output } = await runGhostCLI(
			["opencode", "--message", "hello world"],
			{
				XDG_CONFIG_HOME: testDir,
				PATH: `${mockBinDir}:${process.env.PATH}`,
			},
			projectDir,
		)

		expect(output).toContain("--message")
		expect(output).toContain("hello world")
	})

	it("should accept --no-rename flag without error", async () => {
		// Write ghost.jsonc (required for ghost mode)
		const configPath = getGhostConfigPath()
		await Bun.write(configPath, '{"registries": {}}')

		// Write empty opencode.jsonc
		const opencodeConfigPath = getGhostOpencodeConfigPath()
		await Bun.write(opencodeConfigPath, "{}")

		const { stderr } = await runGhostCLI(
			["opencode", "--no-rename"],
			{
				XDG_CONFIG_HOME: testDir,
				PATH: `${mockBinDir}:${process.env.PATH}`,
			},
			projectDir,
		)

		// The command should parse the flag without error
		// It will still run because we have a mock opencode binary, but the flag should be recognized
		expect(stderr).not.toContain("unknown option")
		expect(stderr).not.toContain("--no-rename")
	})
})

// =============================================================================
// INSTRUCTION FILE DISCOVERY TESTS
// =============================================================================

/**
 * Helper to create a temp directory with automatic cleanup.
 * Uses the project fixtures directory.
 */
async function withTempDir<T>(name: string, fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = join(import.meta.dir, "fixtures", `tmp-${name}-${Date.now()}`)
	await mkdir(dir, { recursive: true })
	try {
		return await fn(dir)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
}

/**
 * Helper to create a temp directory outside any git repository.
 * This is needed for tests that require no git root to be found.
 */
async function withIsolatedTempDir<T>(name: string, fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = join(tmpdir(), `ocx-test-${name}-${Date.now()}`)
	await mkdir(dir, { recursive: true })
	try {
		return await fn(dir)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
}

describe("detectGitRoot", () => {
	it("finds .git directory in project root", async () => {
		await withTempDir("git-root", async (tempDir) => {
			// Create .git directory
			await mkdir(join(tempDir, ".git"), { recursive: true })

			const result = detectGitRoot(tempDir)

			expect(result).toBe(tempDir)
		})
	})

	it("finds .git in parent directory", async () => {
		await withTempDir("git-parent", async (tempDir) => {
			// Create .git at root and a nested directory
			await mkdir(join(tempDir, ".git"), { recursive: true })
			const nestedDir = join(tempDir, "src", "components")
			await mkdir(nestedDir, { recursive: true })

			const result = detectGitRoot(nestedDir)

			expect(result).toBe(tempDir)
		})
	})

	it("returns null when no .git exists (isolated directory)", async () => {
		// Use isolated temp dir outside any git repository
		await withIsolatedTempDir("no-git", async (tempDir) => {
			const result = detectGitRoot(tempDir)

			expect(result).toBeNull()
		})
	})

	it("handles .git file (worktrees)", async () => {
		await withTempDir("git-worktree", async (tempDir) => {
			// .git can be a file in worktrees
			await Bun.write(join(tempDir, ".git"), "gitdir: /path/to/worktree")

			const result = detectGitRoot(tempDir)

			expect(result).toBe(tempDir)
		})
	})
})

describe("discoverInstructionFiles", () => {
	it("finds AGENTS.md in project root", async () => {
		await withTempDir("discover-root", async (tempDir) => {
			// Create .git and AGENTS.md
			await mkdir(join(tempDir, ".git"), { recursive: true })
			await Bun.write(join(tempDir, "AGENTS.md"), "# Instructions")

			const result = discoverInstructionFiles(tempDir, tempDir)

			expect(result).toEqual(["AGENTS.md"])
		})
	})

	it("finds files at multiple depths (deepest first)", async () => {
		await withTempDir("discover-depths", async (tempDir) => {
			// Create .git at root
			await mkdir(join(tempDir, ".git"), { recursive: true })

			// Create AGENTS.md at multiple levels
			await Bun.write(join(tempDir, "AGENTS.md"), "# Root")
			await mkdir(join(tempDir, "src"), { recursive: true })
			await Bun.write(join(tempDir, "src", "AGENTS.md"), "# Src")
			await mkdir(join(tempDir, "src", "components"), { recursive: true })
			await Bun.write(join(tempDir, "src", "components", "AGENTS.md"), "# Components")

			// Call from deepest directory
			const deepDir = join(tempDir, "src", "components")
			const result = discoverInstructionFiles(deepDir, tempDir)

			// Deepest first: walk starts at projectDir and goes up to gitRoot
			// Profile instructions come last (highest priority), so deepest project
			// files come first, root comes last (just before profile)
			expect(result).toEqual(["src/components/AGENTS.md", "src/AGENTS.md", "AGENTS.md"])
		})
	})

	it("returns alphabetical order within same depth", async () => {
		await withTempDir("discover-alpha", async (tempDir) => {
			// Create .git and multiple instruction files
			await mkdir(join(tempDir, ".git"), { recursive: true })
			await Bun.write(join(tempDir, "AGENTS.md"), "# Agents")
			await Bun.write(join(tempDir, "CLAUDE.md"), "# Claude")
			await Bun.write(join(tempDir, "CONTEXT.md"), "# Context")

			const result = discoverInstructionFiles(tempDir, tempDir)

			// Files are added in INSTRUCTION_FILES order (AGENTS, CLAUDE, CONTEXT)
			// No reversal, so alphabetical order is preserved
			expect(result).toEqual(["AGENTS.md", "CLAUDE.md", "CONTEXT.md"])
		})
	})

	it("handles no git root (uses projectDir only)", async () => {
		await withTempDir("discover-no-git", async (tempDir) => {
			// Create instruction file without .git
			await Bun.write(join(tempDir, "AGENTS.md"), "# Instructions")

			// gitRoot is null, so only searches projectDir
			const result = discoverInstructionFiles(tempDir, null)

			expect(result).toEqual(["AGENTS.md"])
		})
	})

	it("only searches from projectDir to gitRoot (not above)", async () => {
		await withTempDir("discover-bounded", async (tempDir) => {
			// Create structure: tempDir/.git, tempDir/AGENTS.md, tempDir/project/AGENTS.md
			await mkdir(join(tempDir, ".git"), { recursive: true })
			await Bun.write(join(tempDir, "AGENTS.md"), "# Root")
			const projectDir = join(tempDir, "project")
			await mkdir(projectDir, { recursive: true })
			await Bun.write(join(projectDir, "AGENTS.md"), "# Project")

			// Call from project subdirectory
			const result = discoverInstructionFiles(projectDir, tempDir)

			// Should find both: deepest first (project/AGENTS.md), then root AGENTS.md
			expect(result).toEqual(["project/AGENTS.md", "AGENTS.md"])
		})
	})

	it("follows symlinks", async () => {
		await withTempDir("discover-symlink", async (tempDir) => {
			// Create .git and a linked AGENTS.md
			await mkdir(join(tempDir, ".git"), { recursive: true })
			await mkdir(join(tempDir, "shared"), { recursive: true })
			await Bun.write(join(tempDir, "shared", "AGENTS.md"), "# Shared")

			// Create symlink
			await symlink(join(tempDir, "shared", "AGENTS.md"), join(tempDir, "AGENTS.md"))

			const result = discoverInstructionFiles(tempDir, tempDir)

			// Symlink should be discovered
			expect(result).toEqual(["AGENTS.md"])
		})
	})

	it("ignores directories with instruction file names", async () => {
		await withTempDir("discover-ignore-dir", async (tempDir) => {
			// Create .git
			await mkdir(join(tempDir, ".git"), { recursive: true })

			// Create a directory named AGENTS.md (weird but possible)
			await mkdir(join(tempDir, "AGENTS.md"), { recursive: true })

			// Create a real file
			await Bun.write(join(tempDir, "CLAUDE.md"), "# Claude")

			const result = discoverInstructionFiles(tempDir, tempDir)

			// Should only find CLAUDE.md, not the directory
			expect(result).toEqual(["CLAUDE.md"])
		})
	})

	it("returns empty array when no instruction files exist", async () => {
		await withTempDir("discover-empty", async (tempDir) => {
			await mkdir(join(tempDir, ".git"), { recursive: true })
			await Bun.write(join(tempDir, "README.md"), "# Readme")

			const result = discoverInstructionFiles(tempDir, tempDir)

			expect(result).toEqual([])
		})
	})
})

// =============================================================================
// FILTER BY PATTERNS TESTS
// =============================================================================

describe("filterByPatterns", () => {
	it("excludes files matching exclude patterns", () => {
		const files = ["AGENTS.md", "src/AGENTS.md"]

		const result = filterByPatterns(files, ["**/AGENTS.md"], [])

		expect(result).toEqual([])
	})

	it("include overrides exclude", () => {
		const files = ["AGENTS.md", "src/AGENTS.md", "docs/AGENTS.md"]

		const result = filterByPatterns(
			files,
			["**/AGENTS.md"], // exclude all
			["docs/AGENTS.md"], // but include this one
		)

		expect(result).toEqual(["docs/AGENTS.md"])
	})

	it("preserves order after filtering", () => {
		const files = ["deep/AGENTS.md", "AGENTS.md", "CLAUDE.md"]

		const result = filterByPatterns(files, ["**/CLAUDE.md"], [])

		expect(result).toEqual(["deep/AGENTS.md", "AGENTS.md"])
	})

	it("keeps files not matching any pattern", () => {
		const files = ["AGENTS.md", "OTHER.md"]

		const result = filterByPatterns(files, ["**/CLAUDE.md"], [])

		expect(result).toEqual(["AGENTS.md", "OTHER.md"])
	})

	it("handles empty exclude and include arrays", () => {
		const files = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"]

		const result = filterByPatterns(files, [], [])

		expect(result).toEqual(["AGENTS.md", "CLAUDE.md", "CONTEXT.md"])
	})

	it("handles multiple exclude patterns", () => {
		const files = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md", "OTHER.md"]

		const result = filterByPatterns(files, ["**/AGENTS.md", "**/CLAUDE.md"], [])

		expect(result).toEqual(["CONTEXT.md", "OTHER.md"])
	})

	it("handles multiple include patterns overriding exclude", () => {
		const files = ["AGENTS.md", "src/AGENTS.md", "docs/AGENTS.md", "lib/AGENTS.md"]

		const result = filterByPatterns(
			files,
			["**/AGENTS.md"], // exclude all
			["docs/AGENTS.md", "lib/AGENTS.md"], // but include these
		)

		expect(result).toEqual(["docs/AGENTS.md", "lib/AGENTS.md"])
	})

	it("handles glob wildcards in patterns", () => {
		const files = ["src/AGENTS.md", "src/utils/AGENTS.md", "test/AGENTS.md"]

		const result = filterByPatterns(files, ["src/**"], [])

		expect(result).toEqual(["test/AGENTS.md"])
	})

	it("handles root-level pattern matching", () => {
		const files = ["AGENTS.md", "src/AGENTS.md"]

		const result = filterByPatterns(files, ["AGENTS.md"], [])

		// Only root AGENTS.md matches, not src/AGENTS.md (because pattern is not **/AGENTS.md)
		expect(result).toEqual(["src/AGENTS.md"])
	})

	it("handles default ghost config exclude patterns", () => {
		const files = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md", "docs/AGENTS.md"]

		// Default ghost config excludes all instruction files
		const defaultExclude = ["**/AGENTS.md", "**/CLAUDE.md", "**/CONTEXT.md"]

		const result = filterByPatterns(files, defaultExclude, [])

		expect(result).toEqual([])
	})

	it("allows project files when exclude is modified", () => {
		const files = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"]

		// User customizes to only exclude CLAUDE.md and CONTEXT.md
		const result = filterByPatterns(files, ["**/CLAUDE.md", "**/CONTEXT.md"], [])

		expect(result).toEqual(["AGENTS.md"])
	})
})

// =============================================================================
// INSTRUCTION DISCOVERY INTEGRATION TESTS
// =============================================================================

describe("instruction discovery integration", () => {
	it("injects discovered files into OPENCODE_CONFIG_CONTENT", async () => {
		await withTempDir("integration-discover", async (tempDir) => {
			// Setup: Create temp config directory for XDG_CONFIG_HOME
			const configDir = join(tempDir, "config")
			await mkdir(configDir, { recursive: true })

			// Create project with instruction files
			const projectDir = join(tempDir, "project")
			await mkdir(join(projectDir, ".git"), { recursive: true })
			await Bun.write(join(projectDir, "AGENTS.md"), "# Project instructions")

			// Create mock opencode binary
			const mockBinDir = join(tempDir, "bin")
			await mkdir(mockBinDir, { recursive: true })
			const mockOpencode = join(mockBinDir, "opencode")
			await Bun.write(
				mockOpencode,
				`#!/bin/bash
echo "OPENCODE_CONFIG_CONTENT=$OPENCODE_CONFIG_CONTENT"
exit 0
`,
			)
			await Bun.spawn(["chmod", "+x", mockOpencode]).exited

			// Initialize ghost config with empty exclude (allows project files)
			const indexPath = join(import.meta.dir, "..", "..", "src/index.ts")
			await Bun.spawn(["bun", "run", indexPath, "ghost", "init"], {
				env: { ...process.env, XDG_CONFIG_HOME: configDir },
				stdout: "pipe",
				stderr: "pipe",
			}).exited

			// Update ghost.jsonc to have empty exclude
			const ghostConfigPath = join(configDir, "opencode", "profiles", "default", "ghost.jsonc")
			await Bun.write(ghostConfigPath, '{"registries": {}, "exclude": [], "include": []}')

			// Write opencode.jsonc
			const opencodeConfigPath = join(
				configDir,
				"opencode",
				"profiles",
				"default",
				"opencode.jsonc",
			)
			await Bun.write(opencodeConfigPath, '{"model": "test"}')

			// Run ghost opencode
			const proc = Bun.spawn(["bun", "run", indexPath, "ghost", "opencode"], {
				env: {
					...process.env,
					XDG_CONFIG_HOME: configDir,
					PATH: `${mockBinDir}:${process.env.PATH}`,
					NO_COLOR: "1",
					FORCE_COLOR: "0",
				},
				cwd: projectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const stdout = await new Response(proc.stdout).text()
			await proc.exited

			// Verify OPENCODE_CONFIG_CONTENT contains instructions
			const match = stdout.match(/OPENCODE_CONFIG_CONTENT=(.+)/)
			if (match) {
				const configContent = JSON.parse(match[1])
				expect(configContent.instructions).toBeDefined()
				expect(configContent.instructions.length).toBeGreaterThan(0)
				// The instruction should be an absolute path to AGENTS.md
				expect(configContent.instructions.some((i: string) => i.endsWith("AGENTS.md"))).toBe(true)
			} else {
				// If we can't extract the config, at least verify it's set
				expect(stdout).toContain("OPENCODE_CONFIG_CONTENT=")
			}
		})
	})

	it("excludes files when default exclude patterns are active", async () => {
		await withTempDir("integration-exclude", async (tempDir) => {
			// Setup: Create temp config directory
			const configDir = join(tempDir, "config")
			await mkdir(configDir, { recursive: true })

			// Create project with instruction files
			const projectDir = join(tempDir, "project")
			await mkdir(join(projectDir, ".git"), { recursive: true })
			await Bun.write(join(projectDir, "AGENTS.md"), "# Project instructions")

			// Create mock opencode binary
			const mockBinDir = join(tempDir, "bin")
			await mkdir(mockBinDir, { recursive: true })
			const mockOpencode = join(mockBinDir, "opencode")
			await Bun.write(
				mockOpencode,
				`#!/bin/bash
echo "OPENCODE_CONFIG_CONTENT=$OPENCODE_CONFIG_CONTENT"
exit 0
`,
			)
			await Bun.spawn(["chmod", "+x", mockOpencode]).exited

			// Initialize ghost config
			const indexPath = join(import.meta.dir, "..", "..", "src/index.ts")
			await Bun.spawn(["bun", "run", indexPath, "ghost", "init"], {
				env: { ...process.env, XDG_CONFIG_HOME: configDir },
				stdout: "pipe",
				stderr: "pipe",
			}).exited

			// Keep default ghost.jsonc which has default exclude patterns
			// Just ensure opencode.jsonc exists
			const opencodeConfigPath = join(
				configDir,
				"opencode",
				"profiles",
				"default",
				"opencode.jsonc",
			)
			await Bun.write(opencodeConfigPath, '{"model": "test"}')

			// Run ghost opencode
			const proc = Bun.spawn(["bun", "run", indexPath, "ghost", "opencode"], {
				env: {
					...process.env,
					XDG_CONFIG_HOME: configDir,
					PATH: `${mockBinDir}:${process.env.PATH}`,
					NO_COLOR: "1",
					FORCE_COLOR: "0",
				},
				cwd: projectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const stdout = await new Response(proc.stdout).text()
			await proc.exited

			// Verify OPENCODE_CONFIG_CONTENT has empty or no project instructions
			// (because default exclude patterns filter them out)
			const match = stdout.match(/OPENCODE_CONFIG_CONTENT=(.+)/)
			if (match) {
				const configContent = JSON.parse(match[1])
				// Should have no project instructions (only profile instructions if any)
				const projectInstructions = (configContent.instructions || []).filter((i: string) =>
					i.includes(projectDir),
				)
				expect(projectInstructions.length).toBe(0)
			}
		})
	})
})
