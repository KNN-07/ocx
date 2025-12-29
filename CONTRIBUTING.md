# Contributing to AgentCN

Thank you for your interest in contributing to AgentCN!

## Creating a Package

### 1. Package Structure

Create a new directory in `registry/packages/`:

```
registry/packages/your-package/
├── package.json       # Required: metadata and file mappings
├── agents/            # Agent markdown files
├── plugin/            # Plugin TypeScript files
├── skills/            # Skill README files
└── commands/          # Command markdown files
```

### 2. Package Metadata

Your `package.json` must include:

```json
{
  "name": "your-package",
  "version": "0.1.0",
  "type": "registry:package",
  "description": "What your package does",
  "author": "your-name",
  "license": "MIT",
  "runtimes": ["opencode"],
  "files": [
    {
      "path": "agents/my-agent.md",
      "target": ".opencode/agent/@agentcn/my-agent.md",
      "type": "agent"
    }
  ]
}
```

### 3. File Types

| Type | Description | Target Pattern |
|------|-------------|----------------|
| `agent` | Agent definition | `.opencode/agent/@agentcn/*.md` |
| `plugin` | OpenCode plugin | `.opencode/plugin/@agentcn/*.ts` |
| `skill` | Skill/protocol | `.opencode/skill/@agentcn/*/README.md` |
| `command` | Slash command | `.opencode/command/@agentcn/*.md` |
| `prompt` | Reusable prompt | `.opencode/prompt/@agentcn/*.md` |

### 4. Agent Format

Agents use YAML frontmatter:

```markdown
---
model: anthropic/claude-sonnet-4-20250514
tools:
  - tool_name
mode: primary
---

# Agent Name

Your agent instructions here...
```

### 5. Testing Locally

```bash
# Build the CLI
cd packages/cli
bun run build

# Test adding your package (from a test project)
npx /path/to/agentcn add your-package
```

### 6. Submit a PR

1. Fork the repository
2. Create your package in `registry/packages/`
3. Update `registry/packages/index.json` to include your package
4. Submit a pull request

## Development

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- Node.js >= 18

### Setup

```bash
git clone https://github.com/kdcokenny/agentcn
cd agentcn
bun install
```

### Build

```bash
bun run build
```

### Test CLI locally

```bash
cd packages/cli
bun run dev init
bun run dev add workspace
```

### Deploy Registry

```bash
cd packages/registry
bun run deploy
```

## Code Style

- TypeScript strict mode
- Biome for formatting (tabs, double quotes)
- No `any` types

## Questions?

Open an issue or start a discussion!
