---
name: kdco-research-protocol
description: Guidelines for persisting and retrieving research findings across sessions
---

# Research Protocol

This skill provides guidance for using the project-scoped research system.

## When to Use

Load this skill when:
- Gathering external information (documentation, APIs, patterns)
- Needing to persist knowledge across sessions
- Delegating research to @kdco-librarian

## Core Principles

### 1. Research is Project-Scoped
Unlike plans (which are per-session), research persists across all sessions in a project. This enables:
- @kdco-librarian saving research that other agents can read
- Knowledge accumulation over time
- Avoiding redundant external lookups

### 2. Keys Should Be Descriptive
Use kebab-case keys that describe the content:
- ✅ `shadcn-registry-api`
- ✅ `opencode-plugin-structure`

### 3. Content Should Be Self-Contained
Each research entry should be readable without context. Include:
- Source citations
- Key code snippets
- Relevant URLs

## Available Tools

| Tool | Purpose |
|------|---------|
| `research_save` | Save research findings with a key |
| `research_list` | List all available research keys |
| `research_read` | Read research by key |

## Storage Location

Research is stored at:
```
~/.local/share/opencode/workspace/{projectId}/research/{key}.md
```

## Best Practices

### For @kdco-librarian (Research Agent)

1. **Save immediately** - Don't wait until the end of research
2. **Use specific keys** - `hono-cloudflare-worker-setup` not `hono`
3. **Include citations** - URLs, repo links, doc references
4. **Summarize findings** - Don't just dump raw content

### For Consuming Agents

1. **List before reading** - Use `research_list` to see what's available
2. **Reference in plans** - Note which research keys inform decisions
3. **Don't re-research** - Check if research exists before delegating

## Example Workflow

### Step 1: Delegate Research
```
Task to @kdco-librarian: "Research how ShadCN's registry API works. Save findings with key 'shadcn-registry-api'."
```

### Step 2: Agent Saves Research
```
research_save:
  key: "shadcn-registry-api"
  content: |
    # ShadCN Registry API
    ...
```

### Step 3: Read Research
```
research_list: { reason: "Need to see available research before implementation" }
research_read: { key: "shadcn-registry-api" }
```
