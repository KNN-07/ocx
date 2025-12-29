/**
 * File utilities for writing packages to disk
 * Implements universal .agentcn/ home with symlinks to runtime dirs
 */

import { createHash } from "node:crypto"
import { existsSync, lstatSync } from "node:fs"
import { mkdir, readFile, readlink, symlink, unlink, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import type { Manifest, RegistryFile, RegistryItem, Runtime } from "@agentcn/shared"
import { AGENTCN_DIR, RUNTIME_DIRS } from "@agentcn/shared"
import { getProjectRoot, readManifest, writeManifest } from "./config"

/** Calculate SHA-256 hash of content */
export function hashContent(content: string): string {
	return createHash("sha256").update(content).digest("hex").slice(0, 16)
}

/** Check if a file exists and get its content hash */
export async function getFileHash(filePath: string): Promise<string | null> {
	if (!existsSync(filePath)) return null
	const content = await readFile(filePath, "utf-8")
	return hashContent(content)
}

/** Check if local file differs from manifest (user modified) */
export async function isFileModified(
	filePath: string,
	manifest: Manifest,
	packageName: string,
): Promise<boolean> {
	const pkg = manifest.packages[packageName]
	if (!pkg) return false

	const fileEntry = pkg.files[filePath]
	if (!fileEntry) return false

	const currentHash = await getFileHash(join(getProjectRoot(), filePath))
	return currentHash !== null && currentHash !== fileEntry.hash
}

/** Check if a path is a valid symlink pointing to expected target */
export async function isSymlinkValid(linkPath: string, expectedTarget: string): Promise<boolean> {
	try {
		if (!existsSync(linkPath)) return false
		const stat = lstatSync(linkPath)
		if (!stat.isSymbolicLink()) return false
		const actualTarget = await readlink(linkPath)
		return (
			actualTarget === expectedTarget ||
			actualTarget === relative(dirname(linkPath), expectedTarget)
		)
	} catch {
		return false
	}
}

/** Create a symlink with cross-platform support (junction fallback on Windows) */
export async function createSymlink(target: string, linkPath: string): Promise<void> {
	// Ensure parent directory exists
	await mkdir(dirname(linkPath), { recursive: true })

	// Remove existing file/symlink if present
	if (existsSync(linkPath)) {
		await unlink(linkPath)
	}

	// Calculate relative path from link location to target
	const relativeTarget = relative(dirname(linkPath), target)

	// Create symlink (Node.js handles junction fallback on Windows for directories)
	const isDir = existsSync(target) && lstatSync(target).isDirectory()
	await symlink(relativeTarget, linkPath, isDir ? "junction" : "file")
}

/** Get the runtime-specific target path for a file */
export function getRuntimeTargetPath(
	file: RegistryFile,
	runtime: Runtime,
	packageName: string,
): string | null {
	const runtimeDir = RUNTIME_DIRS[runtime]
	if (!runtimeDir) return null

	// Map file types to runtime-specific paths
	const typePathMap: Record<string, string> = {
		agent: `${runtimeDir}/agent/@agentcn`,
		plugin: `${runtimeDir}/plugin/@agentcn`,
		skill: `${runtimeDir}/skill/@agentcn`,
		command: `${runtimeDir}/command/@agentcn`,
	}

	const fileType = file.type ?? "other"
	const basePath = typePathMap[fileType]

	if (!basePath) return null

	// Extract filename from the source path
	const fileName = file.path.split("/").pop()
	if (!fileName) return null

	// For skills, preserve subdirectory structure
	if (fileType === "skill") {
		const skillPath = file.path.replace(/^skills\//, "")
		return `${basePath}/${skillPath}`
	}

	return `${basePath}/${fileName}`
}

/** Write a file to the .agentcn/ universal home */
export async function writeToAgentcnHome(
	file: RegistryFile,
	packageName: string,
	options: { overwrite?: boolean } = {},
): Promise<{ written: boolean; skipped: boolean; reason?: string; sourcePath: string }> {
	const projectRoot = getProjectRoot()
	const sourcePath = join(AGENTCN_DIR, packageName, file.path)
	const targetPath = join(projectRoot, sourcePath)

	// Check if file exists
	if (existsSync(targetPath) && !options.overwrite) {
		const existingContent = await readFile(targetPath, "utf-8")
		const existingHash = hashContent(existingContent)
		const newHash = hashContent(file.content ?? "")

		// Skip if identical
		if (existingHash === newHash) {
			return { written: false, skipped: true, reason: "identical", sourcePath }
		}

		// File differs, skip without overwrite flag
		return { written: false, skipped: true, reason: "exists", sourcePath }
	}

	// Ensure directory exists
	await mkdir(dirname(targetPath), { recursive: true })

	// Write file
	await writeFile(targetPath, file.content ?? "", "utf-8")
	return { written: true, skipped: false, sourcePath }
}

/** Create symlinks from runtime dir to .agentcn/ source */
export async function createPackageSymlinks(
	pkg: RegistryItem,
	runtime: Runtime,
): Promise<{ created: string[]; skipped: string[]; errors: string[] }> {
	const projectRoot = getProjectRoot()
	const created: string[] = []
	const skipped: string[] = []
	const errors: string[] = []

	for (const file of pkg.files) {
		const runtimeTarget = getRuntimeTargetPath(file, runtime, pkg.name)
		if (!runtimeTarget) {
			skipped.push(`${file.path} (no runtime mapping)`)
			continue
		}

		const sourcePath = join(projectRoot, AGENTCN_DIR, pkg.name, file.path)
		const linkPath = join(projectRoot, runtimeTarget)

		try {
			// Check if source exists
			if (!existsSync(sourcePath)) {
				errors.push(`${file.path}: source file missing`)
				continue
			}

			// Create symlink
			await createSymlink(sourcePath, linkPath)
			created.push(runtimeTarget)
		} catch (error) {
			errors.push(`${runtimeTarget}: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	return { created, skipped, errors }
}

/** Write all files for a package to .agentcn/ and create symlinks */
export async function writePackageFiles(
	pkg: RegistryItem,
	runtime: Runtime,
	options: { overwrite?: boolean } = {},
): Promise<{
	written: string[]
	symlinked: string[]
	skipped: string[]
	errors: string[]
}> {
	const written: string[] = []
	const symlinked: string[] = []
	const skipped: string[] = []
	const errors: string[] = []

	// Get or create manifest
	let manifest = await readManifest()
	if (!manifest) {
		manifest = {
			version: "1.0.0",
			installedAt: new Date().toISOString(),
			packages: {},
		}
	}

	// Initialize package entry in manifest
	manifest.packages[pkg.name] = {
		version: pkg.version ?? "0.0.0",
		installedAt: new Date().toISOString(),
		files: {},
	}

	// Step 1: Write files to .agentcn/<package>/
	for (const file of pkg.files) {
		try {
			const result = await writeToAgentcnHome(file, pkg.name, options)

			if (result.written) {
				written.push(result.sourcePath)
				// Update manifest with file hash
				manifest.packages[pkg.name].files[result.sourcePath] = {
					hash: hashContent(file.content ?? ""),
					modified: false,
				}
			} else if (result.skipped) {
				skipped.push(`${result.sourcePath} (${result.reason})`)
			}
		} catch (error) {
			errors.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	// Step 2: Create symlinks to runtime dir
	const symlinkResult = await createPackageSymlinks(pkg, runtime)
	symlinked.push(...symlinkResult.created)
	skipped.push(...symlinkResult.skipped)
	errors.push(...symlinkResult.errors)

	// Save manifest
	await writeManifest(manifest)

	return { written, symlinked, skipped, errors }
}

/** Regenerate all symlinks for installed packages */
export async function regenerateSymlinks(runtime: Runtime): Promise<{
	created: string[]
	errors: string[]
}> {
	const manifest = await readManifest()
	if (!manifest) {
		return { created: [], errors: ["No manifest found"] }
	}

	const created: string[] = []
	const errors: string[] = []

	// This would need the full package data to regenerate
	// For now, we just return an error indicating manual intervention needed
	errors.push("Symlink regeneration requires package data from registry")

	return { created, errors }
}

/** Get the package directory path */
export function getPackageDir(packageName: string): string {
	return join(getProjectRoot(), AGENTCN_DIR, packageName)
}

/** Create symlinks for a package by name (for link command) */
export async function createSymlinksForPackage(
	packageName: string,
	runtime: Runtime,
	options: { force?: boolean } = {},
): Promise<{ created: string[]; skipped: string[]; errors: string[] }> {
	const projectRoot = getProjectRoot()
	const packageDir = getPackageDir(packageName)
	const created: string[] = []
	const skipped: string[] = []
	const errors: string[] = []

	// Read manifest to get file mappings
	const manifest = await readManifest()
	if (!manifest?.packages[packageName]) {
		errors.push("Package not found in manifest")
		return { created, skipped, errors }
	}

	const pkgManifest = manifest.packages[packageName]
	const runtimeDir = RUNTIME_DIRS[runtime]

	// For each file in manifest, recreate symlinks
	for (const [sourcePath, _fileInfo] of Object.entries(pkgManifest.files)) {
		// Determine file type from path
		let fileType: string = "other"
		if (sourcePath.includes("/agents/") || sourcePath.includes("/agent/")) fileType = "agent"
		else if (sourcePath.includes("/plugin/")) fileType = "plugin"
		else if (sourcePath.includes("/skills/") || sourcePath.includes("/skill/")) fileType = "skill"
		else if (sourcePath.includes("/commands/") || sourcePath.includes("/command/"))
			fileType = "command"

		// Map to runtime target
		const typePathMap: Record<string, string> = {
			agent: `${runtimeDir}/agent/@agentcn`,
			plugin: `${runtimeDir}/plugin/@agentcn`,
			skill: `${runtimeDir}/skill/@agentcn`,
			command: `${runtimeDir}/command/@agentcn`,
		}

		const basePath = typePathMap[fileType]
		if (!basePath) {
			skipped.push(`${sourcePath} (no runtime mapping)`)
			continue
		}

		// Extract relative path after package dir
		const relativePath = sourcePath.replace(new RegExp(`^${AGENTCN_DIR}/${packageName}/`), "")
		const fileName = relativePath.split("/").pop()
		if (!fileName) continue

		// Build target path
		let targetPath: string
		if (fileType === "skill") {
			const skillPath = relativePath.replace(/^skills\//, "")
			targetPath = `${basePath}/${skillPath}`
		} else {
			targetPath = `${basePath}/${fileName}`
		}

		const fullSourcePath = join(projectRoot, sourcePath)
		const linkPath = join(projectRoot, targetPath)

		try {
			// Check if source exists
			if (!existsSync(fullSourcePath)) {
				errors.push(`${sourcePath}: source file missing`)
				continue
			}

			// Check if symlink already exists and is valid
			if (!options.force && (await isSymlinkValid(linkPath, fullSourcePath))) {
				skipped.push(targetPath)
				continue
			}

			// Create symlink
			await createSymlink(fullSourcePath, linkPath)
			created.push(targetPath)
		} catch (error) {
			errors.push(`${targetPath}: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	return { created, skipped, errors }
}

/** Update opencode.jsonc to add plugin path */
export async function updateOpencodeConfig(pluginPath: string): Promise<boolean> {
	const configPath = join(getProjectRoot(), "opencode.jsonc")
	const configPathJson = join(getProjectRoot(), "opencode.json")

	const actualPath = existsSync(configPath)
		? configPath
		: existsSync(configPathJson)
			? configPathJson
			: null

	if (!actualPath) {
		// Create new opencode.jsonc
		const newConfig = {
			plugin: [pluginPath],
		}
		await writeFile(configPath, JSON.stringify(newConfig, null, "\t"), "utf-8")
		return true
	}

	// Read and update existing config
	const content = await readFile(actualPath, "utf-8")

	// Simple JSONC parsing (strip comments)
	const jsonContent = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")

	try {
		const config = JSON.parse(jsonContent)

		// Add plugin if not already present
		if (!config.plugin) {
			config.plugin = []
		}

		if (!config.plugin.includes(pluginPath)) {
			config.plugin.push(pluginPath)
			await writeFile(actualPath, JSON.stringify(config, null, "\t"), "utf-8")
			return true
		}
	} catch {
		// If parsing fails, append plugin array
		const updatedContent = content.replace(/\{/, `{\n\t"plugin": ["${pluginPath}"],`)
		await writeFile(actualPath, updatedContent, "utf-8")
		return true
	}

	return false
}
