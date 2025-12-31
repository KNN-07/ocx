# Delegation Protocol

Guidelines for delegating work to background agents while you continue working.

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

Spawns an agent. All delegations are async.

```
delegate(
  description: "Short task description",
  prompt: "Full detailed prompt for the agent",
  agent: "coder" | "explore" | "general" | "kdco-librarian" | etc.,
  key: "optional-custom-key"  // Auto-generated from description if omitted
)
```

**Returns:** Key for retrieving results

**Behavior:** Returns immediately, system notifies when complete. If you need to wait for the result, call `delegation_read(key)` and it will wait for completion.

### delegation_read

Retrieves the output from a completed delegation.

```
delegation_read(
  key: "the-delegation-key"
)
```

**Behavior:** If the delegation is still running, this tool will block and wait for it to complete before returning the result. Use this when you need to "await" a delegation.

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
1. Launch parallel research:
   delegate(description: "Research auth patterns", prompt: "Find best practices for...", agent: "kdco-librarian")
   delegate(description: "Research database schema", prompt: "Find patterns for...", agent: "kdco-librarian")
   
2. Continue with other work while they run

3. System notifies via <system-reminder>:
   "Delegation complete. Key: research-auth-patterns"

4. Retrieve results:
   delegation_read(key: "research-auth-patterns")
   delegation_read(key: "research-database-schema")

5. Synthesize findings and continue
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
