/**
 * Init command - Initialize AgentCN in a project
 * Creates .agentcn/ universal home and sets up runtime symlinks
 */

import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Config, Manifest, Runtime } from "@agentcn/shared"
import {
	AGENTCN_DIR,
	CONFIG_FILE_NAME,
	DEFAULT_REGISTRY_URL,
	MANIFEST_FILE_NAME,
	RUNTIME_DIRS,
	RUNTIMES,
} from "@agentcn/shared"
import chalk from "chalk"
import ora from "ora"
import prompts from "prompts"
import { getConfigPath, getProjectRoot, isInitialized } from "../utils/config"

interface InitOptions {
	yes?: boolean
	registry?: string
	target?: Runtime
}

/** Auto-detect which runtimes are present in the project */
function detectRuntimes(): Runtime[] {
	const projectRoot = getProjectRoot()
	const detected: Runtime[] = []

	for (const [runtime, dir] of Object.entries(RUNTIME_DIRS)) {
		if (existsSync(join(projectRoot, dir))) {
			detected.push(runtime as Runtime)
		}
	}

	return detected
}

/** Create the root AGENTS.md index file */
function createRootAgentsMd(): string {
	return `# AgentCN Packages

This project uses [AgentCN](https://agentcn.dev) packages.

## Installed Packages

_No packages installed yet. Run \`npx agentcn add <package>\` to add packages._

## Package Instructions

Each installed package has its own AGENTS.md with detailed instructions:

\`\`\`
.agentcn/
├── <package-name>/
│   ├── AGENTS.md      ← Package-specific instructions
│   └── ...            ← Package files
\`\`\`

## Universal Home

The \`.agentcn/\` directory is the universal home for all AgentCN packages.
Runtime-specific directories (e.g., \`.opencode/\`) contain symlinks pointing here.

This means:
- Edit files in \`.agentcn/\` → changes reflect in all runtimes
- Updates via \`agentcn update\` only touch \`.agentcn/\`
- Your customizations are preserved
`
}

export async function init(options: InitOptions): Promise<void> {
	const spinner = ora()
	const projectRoot = getProjectRoot()

	// Check if already initialized
	if (isInitialized()) {
		console.log(chalk.yellow("AgentCN is already initialized in this project."))
		console.log(chalk.dim(`Config file: ${getConfigPath()}`))
		return
	}

	console.log(chalk.bold("\n🚀 Initialize AgentCN\n"))

	// Detect existing runtimes
	const detectedRuntimes = detectRuntimes()
	if (detectedRuntimes.length > 0) {
		console.log(chalk.dim("Detected runtimes: ") + detectedRuntimes.join(", "))
	}

	let config: Config
	let selectedRuntime: Runtime

	if (options.yes) {
		// Use defaults
		selectedRuntime = options.target ?? detectedRuntimes[0] ?? "opencode"
		config = {
			$schema: "https://agentcn.dev/schema/config.json",
			registry: options.registry ?? DEFAULT_REGISTRY_URL,
			runtime: selectedRuntime,
			packages: {},
		}
	} else {
		// Interactive prompts
		const runtimeChoices = RUNTIMES.map((r) => ({
			title: r + (detectedRuntimes.includes(r) ? chalk.dim(" (detected)") : ""),
			value: r,
		}))

		// Pre-select detected runtime
		const initialRuntime = detectedRuntimes[0] ? RUNTIMES.indexOf(detectedRuntimes[0]) : 0

		const response = await prompts([
			{
				type: "select",
				name: "runtime",
				message: "Which runtime are you using?",
				choices: runtimeChoices,
				initial: initialRuntime >= 0 ? initialRuntime : 0,
			},
			{
				type: "text",
				name: "registry",
				message: "Registry URL",
				initial: options.registry ?? DEFAULT_REGISTRY_URL,
			},
		])

		if (!response.runtime) {
			console.log(chalk.dim("\nInit cancelled."))
			return
		}

		selectedRuntime = response.runtime
		config = {
			$schema: "https://agentcn.dev/schema/config.json",
			registry: response.registry,
			runtime: selectedRuntime,
			packages: {},
		}
	}

	spinner.start("Creating AgentCN directories...")

	try {
		// Create .agentcn/ universal home
		const agentcnDir = join(projectRoot, AGENTCN_DIR)
		if (!existsSync(agentcnDir)) {
			await mkdir(agentcnDir, { recursive: true })
		}

		// Create runtime directory if it doesn't exist
		const runtimeDir = RUNTIME_DIRS[selectedRuntime]
		if (runtimeDir) {
			const runtimePath = join(projectRoot, runtimeDir)
			if (!existsSync(runtimePath)) {
				await mkdir(runtimePath, { recursive: true })
			}
		}

		spinner.succeed(chalk.green("Created directories"))

		// Write config file
		spinner.start("Creating config file...")
		const configPath = join(agentcnDir, CONFIG_FILE_NAME)
		await writeFile(configPath, JSON.stringify(config, null, "\t"), "utf-8")
		spinner.succeed(chalk.green(`Created ${AGENTCN_DIR}/${CONFIG_FILE_NAME}`))

		// Write manifest file
		spinner.start("Creating manifest...")
		const manifest: Manifest = {
			version: "1.0.0",
			installedAt: new Date().toISOString(),
			packages: {},
		}
		const manifestPath = join(agentcnDir, MANIFEST_FILE_NAME)
		await writeFile(manifestPath, JSON.stringify(manifest, null, "\t"), "utf-8")
		spinner.succeed(chalk.green(`Created ${AGENTCN_DIR}/${MANIFEST_FILE_NAME}`))

		// Write root AGENTS.md
		spinner.start("Creating AGENTS.md...")
		const agentsMdPath = join(agentcnDir, "AGENTS.md")
		await writeFile(agentsMdPath, createRootAgentsMd(), "utf-8")
		spinner.succeed(chalk.green(`Created ${AGENTCN_DIR}/AGENTS.md`))

		console.log("\n" + chalk.bold("✓ AgentCN initialized!"))
		console.log()
		console.log(chalk.dim("Created:"))
		console.log(chalk.dim(`  ${AGENTCN_DIR}/`))
		console.log(chalk.dim(`  ├── ${CONFIG_FILE_NAME}`))
		console.log(chalk.dim(`  ├── ${MANIFEST_FILE_NAME}`))
		console.log(chalk.dim(`  └── AGENTS.md`))
		console.log()
		console.log(chalk.bold("Next steps:"))
		console.log(chalk.dim("  1. Add packages:") + " npx agentcn add workspace")
		console.log(chalk.dim("  2. Browse registry:") + " npx agentcn search agent")
		console.log()
	} catch (error) {
		spinner.fail(chalk.red("Failed to initialize"))
		console.error(error)
		process.exit(1)
	}
}
