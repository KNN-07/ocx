# AgentCN Workspace Package

This package provides a complete agent workflow system for AI coding assistants.

## Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| **@agentcn/plan** | claude-sonnet-4 | Strategic planning, task decomposition, research delegation |
| **@agentcn/build** | gemini-2.5-flash | Code implementation, follows plans from @agentcn/plan |
| **@agentcn/librarian** | claude-sonnet-4 | External research, documentation lookup, knowledge persistence |
| **@agentcn/writer** | kimi-k2 | Human-facing content: commits, PRs, documentation |

## Workflow

```
User Request
     ↓
@agentcn/plan (analyze, delegate research)
     ↓
@agentcn/librarian (research, save findings)
     ↓
@agentcn/plan (create implementation plan)
     ↓
@agentcn/build (execute plan phase-by-phase)
     ↓
@agentcn/writer (commit, PR, docs)
```

## Tools Provided

### Research Persistence (Project-Scoped)
- `research_save` - Save findings with a key (shared across all sessions)
- `research_list` - List all saved research keys
- `research_read` - Read research by key

### Plan Management (Session-Scoped)
- `plan_save` - Save implementation plan with phases
- `plan_read` - Read current plan

## Skills

- **plan-protocol** - Guidelines for creating and executing plans
- **research-protocol** - Guidelines for research and knowledge persistence

## Commands

- `/plan` - Display the current implementation plan

## Storage Locations

- **Research**: `~/.local/share/opencode/workspace/{projectId}/research/`
- **Plans**: `~/.local/share/opencode/workspace/{projectId}/{sessionId}/plan.json`

Research is **project-scoped** (shared across sessions), while plans are **session-scoped** (per conversation).

## Configuration

Agents are installed to `.agentcn/workspace/` with symlinks to `.opencode/`.

To modify an agent's model, edit the frontmatter in `.agentcn/workspace/agents/<agent>.md`.
