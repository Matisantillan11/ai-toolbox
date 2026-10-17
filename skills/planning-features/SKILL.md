---
name: planning-features
description: End-to-end feature planning. Runs feature-discovery to gather and document all requirements, then automatically hands off the resulting ClickUp ticket to plan-expert to break it into actionable subtasks. Use when starting work on any new feature from scratch.
allowed-tools: AskUserQuestion mcp__clickup__clickup_get_task mcp__clickup__clickup_create_task mcp__clickup__clickup_get_workspace_hierarchy TaskCreate TaskUpdate
effort: high
---

# planning-features

Run two preloaded skills in sequence in this context — execute their instructions directly, no subagents.

1. **`feature-discovery`** (full skill): seed description (from the message or by asking), all three question phases, confirmed spec, ClickUp offer.
   - Ticket created → capture `TICKET_ID`, `TICKET_URL`.
   - Declined → store the full confirmed spec as `FEATURE_SPEC`; `TICKET_ID = null`.
2. **`plan-expert`** (full skill): `--ticket-id <TICKET_ID>`, or if null `--description "<FEATURE_SPEC>"` (entire spec, not a summary).
3. When subtasks are created, output this and stop (no further suggestions):

```
## Planning Complete

**Feature:** <feature name>
**ClickUp Ticket:** <TICKET_URL if available, otherwise "not created">
**Ticket ID:** <TICKET_ID if available, otherwise "n/a">
**Subtasks created:** <count>

The feature has been fully documented and broken into an execution plan.
Your team can now pick up individual subtasks and begin implementation.
```
