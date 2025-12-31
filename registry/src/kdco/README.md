# KDCO Registry

> The ShadCN for AI coding agents. Copy-paste components for OpenCode.

KDCO is a collection of plugins, agents, and skills for [OpenCode](https://github.com/sst/opencode). Following the ShadCN philosophy, components are copied directly into your project so you can customize them freely.

## Installation

Add the KDCO registry using [OCX](https://github.com/kdcokenny/ocx):

```bash
# Install OCX
curl -fsSL https://ocx.kdco.dev/install.sh | sh
# Or: npm install -g ocx

# Initialize and add registry
ocx init
ocx registry add --name kdco https://registry.kdco.dev
```

Then install components:

```bash
# Full workspace (recommended)
ocx add kdco-workspace

# Or individual components
ocx add kdco-background-agents
ocx add kdco-librarian
```

## Components

### Bundles

| Component | Description |
|-----------|-------------|
| `kdco-workspace` | Full KDCO experience: background agents, planning, specialist agents, research protocols |
| `kdco-philosophy` | Full KDCO philosophy enforcement: code philosophy, frontend philosophy, and AGENTS.md |

### Plugins

| Component | Description |
|-----------|-------------|
| `kdco-background-agents` | Async delegation with the waiter model. Fire-and-forget tasks with persistent results. |
| `kdco-workspace-plugin` | Plan management and rule injection for workspace workflows |

### Agents

| Component | Description |
|-----------|-------------|
| `kdco-librarian` | External research specialist. Routes to Context7, GitHub grep, and web search for docs and examples. |
| `kdco-writer` | Human-facing content specialist. Crafts commits, documentation, and PR descriptions. |

### Skills

| Component | Description |
|-----------|-------------|
| `kdco-background-protocol` | Guidelines for the waiter model delegation pattern |
| `kdco-code-philosophy` | The 5 Laws of Elegant Defense |
| `kdco-frontend-philosophy` | The 5 Pillars of Intentional UI |

## Quick Start

For most projects, install the full workspace:

```bash
ocx add kdco-workspace
```

This installs:
- Background delegation system
- Librarian agent (external research)
- Writer agent (commits, docs, PRs)
- Plan management tools
- Research and planning protocols

Components are installed to `.opencode/` where you can freely customize them.

## Customization

All components are copied to your project. Edit them directly:

```
.opencode/
├── agent/
│   ├── kdco-librarian.md     # Customize research behavior
│   └── kdco-writer.md        # Customize writing style
├── plugin/
│   └── kdco-background-agents.ts
└── skill/
    └── kdco-background-protocol/
        └── SKILL.md          # Adjust delegation guidelines
```

## License

MIT
