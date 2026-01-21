# OCX

[![CI](https://github.com/kdcokenny/ocx/actions/workflows/ci.yml/badge.svg)](https://github.com/kdcokenny/ocx/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ocx.svg)](https://www.npmjs.com/package/ocx)
[![License](https://img.shields.io/github/license/kdcokenny/ocx.svg)](https://github.com/kdcokenny/ocx/blob/main/LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/kdcokenny/ocx)

The missing package manager for OpenCode extensions.

## Why OCX?

- 📦 **Extensions made easy** — Dependencies, MCP servers, config merging handled automatically
- 👻 **Global Profiles** — Work in any repo with YOUR config. Zero modifications. Isolated profiles.
- 🔒 **Auditable** — SHA-256 verified, version-pinned, code you can review

![OCX Demo](./assets/demo.gif)

## Installation

OCX supports macOS (x64, Apple Silicon), Linux (x64, arm64), and Windows (x64).

```bash
# Recommended (macOS/Linux)
curl -fsSL https://ocx.kdco.dev/install.sh | sh

# Or via npm (any platform)
npm install -g ocx
```

The install script handles PATH configuration automatically or prints instructions if manual setup is needed.

## Quick Start

### Option A: Add an npm Plugin (Fastest)

```bash
ocx init
ocx add npm:@franlol/opencode-md-table-formatter
```

That's it. Plugin added to your `opencode.jsonc`.

### Option B: Use a Curated Registry

Registries bundle related components with automatic dependency resolution:

```bash
ocx registry add https://registry.kdco.dev --name kdco
ocx add kdco/workspace
```

After installation, components live in `.opencode/` where you can customize freely.

### Create Your Own Registry

Scaffold a complete registry with one-click deploy support:

```bash
npx ocx init --registry my-registry
```

| Option | Description |
|--------|-------------|
| `--namespace <name>` | Registry namespace (default: directory name) |
| `--author <name>` | Author name (default: git user.name) |
| `--local <path>` | Use custom local template |
| `--canary` | Use latest from main branch |
| `--force` | Skip confirmation prompts |

See [examples/registry-starter](./examples/registry-starter) for the full template with deploy buttons for Cloudflare, Vercel, and Netlify.

## What OCX Handles

- **npm Dependencies** — Plugins need packages? Installed automatically. No manual `package.json` editing.
- **MCP Servers** — Registered to your config with one command. No manual JSON.
- **Config Merging** — Components bring settings that merge safely with yours.
- **Lockfiles** — Track versions, verify integrity with SHA-256 hashes.
- **Dependency Resolution** — Component A needs B? Both installed in correct order.
- **Own Your Code** — Everything lives in `.opencode/`. Customize freely.
- **Version Compatibility** — Registries declare minimum versions. Clear warnings, not blocking errors.
- **Global Profiles** — Work in any repo without modifying it. Your config, their code.

## Auditable by Default

Every component is version-pinned and verified by SHA-256 hash. Before updating, see exactly what changed:

```bash
ocx diff kdco/workspace-plugin
```

- **Detect** — See every upstream change before updating
- **Verify** — SHA-256 hashes catch tampering
- **Pin** — Lockfiles prevent silent updates
- **Audit** — Code lives in your repo, not fetched at runtime

*Your AI agent never runs code you haven't reviewed.*

## Philosophy

OCX follows the **ShadCN model**: components are copied into your project, not hidden in `node_modules`. You own the code—customize freely.

Like **Cargo**, OCX resolves dependencies, pins versions, and verifies integrity. Unlike traditional package managers, everything is auditable and local.

## Commands

| Command | Description |
|---------|-------------|
| `ocx add <components...>` | Add components (`namespace/component`) or npm plugins (`npm:<package>`) |
| `ocx update [component]` | Update to latest version |
| `ocx diff [component]` | Show upstream changes |
| `ocx registry add <url>` | Add a registry |

[Full CLI Reference →](./docs/CLI.md)

### Profile System — Your setup, any repo

The profile system lets you work in repositories without modifying them, using your own portable configuration and profile isolation. Perfect for drive-by contributions to open source projects—or keeping work and personal configs completely separate.

#### Quick Start

```bash
# One-time setup
ocx init --global           # Initialize global profiles
ocx profile add work        # Create a work profile
ocx profile config work     # Edit your profile settings

# Use in any repo (without touching it)
cd ~/oss/some-project
ocx opencode -p work        # Launch OpenCode with your work profile

# Or set default profile
export OCX_PROFILE=work
ocx opencode                # Uses work profile automatically
```

#### Profile Management

Profiles keep your configurations isolated and portable:

```
~/.config/opencode/
├── ocx.jsonc                 # Global base config
└── profiles/
    ├── default/
    │   ├── ocx.jsonc         # Profile OCX settings
    │   ├── opencode.jsonc    # Profile OpenCode config
    │   └── AGENTS.md         # Profile instructions
    └── work/
        ├── ocx.jsonc
        ├── opencode.jsonc
        └── AGENTS.md
```

**Profile Resolution Priority:**

1. `--profile` / `-p` flag (explicit override)
2. `OCX_PROFILE` environment variable
3. `default` profile (if it exists)
4. No profile (base configs only)

**Essential profile commands:**

| Command | Alias | Description |
|---------|-------|-------------|
| `ocx profile list` | `ocx p ls` | List all global profiles |
| `ocx profile add <name>` | `ocx p add` | Create a new profile |
| `ocx profile remove <name>` | `ocx p rm` | Delete a profile |
| `ocx profile show <name>` | `ocx p show` | Display profile contents |
| `ocx profile config <name>` | `ocx p config` | Edit profile's ocx.jsonc in $EDITOR |

**Config commands:**

| Command | Description |
|---------|-------------|
| `ocx config show` | Show merged configuration |
| `ocx config show --origin` | Show config with source annotations |
| `ocx config edit` | Edit local .opencode/ocx.jsonc |
| `ocx config edit --global` | Edit global ocx.jsonc |

**OpenCode commands:**

| Command | Description |
|---------|-------------|
| `ocx opencode [path]` | Launch OpenCode with default profile |
| `ocx opencode -p <name>` | Launch OpenCode with specific profile |

**Init commands:**

| Command | Description |
|---------|-------------|
| `ocx init` | Initialize local .opencode/ directory |
| `ocx init --global` | Initialize global profiles directory |

> **How it works:** The profile system provides configuration isolation:
> - Global profiles override local project configs by default
> - Uses `exclude`/`include` patterns to control which project instruction files are visible
> - Profile instructions take priority over project files
> - Configuration cascades from global → profile → local (with filtering)

#### Config Location

Profile configurations are stored at `~/.config/opencode/profiles/<profile-name>/` (or `$XDG_CONFIG_HOME/opencode/profiles/<profile-name>/`):

- **ocx.jsonc** - Profile-specific OCX settings (registries, component path, exclude/include patterns)
- **opencode.jsonc** - OpenCode configuration for this profile
- **AGENTS.md** - Profile-specific instructions

```jsonc
// ~/.config/opencode/profiles/default/ocx.jsonc
{
  // Component registries (Record<name, url>)
  "registries": {
    "default": "https://registry.opencode.ai",
    "kdco": "https://registry.kdco.dev"
  },
  
  // Where to install components (relative to profile dir)
  "componentPath": ".opencode",
  
  // Custom OpenCode binary (optional)
  "bin": "/path/to/opencode"
}
```

#### Key Differences from Normal Mode

| Aspect | Normal Mode | Profile Mode |
|--------|-------------|--------------|
| Config location | `./.opencode/ocx.jsonc` in project | `~/.config/opencode/profiles/<name>/ocx.jsonc` |
| Modifies repo | Yes | No |
| Per-project settings | Yes | Profile-isolated |
| Requires `ocx init` | Yes | No (uses profile config) |

#### Customizing File Visibility

By default, profiles exclude all OpenCode project files (AGENTS.md, .opencode/, etc.) to provide isolation. OpenCode runs directly in the project directory with profile config passed via configuration merging. You can customize which files are included using glob patterns in your profile's ocx.jsonc:

```jsonc
// ~/.config/opencode/profiles/default/ocx.jsonc
{
  "registries": {
    "kdco": "https://registry.kdco.dev"
  },
  
  // Custom OpenCode binary (optional)
  "bin": "/path/to/opencode",
  
  // Exclude patterns (default: all project instruction files)
  "exclude": [
    "**/CLAUDE.md",
    "**/CONTEXT.md",
    "**/.opencode/**",
    "**/opencode.jsonc",
    "**/opencode.json"
  ],
  
  // Include patterns override excludes (TypeScript/Vite style)
  "include": [
    "**/AGENTS.md",           // Include all AGENTS.md files
    ".opencode/skills/**"     // Include skills directory
  ]
}
```

This follows the TypeScript-style include/exclude model—include patterns override exclude patterns, no confusing negation.

**📖 Full command reference available in [docs/CLI.md](./docs/CLI.md).**

**Looking for the KDCO registry?** See [workers/kdco-registry](./workers/kdco-registry) for components like `kdco/workspace`, `kdco/researcher`, and more.

## Project structure

OCX manages components within the `.opencode/` directory of your project:

```
.opencode/
├── agent/            # Subagents (researcher, scribe)
├── plugin/           # Project plugins (workspace tools, rule injection)
├── skill/            # Reusable instructions (protocols, philosophies)
├── command/          # Custom TUI commands
└── tool/             # Custom tool implementations
```

## Configuration

### `ocx.jsonc`
The user-editable configuration file.

```jsonc
{
  "$schema": "https://ocx.kdco.dev/schemas/ocx.json",
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

## OpenCode Feature Matrix

OCX supports the full range of OpenCode configuration options:

| Feature | Status | Notes |
|---------|--------|-------|
| **Components** |||
| Agents (`.opencode/agent/*.md`) | ✅ | Full support |
| Skills (`.opencode/skill/<name>/SKILL.md`) | ✅ | Full support |
| Plugins (file-based `.opencode/plugin/*.ts`) | ✅ | Full support |
| Plugins (npm packages) | ✅ | Via `ocx add npm:<package>` |
| Commands (`.opencode/command/*.md`) | ✅ | Full support |
| Bundles (meta-components) | ✅ | Full support |
| **opencode.jsonc Config** |||
| `plugin` (npm package array) | ✅ | Via `ocx add npm:<package>` |
| `mcp` (MCP servers) | ✅ | URL shorthand + full objects |
| `tools` (enable/disable patterns) | ✅ | Full support |
| `agent` (per-agent config) | ✅ | tools, temperature, permission, prompt |
| `instructions` (global instructions) | ✅ | Appended from components |
| **MCP Server Config** |||
| Remote servers (`type: remote`) | ✅ | URL shorthand supported |
| Local servers (`type: local`) | ✅ | Full support |
| Headers, environment, oauth | ✅ | Full support |
| **Schema Design** |||
| Cargo-style union types | ✅ | String shorthand + full objects |
| File string shorthand | ✅ | Auto-generates target path |
| MCP URL shorthand | ✅ | `"https://..."` → remote server |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OCX_PROFILE` | Override the active profile (bypasses default profile) |
| `OPENCODE_BIN` | Path to OpenCode binary (overridden by `bin` in profile's ocx.jsonc) |

## What's Shipped

- ✅ SHA-256 integrity verification
- ✅ Lockfile support
- ✅ Multi-registry composition
- ✅ Dependency resolution
- ✅ Config merging
- ✅ Version compatibility warnings

Have ideas? [Open an issue](https://github.com/kdcokenny/ocx/issues).

## Disclaimer

This project is not built by the OpenCode team and is not affiliated with [OpenCode](https://github.com/sst/opencode) in any way.

## License

MIT
