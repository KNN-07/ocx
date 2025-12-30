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
      "files": [
        {
          "path": "plugin/index.ts",
          "target": ".opencode/plugin/my-cool-plugin.ts"
        }
      ],
      "dependencies": []
    }
  ]
}
```

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
