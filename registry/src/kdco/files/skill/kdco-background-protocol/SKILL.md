# Delegation Protocol

Guidelines for delegating work to background agents while you continue working.

## Delegation Behavior

Delegations are **ASYNC by default** - launch and get notified on completion.

### PREFER Async When:

You have **productive work** to do while waiting:
- Exploring the codebase
- Organizing/planning other aspects
- Launching additional independent research
- Communicating with the user

### USE Blocking When:

There is **genuinely NO productive work** you can do until the result arrives:
- You need the research output to answer the user's question
- You're completely blocked on next steps without this information
- Continuing without the result would be pure speculation

### How It Works

- `delegate` → launches async, returns immediately, you get notified via `<system-reminder>`
- `delegation_read` on completed → returns result immediately
- `delegation_read` on in-progress → BLOCKS until complete (use only when no productive work)

### Golden Rule

Launch ALL independent delegations in a **SINGLE message**. Then continue with productive work until notified.

### Anti-Patterns (NEVER do these)

- "Let me check if the delegations have completed" - You WILL be notified automatically
- Launching delegations one at a time sequentially - launch ALL in parallel
- Waiting idle when there IS productive work to do

### Correct Pattern

```
// Launch ALL independent research in a SINGLE message
delegate(description: "Research A", prompt: "...", agent: "kdco-librarian")
delegate(description: "Research B", prompt: "...", agent: "kdco-librarian")
delegate(description: "Research C", prompt: "...", agent: "kdco-librarian")

// Continue with other productive work (planning, exploration, etc.)
// You WILL receive <system-reminder> notifications as each completes

// Only read results AFTER notification arrives
delegation_read(key: "research-a")
```

## When to Use Delegation

- **Parallel research** - Launch multiple librarian queries simultaneously
- **Long-running operations** - Tasks that would block your main workflow
- **Independent tasks** - Work with no dependencies on each other
- **Exploration** - Broad searches where results will be collected later

## When NOT to Delegate

- **Dependent tasks** - When task A must complete before task B starts
- **Quick lookups** - Faster to do inline than spawn a background session
- **Nested delegations** - Anti-recursion prevents this automatically

## Tools Reference

### delegate

Spawns an agent asynchronously. Returns immediately with a key.

```
delegate(
  description: "Short task description",
  prompt: "Full detailed prompt for the agent",
  agent: "kdco-librarian" | "explore" | "coder" | "general",
  key: "optional-custom-key"  // Auto-generated from description if omitted
)
```

**Returns:** Key for retrieving results

**Behavior:** Returns IMMEDIATELY. The agent runs in the background. You will receive a `<system-reminder>` notification when complete. Do NOT wait or poll.

### delegation_read

Retrieves output from a delegation. **BLOCKS if still running.**

```
delegation_read(
  key: "the-delegation-key"
)
```

**Behavior:** 
- If delegation is **complete**: Returns result immediately
- If delegation is **still running**: BLOCKS until complete (await behavior)

Use this for sequential dependencies where you MUST have the result before proceeding. For parallel work, wait for the `<system-reminder>` notification instead.

### delegation_list

Lists all delegations for the current session with their status.

```
delegation_list()
```

### delegation_delete

Cancels running delegation(s) or removes completed ones.

```
delegation_delete(
  key: "the-delegation-key"  // Delete specific delegation
)

delegation_delete(
  all: true  // Cancel all running delegations
)
```

## Best Practices

### Task Descriptions

- Keep short and specific (becomes the key if not overridden)
- Use action verbs: "Research...", "Find...", "Analyze..."
- Example: "Research OAuth2 PKCE flow implementation"

### Prompts

- Must be in English
- Be detailed and self-contained
- Include all context the background agent needs
- Specify expected output format
- Don't assume the agent knows your conversation history

### Monitoring

- System automatically notifies when delegations complete via `<system-reminder>`
- Use `delegation_list()` to see status of all delegations
- Use `delegation_read(key)` to retrieve full output. If the task is still running, this will wait for completion.
- To "await" multiple tasks, call `delegation_read` for each one sequentially.
- For non-blocking status checks, use `delegation_list()`.

### Cleanup

- Cancel running delegations before giving final answer if not needed
- Use `delegation_delete(all: true)` for bulk cleanup
- Cancelled delegations free up resources

## Example Workflow

```
1. Launch ALL parallel research in a SINGLE message:
   delegate(description: "Research auth patterns", prompt: "Find best practices for...", agent: "kdco-librarian")
   delegate(description: "Research database schema", prompt: "Find patterns for...", agent: "kdco-librarian")
   
2. Continue with other productive work while they run in background
   - Plan next steps
   - Explore internal codebase with @explore
   - Update todos
   - Do NOT sit idle waiting

3. System notifies via <system-reminder> as each completes:
   "Delegation complete. Key: research-auth-patterns. Status: complete"

4. AFTER notification, retrieve results:
   delegation_read(key: "research-auth-patterns")
   delegation_read(key: "research-database-schema")

5. Synthesize findings and continue implementation
```

## How It Works

1. **All delegations use async** - Uses `promptAsync()` under the hood
2. **Output is always persisted** - Saved to `~/.local/share/opencode/delegations/{projectHash}/{rootSessionID}/{key}.md`
3. **Parent gets key only** - Full output retrieved via `delegation_read`
4. **Blocking = poll until complete** - Not true sync, allows other tasks to progress

## Limitations

- Delegated agents cannot spawn their own delegations (anti-recursion)
- Delegated agents have isolated context (no access to parent conversation)
- Results must be retrieved via `delegation_read` (only key is returned inline)
