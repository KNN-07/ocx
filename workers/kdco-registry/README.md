# KDCO Registry

> Curated OpenCode extensions for enhanced AI-assisted development.

## Quick Start

```bash
ocx init
ocx registry add https://registry.kdco.dev --name kdco
ocx add kdco/workspace
```

Browse available components with `ocx search kdco/`.

## Bundles

| Name | Description | Command |
|------|-------------|---------|
| workspace | Full KDCO experience | `ocx add kdco/workspace` |
| philosophy | Code quality philosophies | `ocx add kdco/philosophy` |

## Components

Install individually if you don't want the full bundle.

### Agents

| Name | Description | Command |
|------|-------------|---------|
| researcher | External research via MCP | `ocx add kdco/researcher` |
| scribe | Documentation specialist | `ocx add kdco/scribe` |
| coder | Code implementation | `ocx add kdco/coder` |

### Plugins

| Name | Description | Command |
|------|-------------|---------|
| background-agents | Async task execution | `ocx add kdco/background-agents` |
| notify | OS notifications | `ocx add kdco/notify` |
| workspace-plugin | Plan management | `ocx add kdco/workspace-plugin` |

### Skills

| Name | Description | Command |
|------|-------------|---------|
| plan-protocol | Implementation plan guidelines | `ocx add kdco/plan-protocol` |
| code-philosophy | The 5 Laws of Elegant Defense | `ocx add kdco/code-philosophy` |
| frontend-philosophy | The 5 Pillars of Intentional UI | `ocx add kdco/frontend-philosophy` |

## Web Search Setup

The researcher agent uses **Exa** by default (free, no auth required).

### Using Kagi (Optional)

Kagi provides privacy-focused search but requires a [paid subscription](https://kagi.com).

1. Create a secret file (requires Node.js 22+ for `npx`):
   ```bash
   mkdir -p ~/.secrets && chmod 700 ~/.secrets
   echo "YOUR_KAGI_SESSION_TOKEN" > ~/.secrets/kagi-session-token
   chmod 600 ~/.secrets/kagi-session-token
   ```

2. Enable Kagi in your `opencode.jsonc`:
   ```jsonc
   {
     "mcp": {
       "kagi": { "enabled": true }
     },
     "agent": {
       "researcher": {
         "tools": { "kagi_*": true }
       }
     }
   }
   ```

## Creating Your Own Registry

See [Creating OCX Registries](../../docs/CREATING_REGISTRIES.md) for how to build and distribute your own component registry.
