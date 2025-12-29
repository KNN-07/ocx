#!/usr/bin/env node
/**
 * AgentCN CLI
 * ShadCN-style registry for AI coding agents
 */

import { program } from "commander"
import { add } from "./commands/add"
import { diff } from "./commands/diff"
import { init } from "./commands/init"
import { link } from "./commands/link"
import { list } from "./commands/list"
import { search } from "./commands/search"

program.name("agentcn").description("ShadCN-style registry for AI coding agents").version("0.1.0")

program
	.command("init")
	.description("Initialize AgentCN in your project")
	.option("-y, --yes", "Skip prompts and use defaults")
	.option("-r, --registry <url>", "Custom registry URL")
	.action(init)

program
	.command("add")
	.description("Add a package from the registry")
	.argument("<packages...>", "Package names to add")
	.option("-y, --yes", "Skip confirmation prompts")
	.option("-o, --overwrite", "Overwrite existing files")
	.option("-r, --registry <url>", "Custom registry URL")
	.action(add)

program
	.command("diff")
	.description("Show differences between local and registry versions")
	.argument("[packages...]", "Package names to diff (all if omitted)")
	.action(diff)

program
	.command("list")
	.description("List installed packages")
	.option("-a, --all", "Show all available packages from registry")
	.action(list)

program
	.command("search")
	.description("Search the registry")
	.argument("<query>", "Search query")
	.action(search)

program
	.command("link")
	.description("Recreate symlinks from runtime dirs to .agentcn/")
	.option("-f, --force", "Overwrite existing symlinks")
	.action(link)

program.parse()
