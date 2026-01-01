# Creating OCX Registries

OCX registries are collections of components (agents, skills, plugins, commands) distributed as JSON packuments. This guide covers how to build and distribute your own registry.

## Registry Philosophy

1. **Prefix Enforcement**: Every registry MUST have a unique prefix (e.g., `kdco-`). All components within that registry must start with this prefix to prevent naming collisions.
2. **Atomic Versions**: Components are versioned at the registry level. When you update a registry, components inherit the new version.
3. **Self-Documenting**: All components must have a description and clear dependencies.

## Structure

A registry source directory should look like this:

```
my-registry/
├── registry.json     # Registry manifest
└── files/            # Component source files
    ├── agent/
    ├── plugin/
    ├── skill/
    └── command/
```

### registry.json

OCX uses **Cargo-style union types** for a clean developer experience: use strings for simple cases, objects when you need more control.

```json
{
  "name": "My Extensions",
  "prefix": "my",
  "version": "1.0.0",
  "author": "Your Name",
  "components": [
    {
      "name": "my-cool-plugin",
      "type": "ocx:plugin",
      "description": "Does something cool",
      "files": ["plugin/my-cool-plugin.ts"],
      "dependencies": []
    }
  ]
}
```

## Cargo-Style Patterns

### Files

Use string shorthand when the target can be auto-inferred from the path:

```json
// String shorthand (recommended)
"files": ["plugin/my-plugin.ts"]
// Expands to: { "path": "plugin/my-plugin.ts", "target": ".opencode/plugin/my-plugin.ts" }

// Full object (when you need a custom target)
"files": [
  {
    "path": "skill/my-skill/SKILL.md",
    "target": ".opencode/skill/my-skill/SKILL.md"
  }
]
```

### MCP Servers

Use URL shorthand for remote servers:

```json
// String shorthand (recommended for remote servers)
"mcpServers": {
  "context7": "https://mcp.context7.com/mcp"
}
// Expands to: { "type": "remote", "url": "https://...", "enabled": true }

// Full object (for local servers or advanced config)
"mcpServers": {
  "local-mcp": {
    "type": "local",
    "command": ["node", "server.js"],
    "args": ["--port", "3000"],
    "environment": { "DEBUG": "true" }
  }
}
```

### OpenCode Config Block

Components can specify settings to merge into the user's `opencode.json`:

```json
{
  "name": "my-agent",
  "type": "ocx:agent",
  "files": ["agent/my-agent.md"],
  "dependencies": [],
  "opencode": {
    "plugins": ["@some-org/opencode-plugin"],
    "tools": {
      "webfetch": false
    },
    "agent": {
      "my-agent": {
        "tools": {
          "read": true,
          "write": true,
          "bash": false
        },
        "temperature": 0.7
      }
    },
    "instructions": ["Always follow best practices"]
  }
}
```

| Field | Description |
|-------|-------------|
| `opencode.plugins` | npm packages added to `opencode.json` plugin array |
| `opencode.tools` | Global tool enable/disable settings |
| `opencode.agent` | Per-agent configuration (tools, temperature, permission, prompt) |
| `opencode.instructions` | Global instructions appended to config |

## Component Types

| Type | Target Directory | Description |
|------|-----------------|-------------|
| `ocx:agent` | `agent/` | Markdown files defining specialized agents. |
| `ocx:skill` | `skill/` | Instruction sets (must follow `.opencode/skill/<name>/SKILL.md`). |
| `ocx:plugin` | `plugin/` | TypeScript/JavaScript extensions for tools and hooks. |
| `ocx:command` | `command/` | Markdown templates for TUI commands. |
| `ocx:bundle` | N/A | Virtual components that install multiple other components. |

## Building

Use the OCX CLI to validate and build your registry:

```bash
ocx build ./my-registry --out ./dist
```

This command will:
1. Validate your `registry.json` against the Zod schema.
2. Ensure all component names match the prefix.
3. Verify that all listed dependencies exist within the registry.
4. Generate an `index.json` and individual packument files (e.g., `my-cool-plugin.json`) in the output directory.

## Distribution

OCX registries are static JSON files. You can host them on GitHub Pages, Vercel, or any static file host.

Example structure for a hosted registry:
```
https://example.com/registry/
├── index.json
├── my-cool-plugin.json
└── ...
```

Users can then add your registry using:
```bash
ocx registry add https://example.com/registry --name my
```
