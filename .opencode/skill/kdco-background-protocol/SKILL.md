# Background Agents Protocol

Guidelines for using background agents to run async tasks while you continue working.

## When to Use Background Agents

- **Parallel research** - Launch multiple librarian queries simultaneously
- **Long-running operations** - Tasks that would block your main workflow
- **Independent tasks** - Work with no dependencies on each other
- **Exploration** - Broad searches where results will be collected later

## When NOT to Use Background Agents

- **Dependent tasks** - When task A must complete before task B starts
- **Quick lookups** - Faster to do inline than spawn a background session
- **Immediate results needed** - When the next step requires this output
- **Nested background tasks** - Anti-recursion prevents this automatically

## Tools Reference

### background_task

Spawns an agent in the background. Returns immediately with a task ID.

```
background_task(
  description: "Short task description",
  prompt: "Full detailed prompt for the agent",
  agent: "coder" | "explore" | "general" | etc.
)
```

**Returns:** Task ID for tracking

### background_status

Gets task status or result. System notifies on completion, so blocking rarely needed.

```
background_status(
  task_id: "bg_xxx_yyy",
  block: false  // Optional: wait for completion
)
```

### background_cancel

Cancels running task(s). Use before final answer if tasks no longer needed.

```
background_cancel(
  task_id: "bg_xxx_yyy"  // Cancel specific task
)

background_cancel(
  all: true  // Cancel all running tasks
)
```

## Best Practices

### Task Descriptions

- Keep short and specific (shown in status updates)
- Use action verbs: "Research...", "Find...", "Analyze..."
- Example: "Research OAuth2 PKCE flow implementation"

### Prompts

- Must be in English
- Be detailed and self-contained
- Include all context the background agent needs
- Specify expected output format
- Don't assume the agent knows your conversation history

### Monitoring

- System automatically notifies when tasks complete
- Only use `background_status` if you need results before notification
- Avoid polling loops - use `block: true` if you must wait
- Collect results from multiple tasks before synthesizing

### Cleanup

- Cancel running tasks before giving final answer if not needed
- Use `background_cancel(all: true)` for bulk cleanup
- Cancelled tasks free up resources

## Example Workflow

```
1. Launch parallel research:
   background_task("Research auth patterns", "Find best practices for...", "general")
   background_task("Research database schema", "Find patterns for...", "general")
   
2. Continue with other work while they run

3. System notifies: "Task bg_abc completed"

4. Collect results:
   background_status(task_id: "bg_abc")
   background_status(task_id: "bg_xyz")

5. Synthesize findings and continue
```

## Limitations

- Background agents cannot spawn their own background tasks (anti-recursion)
- Background agents have isolated context (no access to parent conversation)
- Results must be explicitly retrieved via `background_status`
