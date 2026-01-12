---
name: plan-review
description: Criteria for reviewing implementation plans against quality standards
---

# Plan Review

> **Load this skill** when reviewing implementation plans (not code).

## TL;DR
Systematic plan review across 4 categories: Protocol Compliance, Citation Quality, Completeness, and Actionability. Verify plans follow the plan-protocol format and provide actionable implementation guidance.

## When to Use This Skill
- When reviewing implementation plans before execution
- When auditing plan quality after creation
- When verifying plans meet documentation standards
- As part of the plan validation workflow

---

## Plan Review Checklist

### 1. Plan Protocol Compliance

| Requirement | Check |
|-------------|-------|
| YAML frontmatter present | `status`, `phase`, `updated` fields |
| Goal section exists | Clear, one-sentence description |
| Phases have status markers | `[PENDING]`, `[IN PROGRESS]`, `[COMPLETE]`, `[BLOCKED]` |
| Single CURRENT marker | Exactly ONE task marked `← CURRENT` |
| Hierarchical task numbering | Tasks numbered 1.1, 1.2, 2.1, etc. |
| Valid frontmatter values | status is one of: `not-started`, `in-progress`, `complete`, `blocked` |

### 2. Citation Quality

| Requirement | Check |
|-------------|-------|
| Decisions reference sources | `ref:delegation-id` format used |
| No unsubstantiated claims | Architectural decisions cite research |
| Research phases show refs | Completed research tasks include citations |
| Citations are verifiable | IDs match actual delegation outputs |

**Red Flags:**
- Decisions table with empty or `-` in Source column
- Claims like "industry standard" or "best practice" without citation
- Research tasks marked complete without `→ ref:id`

### 3. Completeness

| Requirement | Check |
|-------------|-------|
| Goal is specific | Measurable outcome, not vague intent |
| Phases are logical | Sequential, with clear progression |
| Edge cases considered | Error handling, failure modes addressed |
| Notes section present | Key decisions and observations documented |
| Context & Decisions table | Captures architectural choices with rationale |

**Goal Quality Examples:**
- ❌ "Improve authentication" (vague)
- ❌ "Make it better" (unmeasurable)
- ✅ "Add JWT authentication with refresh token support" (specific)
- ✅ "Migrate user table to PostgreSQL with zero downtime" (measurable)

### 4. Actionability

| Requirement | Check |
|-------------|-------|
| Tasks are specific | Clear what file/component is affected |
| No ambiguous tasks | Avoids "investigate" or "figure out" without scope |
| Dependencies clear | Sequential tasks show logical order |
| Implementation path obvious | Developer can start without clarification |

**Actionability Examples:**
- ❌ "Set up the backend" (too vague)
- ❌ "Make it work" (no implementation path)
- ✅ "Create `src/auth/jwt.ts` with sign/verify functions" (specific file)
- ✅ "Add bcrypt password hashing to `UserService.create()`" (clear scope)

---

## Severity Classification

| Severity | Icon | Criteria | Action Required |
|----------|------|----------|-----------------|
| Critical | 🔴 | Missing frontmatter, no goal, multiple CURRENT markers | Must fix before execution |
| Major | 🟠 | Missing citations for decisions, vague tasks, incomplete phases | Should fix |
| Minor | 🟡 | Formatting issues, missing notes, minor numbering errors | Nice to fix |
| Nitpick | 🟢 | Style preferences, wording suggestions | Optional |

---

## Output Format

Structure your plan review as:

```markdown
## Plan Review

### Files Reviewed
- `PLAN.md` (or plan content from `plan_read`)

### Overall Assessment
APPROVE | REQUEST_CHANGES | NEEDS_DISCUSSION

### Summary
2-3 sentence overview of plan quality.

### Issues

#### 🔴 Critical
- [Issue description with specific location]

#### 🟠 Major
- [Issue description with specific location]

#### 🟡 Minor
- [Issue description with specific location]

#### 🟢 Nitpick
- [Suggestion]

### Plan Protocol Compliance

| Check | Status |
|-------|--------|
| YAML frontmatter | PASS / FAIL |
| Goal section | PASS / FAIL |
| Phase status markers | PASS / FAIL |
| Single CURRENT marker | PASS / FAIL |
| Citation quality | PASS / FAIL |
| Task actionability | PASS / FAIL |

### Positive Observations
- [What's done well - always include at least one]
```

---

## What NOT to Do

- Do NOT evaluate code quality (that's code-review's job)
- Do NOT execute or modify the plan during review
- Do NOT approve plans with missing frontmatter
- Do NOT skip citation verification for decisions
- Do NOT accept vague goals or ambiguous tasks
- Do NOT forget to note positive observations

---

## Adherence Checklist

Before completing a plan review, verify:

- [ ] All 4 categories analyzed (Protocol, Citations, Completeness, Actionability)
- [ ] Severity assigned to each finding
- [ ] Specific locations noted for all issues
- [ ] Plan Protocol Compliance table completed
- [ ] Positive observations noted
- [ ] Output follows the standard format
