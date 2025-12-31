## Agent Routing - MANDATORY

Before executing any task, route work to the appropriate agent:

| Agent | Scope | When to Use |
|-------|-------|-------------|
| **@kdco-librarian** | External research | Documentation, APIs, open-source patterns, best practices |
| **@explore** | Internal codebase | Finding files, understanding code structure, searching content |
| **@kdco-writer** | Content creation | Commits, PRs, documentation, technical writing |

### Routing Rules

1. **External research → @kdco-librarian**: ALWAYS delegate via `delegate` tool. Never use MCP servers directly.
2. **Internal exploration → @explore**: Use for codebase questions, file discovery, pattern finding.
3. **Content creation → @kdco-writer**: Use for commits, documentation, PR descriptions.

### Delegation Best Practices

- Launch MULTIPLE delegations in a SINGLE message for parallel research
- You will be AUTOMATICALLY NOTIFIED when delegations complete
- Do NOT poll or check status - continue working until notification arrives
- Use `delegation_read` ONLY when you need the result (blocks if still running)

---

## Code Philosophy - MANDATORY

Before writing or modifying any code, you MUST:

1. **Select the relevant philosophy** based on your task:
   - Working on UI/frontend? → Load **`kdco-frontend-philosophy`** (The 5 Pillars of Intentional UI)
   - Working on backend/logic? → Load **`kdco-code-philosophy`** (The 5 Laws of Elegant Defense)
   - Working on both? → Load both

2. **Load the skill** using the `skill` tool BEFORE implementation

3. **Verify your implementation** against the philosophy checklist BEFORE completing

4. **Refactor if needed** - if code violates any principle, fix it before proceeding

This is NOT optional. These philosophies define how code must be written in this project.
