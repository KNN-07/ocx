# Research Protocol

This skill provides guidance for using the project-scoped research system.

## When to Use

Load this skill when:
- Gathering external information (documentation, APIs, patterns)
- Needing to persist knowledge across sessions
- Delegating research to @librarian

## Core Principles

### 1. Research is Project-Scoped
Unlike plans (which are per-session), research persists across all sessions in a project. This enables:
- @librarian saving research that @plan/@build can read
- Knowledge accumulation over time
- Avoiding redundant external lookups

### 2. Keys Should Be Descriptive
Use kebab-case keys that describe the content:
- ✅ `shadcn-registry-api`
- ✅ `opencode-plugin-structure`
- ❌ `research1`
- ❌ `temp`

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

### For @librarian (Research Agent)

1. **Save immediately** - Don't wait until the end of research
2. **Use specific keys** - `hono-cloudflare-worker-setup` not `hono`
3. **Include citations** - URLs, repo links, doc references
4. **Summarize findings** - Don't just dump raw content

### For @plan/@build (Consuming Agents)

1. **List before reading** - Use `research_list` to see what's available
2. **Reference in plans** - Note which research keys inform decisions
3. **Don't re-research** - Check if research exists before delegating

## Example Workflow

### Step 1: @plan Delegates Research
```
Task to @librarian: "Research how ShadCN's registry API works. Save findings with key 'shadcn-registry-api'."
```

### Step 2: @librarian Saves Research
```
research_save:
  key: "shadcn-registry-api"
  content: |
    # ShadCN Registry API
    
    ## Endpoints
    - GET /r/index.json - List all components
    - GET /r/styles/{style}/{name}.json - Get component
    
    ## Source
    https://github.com/shadcn-ui/ui/tree/main/apps/www/public/r
```

### Step 3: @build Reads Research
```
research_list: { reason: "Need to see available research before implementation" }
research_read: { key: "shadcn-registry-api" }
```

## Common Patterns

### Naming Conventions

| Pattern | Example |
|---------|---------|
| `{topic}-{subtopic}` | `opencode-plugin-structure` |
| `{library}-{feature}` | `hono-middleware-patterns` |
| `{task}-{approach}` | `auth-jwt-implementation` |

### Content Structure

```markdown
# {Title}

## Summary
Brief overview of findings.

## Key Details
- Point 1
- Point 2

## Code Examples
\`\`\`typescript
// Relevant code
\`\`\`

## Sources
- [Link 1](url)
- [Link 2](url)
```
