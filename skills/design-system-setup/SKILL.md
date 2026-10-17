---
name: design-system-setup
description: End-to-end design system setup. Runs design-expert to write a canonical DESIGN.md (YAML token front matter + fixed-order body), gates on its validation, runs design-system-docs to audit Storybook against the baseline (Storybook 10, addon-docs/a11y/vitest, Chromatic, CSF3 co-located stories with AllVariants + play tests, Foundations MDX) or plan its setup, then uses plan-expert to turn every finding into tracked subtasks. Use when starting or improving the design system in a project.
allowed-tools: Glob Read Grep Write Bash AskUserQuestion mcp__clickup__clickup_get_workspace_hierarchy mcp__clickup__clickup_get_task mcp__clickup__clickup_create_task TaskCreate TaskUpdate
effort: high
---

# design-system-setup

Run three preloaded skills in sequence in this context — execute their instructions directly, no subagents.

## Phase 1 — `design-expert`

Run the full skill (incl. `references/design-md-template.md`): load project instructions (`PROJECT_CONTEXT` if passed; else `AGENTS.md`, else `CLAUDE.md`) and any existing `DESIGN.md`; run full discovery (Step 2) and extraction (Step 3) even if `DESIGN.md` exists; write `DESIGN.md` and run its validation gate.

**Gate:** start Phase 2 only when the gate reports `passed`. Items marked `_Not yet defined_` because source lacks data count as passing; unresolved `{group.key}` references or broken front matter do not.

Store the file as `DESIGN_MD_CONTENT` and continue without asking.

## Phase 2 — `design-system-docs`

Run the full skill against `references/storybook-baseline.md`:
- Storybook present → Section A (A1–A8, severity A9, report A10).
- Absent → Section B (framework package, inventory, 5-phase plan with final file contents).
- Use `DESIGN_MD_CONTENT` for the Foundations check (A8) / plan Phase 3, not a stale copy.

Capture the full output as `PHASE2_OUTPUT`, present it, then `AskUserQuestion`:
- Header "Plan the work": "How would you like to track the tasks for this work?"
- `ClickUp` — create a parent ticket and subtasks in ClickUp · `Local files` — generate a task plan as local Markdown files · `Skip` — no task tracking, finish here

Store as `TASK_MODE`.

## Phase 3 — `plan-expert`

`Skip` → go to Finish.

### Branch A — ClickUp

**3A.1 Workspace and list**
1. `AskUserQuestion` header "ClickUp workspace": "Which ClickUp workspace should this ticket be created in? Enter the workspace name or ID." (free text) → `WORKSPACE_INPUT`.
2. `mcp__clickup__clickup_get_workspace_hierarchy {}`; match `WORKSPACE_INPUT` by name or ID. No match → tell the user and ask them to confirm before continuing.
3. `AskUserQuestion` header "ClickUp list": "Which list should the parent ticket be created in?" — up to 6 options from Space → Folder → List, plus "Other (type list ID)" → `LIST_ID`.

Proceed only once both are confirmed.

**3A.2 Parent ticket**
- Title: Section A ran → `"Improve Storybook implementation"`; Section B ran → `"Set up Storybook and design system documentation"`.
- Description from `PHASE2_OUTPUT`: Section A → baseline score, coverage %, every ❌ Critical and ⚠️ High finding verbatim (path — current → expected); Section B → context block + 5-phase overview. Both: "Done = every check in design-system-docs A1–A8 passes".
- `mcp__clickup__clickup_create_task { list_id: "<LIST_ID>", name: "<title>", description: "<summary>" }` → `PARENT_TICKET_ID`, `PARENT_TICKET_URL`.

**3A.3 Run `plan-expert`** with `--ticket-id <PARENT_TICKET_ID>` and `--description "<PHASE2_OUTPUT>"` (full output). Decomposition:
- One subtask per config file group (dependencies + scripts, `.storybook/*`, Vitest config) and one per Foundations page.
- One subtask per UI component gap, listing its required stories, `play` tests and spec from the coverage table.
- Acceptance criteria quote the baseline checks each subtask closes.
- Order: DESIGN.md fixes → config → Foundations → core primitives → composites → CI gate.

`plan-expert` owns the confirmation step (present plan, wait for approval, then create subtasks on the parent) — never skip it.

### Branch B — Local files

Run `plan-expert` with only `--description "<PHASE2_OUTPUT>"`. It decomposes, asks for confirmation (never skip), and on approval creates local task files for the session.

## Finish

Output and stop — no further suggestions:

```
## Design System Setup Complete

### Phase 1 — Design Documentation
DESIGN.md written / updated at the project root — validation gate passed.

### Phase 2 — Storybook
[Storybook audit — baseline score X/Y, coverage Z%, N critical / M high findings]
  OR
[Storybook implementation plan produced — 5 phases defined]

### Phase 3 — Task Plan
[ClickUp] Parent ticket: <PARENT_TICKET_URL> — Subtasks created: <count>
  OR
[Local files] <count> tasks created for this session
  OR
[Skipped]
```
