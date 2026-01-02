# KDCO Registry

> A collection of plugins, agents, and skills for OpenCode.

KDCO is a component registry for [OpenCode](https://github.com/sst/opencode), installed via [OCX](https://github.com/kdcokenny/ocx). Components are copied directly into your project so you can customize them freely.

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
ocx add kdco/workspace

# Or individual components
ocx add kdco/background-agents
ocx add kdco/librarian
```

## Components

### Bundles

| Component | Description |
|-----------|-------------|
| `workspace` | Full KDCO experience: background agents, planning, specialist agents, research protocols |
| `philosophy` | Full KDCO philosophy enforcement: code philosophy, frontend philosophy, and AGENTS.md |

### Plugins

| Component | Description |
|-----------|-------------|
| `background-agents` | Async delegation with the waiter model. Fire-and-forget tasks with persistent results. |
| `notify` | Native OS notifications. Get notified when tasks complete, errors occur, or input is needed. |
| `workspace-plugin` | Plan management and rule injection for workspace workflows |

### Agents

| Component | Description |
|-----------|-------------|
| `librarian` | External research specialist. Routes to Context7, GitHub grep, and web search for docs and examples. |
| `writer` | Human-facing content specialist. Crafts commits, documentation, and PR descriptions. |

### Skills

| Component | Description |
|-----------|-------------|
| `plan-protocol` | Guidelines for using the plan system to track implementation phases |
| `code-philosophy` | The 5 Laws of Elegant Defense |
| `frontend-philosophy` | The 5 Pillars of Intentional UI |

## Quick Start

For most projects, install the full workspace:

```bash
ocx add kdco/workspace
```

This installs:
- Background delegation system
- Librarian agent (external research)
- Writer agent (commits, docs, PRs)
- Plan management tools
- Planning protocol

Components are installed to `.opencode/` where you can freely customize them.

## Customization

All components are copied to your project. Edit them directly:

```
.opencode/
├── agent/
│   ├── librarian.md          # Customize research behavior
│   └── writer.md             # Customize writing style
├── plugin/
│   ├── background-agents.ts
│   ├── workspace-plugin.ts
│   └── notify.ts             # Customize notification behavior
└── skill/
    └── plan-protocol/
        └── SKILL.md          # Planning guidelines
```

## License

MIT
