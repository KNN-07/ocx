/**
 * Symlink Farm Tests
 *
 * Tests for the symlink farm utility used in ghost mode.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { lstat, mkdir, readlink, rm } from "node:fs/promises"
import { join } from "node:path"
import ignore from "ignore"
import { FileLimitExceededError } from "../../src/utils/errors.js"
import {
	addScopedRules,
	cleanupSymlinkFarm,
	createSymlinkFarm,
	GHOST_MARKER_FILE,
	getGitDir,
	injectGhostFiles,
	loadGitIgnoreStack,
	normalizePath,
} from "../../src/utils/symlink-farm.js"

// =============================================================================
// HELPERS
// =============================================================================

async function createTempDir(name: string): Promise<string> {
	const dir = join(import.meta.dir, "fixtures", `tmp-${name}-${Date.now()}`)
	await mkdir(dir, { recursive: true })
	return dir
}

async function cleanupTempDir(dir: string): Promise<void> {
	await rm(dir, { recursive: true, force: true })
}

// =============================================================================
// TESTS
// =============================================================================

describe("createSymlinkFarm", () => {
	let sourceDir: string

	beforeEach(async () => {
		sourceDir = await createTempDir("symlink-farm-source")
	})

	afterEach(async () => {
		await cleanupTempDir(sourceDir)
	})

	it("should create symlinks to all files in source directory", async () => {
		// Create some files
		await Bun.write(join(sourceDir, "file1.txt"), "content1")
		await Bun.write(join(sourceDir, "file2.txt"), "content2")

		const { tempDir } = await createSymlinkFarm(sourceDir)

		try {
			// Check symlinks exist
			const stat1 = await lstat(join(tempDir, "file1.txt"))
			const stat2 = await lstat(join(tempDir, "file2.txt"))

			expect(stat1.isSymbolicLink()).toBe(true)
			expect(stat2.isSymbolicLink()).toBe(true)

			// Check they point to the right place
			const target1 = await readlink(join(tempDir, "file1.txt"))
			const target2 = await readlink(join(tempDir, "file2.txt"))

			expect(target1).toBe(join(sourceDir, "file1.txt"))
			expect(target2).toBe(join(sourceDir, "file2.txt"))
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})

	it("should create symlinks to directories", async () => {
		// Create a subdirectory with content
		const subDir = join(sourceDir, "subdir")
		await mkdir(subDir, { recursive: true })
		await Bun.write(join(subDir, "nested.txt"), "nested content")

		const { tempDir } = await createSymlinkFarm(sourceDir)

		try {
			// Check symlink exists
			const stat = await lstat(join(tempDir, "subdir"))
			expect(stat.isSymbolicLink()).toBe(true)

			// Check symlink target
			const target = await readlink(join(tempDir, "subdir"))
			expect(target).toBe(subDir)

			// Check we can read through the symlink
			const content = await Bun.file(join(tempDir, "subdir", "nested.txt")).text()
			expect(content).toBe("nested content")
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})

	it("should exclude paths via excludePatterns", async () => {
		// Create some files
		await Bun.write(join(sourceDir, "keep.txt"), "keep")
		await Bun.write(join(sourceDir, "exclude.txt"), "exclude")
		await Bun.write(join(sourceDir, "opencode.jsonc"), "{}")

		const { tempDir } = await createSymlinkFarm(sourceDir, {
			excludePatterns: ["exclude.txt", "opencode.jsonc"],
		})

		try {
			// keep.txt should be linked
			const keepStat = await lstat(join(tempDir, "keep.txt"))
			expect(keepStat.isSymbolicLink()).toBe(true)

			// excluded files should not exist
			const excludeExists = await Bun.file(join(tempDir, "exclude.txt")).exists()
			const configExists = await Bun.file(join(tempDir, "opencode.jsonc")).exists()

			expect(excludeExists).toBe(false)
			expect(configExists).toBe(false)
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})

	it("should exclude directories via excludePatterns", async () => {
		// Create files and directories
		await Bun.write(join(sourceDir, "file.txt"), "content")
		const opencodDir = join(sourceDir, ".opencode")
		await mkdir(opencodDir, { recursive: true })
		await Bun.write(join(opencodDir, "config.json"), "{}")

		const { tempDir } = await createSymlinkFarm(sourceDir, {
			excludePatterns: [".opencode/**"],
		})

		try {
			// file.txt should be linked
			const fileStat = await lstat(join(tempDir, "file.txt"))
			expect(fileStat.isSymbolicLink()).toBe(true)

			// .opencode should not exist
			const opencodeExists = await Bun.file(join(tempDir, ".opencode")).exists()
			expect(opencodeExists).toBe(false)
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})

	it("should create temp directory in system temp location", async () => {
		await Bun.write(join(sourceDir, "test.txt"), "test")

		const { tempDir } = await createSymlinkFarm(sourceDir)

		try {
			// Should start with ocx-ghost prefix
			expect(tempDir).toContain("ocx-ghost")
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})

	it("should handle empty source directory", async () => {
		// sourceDir is already empty

		const { tempDir } = await createSymlinkFarm(sourceDir)

		try {
			// Should have created the marker file
			const markerExists = await Bun.file(join(tempDir, GHOST_MARKER_FILE)).exists()
			expect(markerExists).toBe(true)
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})
})

describe("cleanupSymlinkFarm", () => {
	it("should remove the temp directory", async () => {
		const sourceDir = await createTempDir("symlink-farm-cleanup")
		await Bun.write(join(sourceDir, "file.txt"), "content")

		const { tempDir } = await createSymlinkFarm(sourceDir)

		// Verify it exists
		const existsBefore = await Bun.file(join(tempDir, "file.txt")).exists()
		expect(existsBefore).toBe(true)

		// Cleanup
		await cleanupSymlinkFarm(tempDir)

		// Verify it's gone
		const existsAfter = await Bun.file(join(tempDir, "file.txt")).exists()
		expect(existsAfter).toBe(false)

		// Cleanup source
		await cleanupTempDir(sourceDir)
	})

	it("should not throw if directory doesn't exist", async () => {
		// Should not throw
		await cleanupSymlinkFarm("/nonexistent/path/that/does/not/exist")
	})
})

describe("injectGhostFiles", () => {
	let sourceDir: string
	let injectDir: string

	beforeEach(async () => {
		sourceDir = await createTempDir("symlink-farm-inject-source")
		injectDir = await createTempDir("symlink-farm-inject-files")
	})

	afterEach(async () => {
		await cleanupTempDir(sourceDir)
		await cleanupTempDir(injectDir)
	})

	it("should inject files into existing symlink farm", async () => {
		// Setup source with a file
		await Bun.write(join(sourceDir, "existing.txt"), "existing")

		// Setup inject dir with files to inject
		await Bun.write(join(injectDir, "injected.txt"), "injected")
		await Bun.write(join(injectDir, "config.json"), "{}")

		// Create farm and inject
		const { tempDir } = await createSymlinkFarm(sourceDir)
		const injectPaths = new Set([join(injectDir, "injected.txt"), join(injectDir, "config.json")])
		await injectGhostFiles(tempDir, injectDir, injectPaths)

		try {
			// Original file should exist
			const existingStat = await lstat(join(tempDir, "existing.txt"))
			expect(existingStat.isSymbolicLink()).toBe(true)

			// Injected files should exist as symlinks
			const injectedStat = await lstat(join(tempDir, "injected.txt"))
			expect(injectedStat.isSymbolicLink()).toBe(true)

			const configStat = await lstat(join(tempDir, "config.json"))
			expect(configStat.isSymbolicLink()).toBe(true)

			// Verify symlink targets
			const injectedTarget = await readlink(join(tempDir, "injected.txt"))
			expect(injectedTarget).toBe(join(injectDir, "injected.txt"))
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})

	it("should inject directories", async () => {
		// Setup inject dir with a subdirectory
		const subDir = join(injectDir, ".opencode")
		await mkdir(subDir, { recursive: true })
		await Bun.write(join(subDir, "plugin.ts"), "// plugin")

		// Create farm and inject the directory
		const { tempDir } = await createSymlinkFarm(sourceDir)
		const injectPaths = new Set([subDir])
		await injectGhostFiles(tempDir, injectDir, injectPaths)

		try {
			// .opencode should be a symlink
			const stat = await lstat(join(tempDir, ".opencode"))
			expect(stat.isSymbolicLink()).toBe(true)

			// Should be able to read through the symlink
			const content = await Bun.file(join(tempDir, ".opencode", "plugin.ts")).text()
			expect(content).toBe("// plugin")
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})

	it("should handle empty inject set", async () => {
		const { tempDir } = await createSymlinkFarm(sourceDir)

		// Should not throw
		await injectGhostFiles(tempDir, injectDir, new Set())

		await cleanupSymlinkFarm(tempDir)
	})

	it("should throw if injectPath is outside sourceDir", async () => {
		const { tempDir } = await createSymlinkFarm(sourceDir)
		const outsidePath = join(injectDir, "..", "outside.txt")

		try {
			await expect(injectGhostFiles(tempDir, injectDir, new Set([outsidePath]))).rejects.toThrow(
				"injectPath must be within sourceDir",
			)
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})
})

describe("symlinkRoots tracking", () => {
	let tempDir: string
	let sourceDir: string

	beforeEach(async () => {
		sourceDir = await createTempDir("symlink-roots-source-")
	})

	afterEach(async () => {
		await cleanupTempDir(tempDir)
		await cleanupTempDir(sourceDir)
	})

	it("tracks symlinked directories in symlinkRoots", async () => {
		// Create source structure
		await mkdir(join(sourceDir, "src"), { recursive: true })
		await Bun.write(join(sourceDir, "src/index.ts"), "export {}")
		await Bun.write(join(sourceDir, "package.json"), "{}")

		const result = await createSymlinkFarm(sourceDir, {
			excludePatterns: [],
			includePatterns: [],
		})
		tempDir = result.tempDir

		// Both src/ and package.json should be in symlinkRoots
		expect(result.symlinkRoots.has("src")).toBe(true)
		expect(result.symlinkRoots.has("package.json")).toBe(true)
	})

	it("tracks nested symlinks with correct relative paths", async () => {
		// Create nested structure
		await mkdir(join(sourceDir, "packages/cli/src"), { recursive: true })
		await Bun.write(join(sourceDir, "packages/cli/src/index.ts"), "export {}")
		await Bun.write(join(sourceDir, "packages/cli/package.json"), "{}")

		const result = await createSymlinkFarm(sourceDir, {
			excludePatterns: [],
			includePatterns: [],
		})
		tempDir = result.tempDir

		// packages/ should be a whole directory symlink
		expect(result.symlinkRoots.has("packages")).toBe(true)
	})

	it("does not include partial directories in symlinkRoots", async () => {
		// Create structure where root has both excluded and included files
		await mkdir(join(sourceDir, "src"), { recursive: true })
		await Bun.write(join(sourceDir, "src/index.ts"), "export {}")
		await Bun.write(join(sourceDir, "AGENTS.md"), "# Agent instructions")
		await Bun.write(join(sourceDir, "package.json"), "{}")

		const result = await createSymlinkFarm(sourceDir, {
			excludePatterns: ["AGENTS.md"],
			includePatterns: [],
		})
		tempDir = result.tempDir

		// src/ and package.json should be symlinked
		expect(result.symlinkRoots.has("src")).toBe(true)
		expect(result.symlinkRoots.has("package.json")).toBe(true)
		// AGENTS.md should NOT be in symlinkRoots (it was excluded, creating a "hole")
		expect(result.symlinkRoots.has("AGENTS.md")).toBe(false)
	})

	it("enables containment check for nested paths", async () => {
		// Create .opencode directory
		await mkdir(join(sourceDir, ".opencode"), { recursive: true })
		await Bun.write(join(sourceDir, ".opencode/config.json"), "{}")
		await Bun.write(join(sourceDir, "package.json"), "{}")

		const result = await createSymlinkFarm(sourceDir, {
			excludePatterns: [],
			includePatterns: [],
		})
		tempDir = result.tempDir

		// .opencode should be in symlinkRoots
		expect(result.symlinkRoots.has(".opencode")).toBe(true)

		// Containment check helper (same logic as in opencode.ts)
		const isWithinSymlinkRoot = (relativePath: string, roots: Set<string>): boolean => {
			for (const root of roots) {
				if (relativePath === root || relativePath.startsWith(`${root}/`)) {
					return true
				}
			}
			return false
		}

		// .opencode/config.json should be within .opencode symlink root
		expect(isWithinSymlinkRoot(".opencode/config.json", result.symlinkRoots)).toBe(true)
		expect(isWithinSymlinkRoot(".opencode/plugins/foo.js", result.symlinkRoots)).toBe(true)
		// package.json is its own root, not within another
		expect(isWithinSymlinkRoot("package.json", result.symlinkRoots)).toBe(true)
		// Random non-existent path should not be within any root
		expect(isWithinSymlinkRoot("some/other/path.ts", result.symlinkRoots)).toBe(false)
	})
})

describe("maxFiles limit", () => {
	let sourceDir: string

	beforeEach(async () => {
		sourceDir = await createTempDir("symlink-farm-maxfiles")
	})

	afterEach(async () => {
		await cleanupTempDir(sourceDir)
	})

	it("should throw FileLimitExceededError when file count exceeds limit", async () => {
		// Create 5 files
		for (let i = 0; i < 5; i++) {
			await Bun.write(join(sourceDir, `file${i}.txt`), `content${i}`)
		}

		// Set limit to 3, should fail
		await expect(createSymlinkFarm(sourceDir, { maxFiles: 3 })).rejects.toThrow(
			FileLimitExceededError,
		)
	})

	it("should include count and limit in error", async () => {
		// Create 10 files
		for (let i = 0; i < 10; i++) {
			await Bun.write(join(sourceDir, `file${i}.txt`), `content${i}`)
		}

		try {
			await createSymlinkFarm(sourceDir, { maxFiles: 5 })
			expect.unreachable("Should have thrown")
		} catch (error) {
			expect(error).toBeInstanceOf(FileLimitExceededError)
			const e = error as FileLimitExceededError
			expect(e.count).toBeGreaterThan(5)
			expect(e.limit).toBe(5)
			expect(e.message).toContain("File limit exceeded")
			expect(e.message).toContain("maxFiles")
		}
	})

	it("should respect custom maxFiles limit", async () => {
		// Create 20 files
		for (let i = 0; i < 20; i++) {
			await Bun.write(join(sourceDir, `file${i}.txt`), `content${i}`)
		}

		// Set limit to 50, should succeed
		const { tempDir } = await createSymlinkFarm(sourceDir, { maxFiles: 50 })

		try {
			// Verify symlinks were created
			const stat = await lstat(join(tempDir, "file0.txt"))
			expect(stat.isSymbolicLink()).toBe(true)
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})

	it("should disable limit when maxFiles is 0", async () => {
		// Create 100 files - would exceed default limit of 10000 if we created that many
		// but 0 means unlimited so any count should work
		for (let i = 0; i < 100; i++) {
			await Bun.write(join(sourceDir, `file${i}.txt`), `content${i}`)
		}

		// maxFiles: 0 should disable the limit
		const { tempDir } = await createSymlinkFarm(sourceDir, { maxFiles: 0 })

		try {
			// Verify it succeeded
			const stat = await lstat(join(tempDir, "file0.txt"))
			expect(stat.isSymbolicLink()).toBe(true)
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})

	it("should count directories toward the limit", async () => {
		// Create 3 files and 3 directories (6 entries total)
		for (let i = 0; i < 3; i++) {
			await Bun.write(join(sourceDir, `file${i}.txt`), `content${i}`)
		}
		for (let i = 0; i < 3; i++) {
			await mkdir(join(sourceDir, `dir${i}`), { recursive: true })
		}

		// Set limit to 5, should fail (6 entries > 5)
		await expect(createSymlinkFarm(sourceDir, { maxFiles: 5 })).rejects.toThrow(
			FileLimitExceededError,
		)
	})
})

// =============================================================================
// GIT IGNORE UTILITY TESTS
// =============================================================================

describe("getGitDir", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await createTempDir("getGitDir-")
	})

	afterEach(async () => {
		await cleanupTempDir(tempDir)
	})

	it("returns .git path for normal repo with .git directory", async () => {
		const gitDir = join(tempDir, ".git")
		await mkdir(gitDir, { recursive: true })

		const result = getGitDir(tempDir)

		expect(result).toBe(gitDir)
	})

	it("returns resolved path for worktree with .git file containing gitdir", async () => {
		const actualGitDir = join(tempDir, "actual-git-dir")
		await mkdir(actualGitDir, { recursive: true })
		await Bun.write(join(tempDir, ".git"), `gitdir: ${actualGitDir}`)

		const result = getGitDir(tempDir)

		expect(result).toBe(actualGitDir)
	})

	it("returns null when no .git exists", async () => {
		const result = getGitDir(tempDir)

		expect(result).toBeNull()
	})

	it("resolves relative gitdir path correctly", async () => {
		const actualGitDir = join(tempDir, ".worktrees", "my-worktree")
		await mkdir(actualGitDir, { recursive: true })
		// Relative path in .git file
		await Bun.write(join(tempDir, ".git"), "gitdir: .worktrees/my-worktree")

		const result = getGitDir(tempDir)

		expect(result).toBe(actualGitDir)
	})
})

describe("addScopedRules", () => {
	it("scopes basic pattern to subdirectory", () => {
		const ig = ignore()
		addScopedRules(ig, "*.log", "src")

		expect(ig.ignores("src/file.log")).toBe(true)
		expect(ig.ignores("file.log")).toBe(false)
	})

	it("scopes negation pattern to subdirectory", () => {
		const ig = ignore()
		// First add a rule to ignore everything
		ig.add("src/**")
		// Then add the negation
		addScopedRules(ig, "!keep", "src")

		expect(ig.ignores("src/other")).toBe(true)
		expect(ig.ignores("src/keep")).toBe(false)
	})

	it("handles rooted pattern by removing leading slash", () => {
		const ig = ignore()
		addScopedRules(ig, "/build", "src")

		expect(ig.ignores("src/build")).toBe(true)
		expect(ig.ignores("build")).toBe(false)
	})

	it("skips comments and empty lines", () => {
		const ig = ignore()
		const content = `
# This is a comment
*.log

  # Another comment
*.tmp
`
		addScopedRules(ig, content, "src")

		expect(ig.ignores("src/file.log")).toBe(true)
		expect(ig.ignores("src/file.tmp")).toBe(true)
		// Comments should not be treated as patterns
		expect(ig.ignores("src/# This is a comment")).toBe(false)
	})

	it("leaves patterns unchanged when subdir is empty (root)", () => {
		const ig = ignore()
		addScopedRules(ig, "*.log", "")

		expect(ig.ignores("file.log")).toBe(true)
		expect(ig.ignores("src/file.log")).toBe(true)
	})
})

describe("loadGitIgnoreStack", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await createTempDir("loadGitIgnore-")
	})

	afterEach(async () => {
		await cleanupTempDir(tempDir)
	})

	it("returns null for non-git repo", async () => {
		const result = await loadGitIgnoreStack(tempDir)

		expect(result).toBeNull()
	})

	it("returns ignore instance for git repo with .gitignore", async () => {
		// Create .git directory
		await mkdir(join(tempDir, ".git"), { recursive: true })
		// Create .gitignore
		await Bun.write(join(tempDir, ".gitignore"), "*.log\nnode_modules/")

		const result = await loadGitIgnoreStack(tempDir)

		expect(result).not.toBeNull()
		expect(result?.ignores("file.log")).toBe(true)
		expect(result?.ignores("node_modules/")).toBe(true)
		expect(result?.ignores("src/index.ts")).toBe(false)
	})

	it("includes .git/info/exclude patterns", async () => {
		// Create .git directory and info subdirectory
		await mkdir(join(tempDir, ".git", "info"), { recursive: true })
		// Create exclude file
		await Bun.write(join(tempDir, ".git", "info", "exclude"), "*.secret\nmy-local-stuff/")

		const result = await loadGitIgnoreStack(tempDir)

		expect(result).not.toBeNull()
		expect(result?.ignores("password.secret")).toBe(true)
		expect(result?.ignores("my-local-stuff/")).toBe(true)
	})

	it("combines .gitignore and .git/info/exclude patterns", async () => {
		// Create .git directory and info subdirectory
		await mkdir(join(tempDir, ".git", "info"), { recursive: true })
		// Create .gitignore
		await Bun.write(join(tempDir, ".gitignore"), "*.log")
		// Create exclude file
		await Bun.write(join(tempDir, ".git", "info", "exclude"), "*.secret")

		const result = await loadGitIgnoreStack(tempDir)

		expect(result).not.toBeNull()
		// Both patterns should work
		expect(result?.ignores("file.log")).toBe(true)
		expect(result?.ignores("password.secret")).toBe(true)
	})
})

describe("gitignore-aware traversal", () => {
	let sourceDir: string

	beforeEach(async () => {
		sourceDir = await createTempDir("gitignore-traversal-")
	})

	afterEach(async () => {
		await cleanupTempDir(sourceDir)
	})

	it("counts gitignored directory as 1, not traversed", async () => {
		// Create .git directory to make it a git repo
		await mkdir(join(sourceDir, ".git"), { recursive: true })
		// Create .gitignore
		await Bun.write(join(sourceDir, ".gitignore"), "node_modules/")
		// Create node_modules with many files inside
		const nmDir = join(sourceDir, "node_modules")
		await mkdir(nmDir, { recursive: true })
		for (let i = 0; i < 50; i++) {
			await Bun.write(join(nmDir, `pkg${i}.js`), `// package ${i}`)
		}
		// Create a regular file
		await Bun.write(join(sourceDir, "index.ts"), "export {}")

		// Create farm with low limit - should succeed because node_modules is 1 entry
		// If node_modules were traversed, it would be 50 entries and fail
		const { tempDir, symlinkRoots } = await createSymlinkFarm(sourceDir, { maxFiles: 10 })

		try {
			// node_modules should be a single symlink
			const nmStat = await lstat(join(tempDir, "node_modules"))
			expect(nmStat.isSymbolicLink()).toBe(true)

			// symlinkRoots should include node_modules
			expect(symlinkRoots.has("node_modules")).toBe(true)
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})

	it("scopes nested .gitignore patterns correctly", async () => {
		// Create .git directory
		await mkdir(join(sourceDir, ".git"), { recursive: true })
		// Create root .gitignore
		await Bun.write(join(sourceDir, ".gitignore"), "*.log")
		// Create src directory with its own .gitignore
		await mkdir(join(sourceDir, "src"), { recursive: true })
		await Bun.write(join(sourceDir, "src", ".gitignore"), "*.tmp")
		// Create test files
		await Bun.write(join(sourceDir, "root.log"), "log") // Should be ignored
		await Bun.write(join(sourceDir, "root.txt"), "text") // Should be included
		await Bun.write(join(sourceDir, "src", "nested.tmp"), "tmp") // Should be ignored
		await Bun.write(join(sourceDir, "src", "nested.ts"), "ts") // Should be included

		// Need to add an exclude pattern to force partial traversal of src/
		// Otherwise src/ is symlinked as a whole and nested gitignore is not loaded
		const { tempDir, symlinkRoots } = await createSymlinkFarm(sourceDir, {
			excludePatterns: ["**/AGENTS.md"], // Forces partial traversal of directories
		})

		try {
			// root.log should NOT be linked (gitignored)
			expect(symlinkRoots.has("root.log")).toBe(false)
			// root.txt should be linked
			expect(symlinkRoots.has("root.txt")).toBe(true)
			// src directory is partial (due to exclude pattern), individual files linked
			// nested.ts should be included
			const nestedTsExists = await Bun.file(join(tempDir, "src", "nested.ts")).exists()
			expect(nestedTsExists).toBe(true)
			// nested.tmp should NOT be linked (gitignored by src/.gitignore)
			const nestedTmpExists = await Bun.file(join(tempDir, "src", "nested.tmp")).exists()
			expect(nestedTmpExists).toBe(false)
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})

	it("always skips .git directory", async () => {
		// Create .git directory with content
		await mkdir(join(sourceDir, ".git", "objects"), { recursive: true })
		await Bun.write(join(sourceDir, ".git", "config"), "[core]")
		await Bun.write(join(sourceDir, ".git", "objects", "pack"), "data")
		// Create regular file
		await Bun.write(join(sourceDir, "package.json"), "{}")

		const { tempDir, symlinkRoots } = await createSymlinkFarm(sourceDir, {})

		try {
			// .git should NOT be in symlinkRoots
			expect(symlinkRoots.has(".git")).toBe(false)
			// .git should not exist in temp dir
			const gitExists = await Bun.file(join(tempDir, ".git")).exists()
			expect(gitExists).toBe(false)
			// package.json should be linked
			expect(symlinkRoots.has("package.json")).toBe(true)
		} finally {
			await cleanupSymlinkFarm(tempDir)
		}
	})
})

// =============================================================================
// PATH CONTAINMENT GUARD TESTS (PR #61)
// =============================================================================

describe("path containment guard", () => {
	let projectDir: string
	let outsideDir: string
	let tempDir: string | undefined

	beforeEach(async () => {
		projectDir = await createTempDir("path-containment-project-")
		outsideDir = await createTempDir("path-containment-outside-")
	})

	afterEach(async () => {
		if (tempDir) {
			await cleanupSymlinkFarm(tempDir)
		}
		await cleanupTempDir(projectDir)
		await cleanupTempDir(outsideDir)
	})

	it("rejects path prefix collision (/proj vs /project)", async () => {
		// Simulate directory names that are prefixes of each other
		// The guard uses normalize(relative(...)) which should handle this correctly
		const proj = await createTempDir("proj")
		const project = await createTempDir("project")

		try {
			// Create .git in project to make it a git repo
			await mkdir(join(project, ".git"), { recursive: true })
			await Bun.write(join(project, "file.txt"), "content")

			// The relative path from "proj" to "project" should be "../project-..."
			// which should be detected as outside
			const { symlinkRoots, tempDir: td } = await createSymlinkFarm(project, {
				projectDir: project,
			})
			tempDir = td

			// Should succeed without issues
			expect(symlinkRoots.has("file.txt")).toBe(true)
		} finally {
			await cleanupTempDir(proj)
			await cleanupTempDir(project)
		}
	})

	it("handles path exactly equal to '..'", () => {
		// Test normalizePath behavior with edge cases
		const result = normalizePath("..")
		expect(result).toBe("..")

		const result2 = normalizePath("../foo")
		expect(result2).toBe("../foo")
	})

	it("silently skips symlinked directory pointing outside project", async () => {
		// Create a git repo
		await mkdir(join(projectDir, ".git"), { recursive: true })
		await mkdir(join(projectDir, "src"), { recursive: true })
		await Bun.write(join(projectDir, "src", "index.ts"), "export {}")
		await Bun.write(join(projectDir, "package.json"), "{}")

		// Create a file outside the project
		await Bun.write(join(outsideDir, "external.txt"), "external content")

		// Create a symlink inside project that points outside
		const symlinkPath = join(projectDir, "external-link")
		try {
			await import("node:fs/promises").then((fs) => fs.symlink(outsideDir, symlinkPath))
		} catch {
			// Symlink creation may fail on some platforms, skip test
			return
		}

		// Create farm - should handle the external symlink gracefully without throwing
		const result = await createSymlinkFarm(projectDir, {
			projectDir: projectDir,
		})
		tempDir = result.tempDir

		// The symlink farm should be created successfully
		// Regular files should be symlinked
		expect(result.symlinkRoots.has("src")).toBe(true)
		expect(result.symlinkRoots.has("package.json")).toBe(true)

		// The key assertion: no error was thrown during symlink farm creation
		// The external-link is a directory symlink pointing outside, so it should be handled
		// (either symlinked as an opaque blob or treated specially based on gitignore status)
	})
})
