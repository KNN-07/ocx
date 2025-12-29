---
description: Display the current implementation plan
agent: plan
---

Read the current plan from the session workspace using `plan_read` and display it in a clear, formatted way.

If a plan exists, show:
1. The overall goal
2. Each phase with its status (use emoji: ✅ complete, 🔄 in_progress, ⏳ pending, 🚫 blocked)
3. The steps within each phase
4. Any dependencies between phases

If no plan exists, state that clearly and suggest using @plan to create one.

Format the output for terminal readability with clear sections and indentation.
