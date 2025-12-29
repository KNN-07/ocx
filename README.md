# AgentCN

> ShadCN-style registry for AI coding agents. Copy. Paste. Own.

AgentCN is a registry and CLI for scaffolding AI coding agent configurations into your project. Like ShadCN for UI components, you **own the code** - it's copied into your repo, fully customizable, and version-controlled with your project.

## Quick Start

```bash
# Initialize AgentCN in your project
npx agentcn init

# Add the workspace package (agents, plugin, skills)
npx agentcn add workspace
```

That's it! Your project now has:
- **4 specialized agents** (plan, build, librarian, writer)
- **Session workspace plugin** with research persistence
- **Protocol skills** for plan and research management
- **`/plan` command** for viewing current plans

## Why AgentCN?

### The Problem
AI coding tools (OpenCode, Cursor, Claude Code) lack a standard way to share and reuse agent configurations, prompts, and tools.

### The Solution
AgentCN provides:
- **Registry of packages** - agents, plugins, skills, prompts
- **Copy-paste ownership** - scaffold into your project, customize freely
- **Version tracking** - see what changed upstream with `agentcn diff`
- **Multi-runtime support** - OpenCode today, Cursor/Claude Code tomorrow

## Installation

### From npm (recommended)
```bash
npx agentcn init
```

### From source
```bash
git clone https://github.com/kdcokenny/agentcn
cd agentcn
bun install
bun run build
```

## CLI Commands

### `agentcn init`
Initialize AgentCN in your project. Creates `agentcn.json` config and detects your runtime.

```bash
npx agentcn init
```

### `agentcn add <package>`
Add a package to your project. Files are copied to `.agentcn/<package>/` with symlinks to your runtime directory.

```bash
npx agentcn add workspace
npx agentcn add workspace --overwrite  # Overwrite existing files
```

### `agentcn link`
Recreate symlinks from runtime directories to `.agentcn/`. Useful after `git clone` or if symlinks break.

```bash
npx agentcn link
npx agentcn link workspace  # Link specific package only
```

### `agentcn diff <package>`
Show differences between your local files and the registry.

```bash
npx agentcn diff workspace
```

### `agentcn list`
List installed packages and their status.

```bash
npx agentcn list
```

### `agentcn search <query>`
Search the registry for packages.

```bash
npx agentcn search agent
```

## Project Structure

After running `agentcn add workspace`, your project will have:

```
.agentcn/                        # Universal home (source of truth)
├── AGENTS.md                   # Index pointing to package docs
├── agentcn.lock                # Manifest tracking installed packages
└── workspace/                  # Package source files
    ├── AGENTS.md               # Package-specific instructions
    ├── agents/
    │   ├── plan.md
    │   ├── build.md
    │   ├── librarian.md
    │   └── writer.md
    ├── plugin/
    │   └── index.ts
    ├── skills/
    │   ├── plan-protocol/
    │   └── research-protocol/
    └── commands/
        └── plan.md

.opencode/                       # Runtime-specific (symlinks)
├── agent/@agentcn/ → .agentcn/workspace/agents/
├── plugin/@agentcn/ → .agentcn/workspace/plugin/
├── skill/@agentcn/ → .agentcn/workspace/skills/
└── command/@agentcn/ → .agentcn/workspace/commands/
```

**Why this structure?**
- `.agentcn/` is **universal** - works with any AI coding tool
- `.opencode/` contains **symlinks** to the universal source
- Future: `.cursor/`, `.claude/` can also symlink to `.agentcn/`
- The `@agentcn/` prefix provides clear visual separation from your own agents

## Configuration

### `agentcn.json`
Created in your project root during `init`:

```json
{
  "$schema": "https://agentcn.dev/schema/config.json",
  "registry": "https://agentcn.dev/r",
  "runtime": "opencode"
}
```

### Customizing Agents
Since you own the code, just edit the files in `.agentcn/` directly (the symlinks will reflect your changes):

```markdown
<!-- .agentcn/workspace/agents/build.md -->
---
model: google/gemini-2.5-pro  # Change the model
tools:
  - plan_read
  - research_read
---

Your custom instructions here...
```

## Available Packages

### workspace
The flagship package. Provides a complete agent team with session-scoped workspace:

| Agent | Purpose | Default Model |
|-------|---------|---------------|
| `@agentcn/plan` | Architecture & planning | claude-sonnet-4-20250514 |
| `@agentcn/build` | Implementation & coding | gemini-2.5-flash |
| `@agentcn/librarian` | Research & documentation | claude-sonnet-4-20250514 |
| `@agentcn/writer` | Content & commits | kimi-k2-0711-preview |

**Includes:**
- Session workspace plugin with `research_save`, `research_read`, `plan_save`, `plan_read` tools
- Research persistence at project level (shared across agents)
- Plan persistence at session level (per-conversation)

## Creating Packages

Want to contribute a package? See [CONTRIBUTING.md](./CONTRIBUTING.md).

Package structure:
```
registry/packages/my-package/
├── package.json       # Metadata and file mappings
├── agents/            # Agent .md files
├── plugin/            # Plugin .ts files
├── skills/            # Skill README.md files
└── commands/          # Command .md files
```

## Architecture

```
agentcn/
├── packages/
│   ├── cli/           # The npx agentcn command
│   ├── registry/      # Cloudflare Worker API
│   └── shared/        # Shared types and schemas
└── registry/
    └── packages/      # Package source files
        └── workspace/ # The flagship package
```

### Registry API
The registry is a simple Cloudflare Worker that serves package metadata and files from GitHub.

**Endpoints:**
- `GET /r/index.json` - List all packages
- `GET /r/:name.json` - Package metadata with file contents
- `POST /r/webhook` - GitHub webhook for cache invalidation

## Roadmap

- [x] OpenCode support
- [x] Universal `.agentcn/` home with symlinks
- [x] Cross-platform symlink support (Windows junctions)
- [ ] Cursor support (`.cursor/` adapter)
- [ ] Claude Code support (`CLAUDE.md` + MCP adapter)
- [ ] Windsurf support
- [ ] Zed support
- [ ] Interactive multi-target selection
- [ ] Web UI for browsing packages
- [ ] Community package submissions

## License

MIT
