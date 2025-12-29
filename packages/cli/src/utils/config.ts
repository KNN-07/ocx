/**
 * Configuration utilities for AgentCN CLI
 */

import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Config, Manifest } from "@agentcn/shared"
import {
	CONFIG_FILE_NAME,
	configSchema,
	DEFAULT_REGISTRY_URL,
	MANIFEST_FILE_NAME,
	manifestSchema,
} from "@agentcn/shared"

/** Get the project root (where agentcn.json should be) */
export function getProjectRoot(): string {
	return process.cwd()
}

/** Get path to .agentcn/agentcn.json */
export function getConfigPath(): string {
	return join(getProjectRoot(), ".agentcn", CONFIG_FILE_NAME)
}

/** Get path to .agentcn/agentcn.lock manifest */
export function getManifestPath(): string {
	return join(getProjectRoot(), ".agentcn", MANIFEST_FILE_NAME)
}

/** Check if AgentCN is initialized */
export function isInitialized(): boolean {
	return existsSync(getConfigPath())
}

/** Read agentcn.json config */
export async function readConfig(): Promise<Config | null> {
	const configPath = getConfigPath()
	if (!existsSync(configPath)) return null

	const content = await readFile(configPath, "utf-8")
	const parsed = JSON.parse(content)
	return configSchema.parse(parsed)
}

/** Write agentcn.json config */
export async function writeConfig(config: Config): Promise<void> {
	const configPath = getConfigPath()
	await writeFile(configPath, JSON.stringify(config, null, "\t"), "utf-8")
}

/** Read manifest file */
export async function readManifest(): Promise<Manifest | null> {
	const manifestPath = getManifestPath()
	if (!existsSync(manifestPath)) return null

	const content = await readFile(manifestPath, "utf-8")
	const parsed = JSON.parse(content)
	return manifestSchema.parse(parsed)
}

/** Write manifest file */
export async function writeManifest(manifest: Manifest): Promise<void> {
	const manifestPath = getManifestPath()
	await writeFile(manifestPath, JSON.stringify(manifest, null, "\t"), "utf-8")
}

/** Get registry URL from config or default */
export async function getRegistryUrl(): Promise<string> {
	const config = await readConfig()
	return config?.registry ?? DEFAULT_REGISTRY_URL
}

/** Create default config */
export function createDefaultConfig(): Config {
	return {
		$schema: "https://agentcn.dev/schema/config.json",
		registry: DEFAULT_REGISTRY_URL,
		runtime: "opencode",
		packages: {},
	}
}

/** Create default manifest */
export function createDefaultManifest(): Manifest {
	return {
		version: "1.0.0",
		installedAt: new Date().toISOString(),
		packages: {},
	}
}
