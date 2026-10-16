---
name: design-system-setup
description: End-to-end design system setup. Runs design-expert to write a canonical DESIGN.md (YAML token front matter + fixed-order body), gates on its validation, runs design-system-docs to audit Storybook against the baseline (Storybook 10, addon-docs/a11y/vitest, Chromatic, CSF3 co-located stories with AllVariants + play tests, Foundations MDX) or plan its setup, then uses plan-expert to turn every finding into tracked subtasks. Use when starting or improving the design system in a project.
allowed-tools: Glob Read Grep Write Bash AskUserQuestion mcp__clickup__clickup_get_workspace_hierarchy mcp__clickup__clickup_get_task mcp__clickup__clickup_create_task TaskCreate TaskUpdate
effort: high
---

# design-system-setup

You are a design system orchestrator. You run three skills in sequence within this context. The skills are preloaded — execute their instructions directly, do not spawn subagents.

---

## Phase 1 — Design Documentation (`design-expert`)

Run the full `design-expert` skill as defined in its SKILL.md, including its `references/design-md-template.md`.

- Load project instructions (`PROJECT_CONTEXT` if passed; otherwise `AGENTS.md`, else `CLAUDE.md`) and the existing `DESIGN.md`.
- Run the complete discovery (Step 2) and extraction (Step 3) — no step is skipped because a `DESIGN.md` already exists.
- Write `DESIGN.md` in the canonical format and run its validation gate.

**Gate:** do not start Phase 2 until the design-expert validation gate reports `passed`. If an item cannot pass because the source genuinely lacks the data, it must be marked `_Not yet defined_` — that counts as passing; an unresolved `{group.key}` reference or a broken front matter does not.

Store the written file as `DESIGN_MD_CONTENT` and proceed. Do not ask the user whether to continue.

---

## Phase 2 — Storybook Audit or Plan (`design-system-docs`)

Run the full `design-system-docs` skill as defined in its SKILL.md, measuring against `references/storybook-baseline.md`.

- Storybook present → Section A: every check A1–A8, severity per A9, report per A10.
- Storybook absent → Section B: framework package, inventory, and the 5-phase setup plan with final file contents.
- Pass `DESIGN_MD_CONTENT` as context so the Foundations check (A8) and plan (Phase 3) compare against the file just written, not a stale copy.

Once the skill completes, capture the entire output as `PHASE2_OUTPUT`. This is the raw material for Phase 3.

Present the Phase 2 output to the user, then use `AskUserQuestion` with:
- Header: "Plan the work"
- Question: "How would you like to track the tasks for this work?"
- Options:
  - `ClickUp` — create a parent ticket and subtasks in ClickUp
  - `Local files` — generate a task plan as local Markdown files
  - `Skip` — no task tracking, finish here

Capture the choice as `TASK_MODE` and proceed to Phase 3.

---

## Phase 3 — Task Creation (`plan-expert`)

If `TASK_MODE` is `Skip`, go directly to [Finish](#finish).

---

### Branch A — ClickUp (`TASK_MODE = ClickUp`)

#### 3A.1 — Ask for workspace and list

Before fetching anything, use `AskUserQuestion` to ask the user for their ClickUp workspace name or ID:

- Header: "ClickUp workspace"
- Question: "Which ClickUp workspace should this ticket be created in? Enter the workspace name or ID."
- Accept free-form text. Capture the answer as `WORKSPACE_INPUT`.

Then fetch the workspace hierarchy to resolve available spaces and lists:

```
mcp__clickup__clickup_get_workspace_hierarchy {}
```

Use the hierarchy response to find the workspace that matches `WORKSPACE_INPUT` (by name or ID). If no match is found, inform the user and ask them to confirm the workspace name or ID before continuing.

Once the workspace is resolved, use `AskUserQuestion` to ask the user to pick the destination list:

- Header: "ClickUp list"
- Question: "Which list should the parent ticket be created in?"
- Options: build from the resolved workspace hierarchy (Space → Folder → List). Show at most 6 options; include an "Other (type list ID)" option for anything not listed.

Capture the selected value as `LIST_ID`. Do not proceed to 3A.2 until both `WORKSPACE_INPUT` and `LIST_ID` are confirmed.

#### 3A.2 — Create the parent ticket

Determine the ticket title based on the Phase 2 branch:

- **Storybook already exists (Section A was run):** `"Improve Storybook implementation"`
- **No Storybook found (Section B was run):** `"Set up Storybook and design system documentation"`

Build the ticket description from `PHASE2_OUTPUT`:
- Section A: baseline score, coverage %, then every ❌ Critical and ⚠️ High finding verbatim (path — current → expected)
- Section B: context block plus the 5-phase overview
- Both: link the baseline as the acceptance target — "Done = every check in design-system-docs A1–A8 passes"

```
mcp__clickup__clickup_create_task {
  list_id: "<LIST_ID>",
  name: "<ticket title>",
  description: "<summary from PHASE2_OUTPUT>"
}
```

Capture `PARENT_TICKET_ID` and `PARENT_TICKET_URL`.

#### 3A.3 — Execute `plan-expert`

Run the full `plan-expert` skill as defined in its SKILL.md, passing:

- `--ticket-id <PARENT_TICKET_ID>`
- `--description "<PHASE2_OUTPUT>"` — pass the full Phase 2 output so plan-expert has complete context

Decomposition rules plan-expert must apply:
- One subtask per config file group (dependencies + scripts, `.storybook/*`, Vitest config) and one per Foundations page.
- One subtask per UI component gap, each listing its required stories, `play` tests and spec from the coverage table.
- Each subtask's acceptance criteria quote the baseline checks it closes.
- Order: DESIGN.md fixes → config → Foundations → core primitives → composites → CI gate.

The skill will present the subtask plan for confirmation, wait for approval, then create all subtasks on the parent ticket. Do not skip the confirmation step — `plan-expert` owns it.

---

### Branch B — Local files (`TASK_MODE = Local files`)

#### 3B.1 — Execute `plan-expert`

Run the full `plan-expert` skill as defined in its SKILL.md, passing only:

- `--description "<PHASE2_OUTPUT>"` — pass the full Phase 2 output as the planning input

The skill will decompose the work into subtasks, present the plan for confirmation, and on approval create local task files for the session. Do not skip the confirmation step — `plan-expert` owns it.

---

## Finish

Once all phases are complete, output this summary and stop:

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

Do not suggest further steps or offer to continue.
