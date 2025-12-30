---
name: kdco-plan-protocol
description: Guidelines for using the plan system to track implementation phases and steps
---

# Plan Protocol

This skill provides guidance for working with the implementation plan system.

## When to Use

Load this skill when:
- Creating or updating implementation plans
- Executing multi-phase work
- Coordinating between planning and building phases

## Core Principles

### 1. Plans are Session-Scoped
Each conversation gets its own plan. Starting a new chat means a fresh plan.

### 2. Research is Project-Scoped
Research findings persist across sessions and are shared by all agents. Use `research_save` liberally for external knowledge.

### 3. Phases Should Be Atomic
Each phase should represent a complete unit of work that can be validated independently.

## Plan Structure

```json
{
  "goal": "High-level objective",
  "phases": [
    {
      "name": "Phase 1: Setup",
      "status": "complete",
      "steps": ["Step 1", "Step 2"],
      "dependencies": []
    },
    {
      "name": "Phase 2: Implementation",
      "status": "in_progress",
      "steps": ["Step 3", "Step 4"],
      "dependencies": ["Phase 1: Setup"]
    }
  ]
}
```

## Status Values

| Status | Meaning |
|--------|---------|
| `pending` | Not yet started |
| `in_progress` | Currently being worked on |
| `complete` | Finished successfully |
| `blocked` | Waiting on dependencies or external factors |

## Best Practices

1. **Update status as you work** - Don't batch status updates
2. **Keep steps specific** - Vague steps lead to missed requirements
3. **Document blockers** - If blocked, note why in the phase
4. **Reference research** - Link to research keys when relevant

## Example Usage

### Creating a Plan
```
Use plan_save with:
- goal: "Implement user authentication"
- phases: [
    { name: "Phase 1: Research", status: "complete", steps: [...] },
    { name: "Phase 2: Implementation", status: "pending", steps: [...] }
  ]
```

### Reading a Plan
```
Use plan_read with reason: "Starting build session, need to see current plan"
```

### Updating Progress
```
Use plan_save with updated status on phases as you complete them
```
