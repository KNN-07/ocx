# OCX (OpenCode Extensions)

> ShadCN-style registry for OpenCode extensions. Copy. Paste. Own.

OCX is a lightweight CLI for installing agents, skills, and plugins into OpenCode projects. Following the "copy-and-own" philosophy, OCX scaffolds components directly into your project so you can customize them freely.

## Key Features

- **Lighter Architecture**: Injects targeted rules into built-in agents using plugin hooks instead of replacing them entirely.
- **Persistent Context**: Workspace components provide research and plan persistence across sessions.
- **Fail-Fast Validation**: Strict Zod schemas ensure registries and configurations are always valid.
- **Enterprise Ready**: Support for lockfiles (`ocx.lock`), registry locking, and version pinning.
- **Single Binary**: Zero dependencies, distributed as a standalone executable.

## Installation

OCX supports macOS (x64, Apple Silicon), Linux (x64, arm64), and Windows (x64).

```bash
# Install script (macOS and Linux) - recommended
curl -fsSL https://ocx.kdco.dev/install.sh | sh

# Or install via npm
npm install -g ocx

# Windows users: Download binaries from GitHub Releases
# https://github.com/kdcokenny/ocx/releases
```

The install script handles PATH configuration automatically or prints instructions if manual setup is needed.

## Quick Start

```bash
# 1. Initialize OCX in your project
ocx init

# 2. Add the KDCO registry
ocx registry add https://registry.kdco.dev --name kdco

# 3. Add the workspace bundle
ocx add kdco-workspace
```

After installation, OCX will manage components in your `.opencode/` directory, where you can freely customize them to match your project's needs.

## CLI Commands

### `ocx init`
Initialize OCX configuration. Creates `ocx.jsonc` in your project root.

### `ocx registry add <url>`
Add a component registry source. Registries are version-controlled and prefix-enforced.

### `ocx add <component>`
Install components into `.opencode/`. Dependencies are resolved automatically.
Supports: `prefix-name`, `@registry/name`, local paths, or direct URLs.

### `ocx search <query>`
Search for components across all configured registries. Aliased as `ocx list`.

### `ocx diff [component]`
Compare your local project files against the upstream registry version.

### `ocx build [path]`
A tool for registry authors to validate component source files and generate registry indexes and packuments.

## Project structure

OCX manages components within the `.opencode/` directory of your project:

```
.opencode/
├── agent/            # Subagents (librarian, writer)
├── plugin/           # Project plugins (workspace tools, rule injection)
├── skill/            # Reusable instructions (protocols, philosophies)
├── command/          # Custom TUI commands
└── philosophy/       # Mandatory project rules
```

## Configuration

### `ocx.jsonc`
The user-editable configuration file.

```jsonc
{
  "$schema": "https://ocx.kdco.dev/schema.json",
  "registries": {
    "kdco": {
      "url": "https://registry.kdco.dev"
    }
  },
  "lockRegistries": false
}
```

### `ocx.lock`
Auto-generated lockfile tracking installed versions, hashes, and targets.

## Roadmap

- [x] Lighter-weight rule injection architecture
- [x] Recursive AGENTS.md discovery
- [x] Multi-platform binary distribution
- [ ] Cursor / Claude Code adapter support
- [ ] Centralized component discovery portal

## License

MIT
