---
name: kdco-research-protocol
description: Guidelines for persisting and retrieving research findings across sessions
---

# Research Protocol

This skill provides guidance for using the delegation system for research.

## When to Use

Load this skill when:
- Gathering external information (documentation, APIs, patterns)
- Needing to persist knowledge across sessions
- Delegating research to @kdco-librarian

## Core Principles

### 1. Research Uses Delegation

All research is handled through the delegation system:
- Delegate to @kdco-librarian for research tasks
- Results are automatically persisted with a key
- Retrieve via `delegation_read` when needed

### 2. Keys are Required

Every delegation must have an explicit, unique key:
- ✅ `shadcn-registry-api`
- ✅ `opencode-plugin-structure`
- Use short, descriptive kebab-case strings for keys.

### 3. Content is Automatically Persisted

When you delegate research:
1. Agent does the research
2. Output is automatically saved to `~/.local/share/opencode/delegations/{projectHash}/{rootSessionID}/{key}.md`
3. You receive a `<system-reminder>` notification with the key
4. Retrieve full output with `delegation_read(key)`

## Available Tools

| Tool | Purpose |
|------|---------|
| `delegate` | Spawn a research agent (use `agent: "kdco-librarian"`) |
| `delegation_list` | List all available delegation keys and status |
| `delegation_read` | Read delegation output by key |

## Best Practices

### For Delegating Research

1. **Be specific** - Clear prompts yield better research
2. **Use descriptive keys** - `hono-cloudflare-worker-setup` not `hono`
3. **Parallel when possible** - Launch multiple research tasks simultaneously
4. **Wait when dependent** - Call `delegation_read(key)` immediately after `delegate()` if next step needs the result

### For Consuming Research

1. **List before reading** - Use `delegation_list` to see what's available
2. **Reference in plans** - Note which research keys inform decisions
3. **Don't re-research** - Check if research exists before delegating again

## Example Workflow

### Step 1: Delegate Research

```
delegate(
  key: "research-shadcn-registry-api",
  description: "Research ShadCN registry API",
  prompt: "Find how ShadCN's registry API works. Include endpoints, response formats, and authentication requirements.",
  agent: "kdco-librarian"
)
```

Returns: `"Delegated to kdco-librarian. Key: research-shadcn-registry-api"`

### Step 2: System Notification

```xml
<system-reminder>
Delegation complete.
**Description:** "Research ShadCN registry API"
**Key:** `research-shadcn-registry-api`
Use `delegation_read` with key "research-shadcn-registry-api" to retrieve the full result.
</system-reminder>
```

### Step 3: Retrieve Research

```
delegation_read(key: "research-shadcn-registry-api")
```

## Parallel Research Example

```
// Launch multiple research tasks simultaneously
delegate(key: "research-oauth2-pkce", description: "Research OAuth2 PKCE", prompt: "...", agent: "kdco-librarian")
delegate(key: "research-session-management", description: "Research session management", prompt: "...", agent: "kdco-librarian")
delegate(key: "research-token-refresh-patterns", description: "Research token refresh patterns", prompt: "...", agent: "kdco-librarian")

// Continue with other work...

// When notifications arrive, collect results
delegation_list()  // See status of all
delegation_read(key: "research-oauth2-pkce")
delegation_read(key: "research-session-management")
delegation_read(key: "research-token-refresh-patterns")
```

## Waiting for Research (When You Need It Now)

```
// Launch research
delegate(
  key: "research-critical-api",
  description: "Research critical API",
  prompt: "Find the exact format for...",
  agent: "kdco-librarian"
)

// Wait for result immediately
delegation_read(key: "research-critical-api")
```
