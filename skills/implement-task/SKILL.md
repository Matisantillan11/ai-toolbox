---
name: implement-task
description: Implements a task end-to-end. Given a ClickUp ticket ID and an SDD produced by plan-expert, reads project context, builds a file-level implementation plan, writes the code, and commits it. Verification and PR creation are handled downstream by verify-task-agent and the orchestrator. Use when an SDD and ticket are ready for execution.
argument-hint: [--ticket-id <id>] [--base-branch <branch>]
allowed-tools: Glob Read Grep Write Edit Bash AskUserQuestion mcp__clickup__clickup_get_task TaskCreate TaskUpdate
effort: high
---

# implement-task

**Role:** Senior engineer. Plan at file level, write production code matching project conventions, commit. The SDD is the contract — implement exactly it, nothing more. Read every file before modifying it. If still ambiguous after reading context, ask rather than assume.

## Step 1 — Resolve input

Parse `$ARGUMENTS` for `--ticket-id` and `--base-branch`. The SDD is passed by the caller (`implement-task-agent`) alongside `$ARGUMENTS`. If absent, stop:
> "No SDD was provided. Run plan-expert first to generate the Software Design Document for this task."

**Case A — `--ticket-id` provided:** `mcp__clickup__clickup_get_task { task_id: "<ticket-id>" }`; extract `name`, `description`, `status`, `assignees`, `subtasks`. If the fetch fails, stop: "Could not fetch ticket `<id>`. Check the ID or ClickUp MCP access."

- **Has subtasks:** parent task. Fetch each subtask in full, build ordered `SUBTASK_LIST` (ClickUp order), parse each description with the 8-section plan-expert template (Context, What to implement, Where, Acceptance criteria, Out of scope, Depends on, Technical notes, Definition of done). Store `PARENT_TICKET_ID`, `PARENT_TICKET_NAME`, `SUBTASK_LIST`; set `MULTI_SUBTASK_MODE = true`; go to Step 1b.
- **No subtasks:** leaf task. Parse the 8-section template if present. `MULTI_SUBTASK_MODE = false`, `CURRENT_TASK = this ticket`; go to Step 2.

**Case B — neither ticket nor SDD:** `AskUserQuestion` (header "Implement task", question "What do you want to implement? Provide a ClickUp ticket ID. (An SDD is required — run plan-expert first if you don't have one.)", option `I have a ClickUp ticket ID`). A ticket ID → Case A.

## Step 1b — Multi-subtask orchestration (only when `MULTI_SUBTASK_MODE = true`)

`BASE_BRANCH` = `--base-branch`, else first remote of `main` → `master` → `develop` → `staging`. Create the parent branch and store it as `PREVIOUS_BRANCH`:
```bash
git checkout <BASE_BRANCH>
git checkout -b feat/CU-<PARENT_TICKET_ID>-<slug-of-parent-name>
```

Present the plan:
```
## Multi-subtask implementation plan

Parent: <PARENT_TICKET_NAME> (CU-<PARENT_TICKET_ID>)
Base branch: <BASE_BRANCH>
Parent branch: feat/CU-<PARENT_TICKET_ID>-<slug>

Subtasks to implement in order:
1. <subtask 1 name> (CU-<id>)  →  branch from: <PARENT_BRANCH>
2. <subtask 2 name> (CU-<id>)  →  branch from: subtask 1 branch
...

Each subtask gets its own branch and commit. PRs are opened after verification.
```
Ask "Does this order look correct? Confirm to start implementing, or describe what to change." and wait. Then for each subtask in order: `CURRENT_TASK` = subtask, `CURRENT_BASE = PREVIOUS_BRANCH`, run Steps 2–7 (using `CURRENT_BASE` as base branch), then `PREVIOUS_BRANCH` = the new subtask branch. Never start N+1 before N is committed.

After all are committed, output this instead of Step 8, then stop:
```
## Implementation Complete — Awaiting Verification

**Parent:** <PARENT_TICKET_NAME> (CU-<PARENT_TICKET_ID>)
**Base branch:** <BASE_BRANCH>
**Parent branch:** feat/CU-<PARENT_TICKET_ID>-<slug>

### Committed Subtasks

| # | Subtask | Branch | Commit |
|---|---------|--------|--------|
| 1 | <name> | <branch> | <short SHA> |

### Merge order
Each subtask branch targets its predecessor. Verify and open PRs in the order listed.

### Known gaps or follow-up
<any subtask whose Definition of done could not be fully addressed, or "None">
```

## Step 2 — Load project context

- Project instructions (stack, conventions, dev commands): use `PROJECT_CONTEXT` if the caller passed it; otherwise read `AGENTS.md` at the project root, or `CLAUDE.md` if `AGENTS.md` does not exist.
- `DESIGN.md` — token contract. Read values only from its YAML front matter (`colors`, `typography`, `rounded`, `spacing`, `components`) and obey `## Do's and Don'ts`. Never hardcode a value that has a token; if none exists, extrapolate from confirmed neighbours and add a one-line `// extrapolated from DESIGN.md` comment.
- If `.storybook/` exists, every new or changed UI component ships a co-located story and spec per the `design-system-docs` skill's `references/storybook-baseline.md` §6–7 (CSF3, `AllVariants` first when there is more than one variant axis, `fn()` callbacks, `play` interaction tests).

Without these files, infer conventions in Step 3. If they conflict with the SDD **Architecture** / **Interface Contracts**, surface it before writing code.

## Step 3 — Understand the affected area (mandatory)

Locate files via the SDD **Architecture** and the ticket's **Where**. Glob the area, read relevant files in full (components, services, routes, tests, types), grep referenced names/imports. Identify naming conventions, how similar features are structured, reusable utilities/hooks/services, and test patterns (location, library, naming).

## Step 4 — Implementation plan

```
## Implementation Plan: <task name>

### SDD reference
<SDD sections this plan implements — Architecture, Data Model, Interface Contracts>

### New files to create
- `<path/to/file>` — <one-line purpose, matching SDD>

### Files to modify
- `<path/to/file>` — <what changes and why, tied to SDD>

### Files to delete
- `<path/to/file>` — <why>

### Commands to run
- <e.g. migration, type generation, lock file update>

### Out of scope (will not touch)
- <from SDD Out of Scope or ticket's Out of scope>
```
Never implement anything in SDD **Out of Scope**. Ask "Does this implementation plan look correct? Confirm to start, or describe what to change." and write no code until approved.

## Step 5 — Feature branch

Name: `<type>/CU-<id>-<slug>` — type `feat/` `fix/` `refactor/` `docs/` `chore/`; `CU-<id>-` only if a ticket exists; slug lowercase-hyphenated, max 40 chars. Source: the inferred base branch (`main` / `master` / `develop`) for a single task, `CURRENT_BASE` in multi-subtask mode.
```bash
git checkout <source branch>
git checkout -b <type>/CU-<id>-<slug>
```
If the branch already exists locally, `git checkout <branch>`.

## Step 6 — Implement

Execute the plan in order.
- New files: follow Step 3 conventions; Interface Contracts define shape, Architecture defines layer; reuse existing utilities; match adjacent style (indentation, import order, exports).
- Modified files: re-read immediately before editing; minimum change; no unrelated refactors or reformatting.
- Commands: use the project's dev commands; on failure fix the root cause, never skip.

Final pass: re-read every touched file, check conventions, confirm each **Acceptance criterion** is addressed and nothing contradicts the SDD.

## Step 7 — Commit

**If the caller passed `no_commit: true`:** do not stage or commit. Run `git status --porcelain`, list every modified and untracked file under **Files changed** in Step 8, and replace the **Commit** line with `**Commit:** none (no_commit — left for the user to review)`.

Otherwise stage only task files (`git add <file1> <file2> ...`, never `git add .`) and commit with Conventional Commits:
```
<type>(<scope>): <short imperative description>

<body — bullet per meaningful change>

Refs: <ticket ID or "n/a">
```
If a pre-commit hook rejects it, fix and recommit. Never `--no-verify`.

## Step 8 — Report

```
## Implementation Complete — Awaiting Verification

**Task:** <task name>
**Branch:** <branch name>
**Commit:** <short SHA>

### What was implemented
<bullets — add | update | fix | refactor | delete>

### SDD alignment
<per Interface Contract / Architecture decision: how the code satisfies it>

### Acceptance criteria addressed
<per criterion: ✅ Implemented | ⚠️ Partial — <note> | ❌ Not implemented — <reason>>

### Known gaps or follow-up
<unfinished Definition of done items, or "None">

> Verification (lint, type check, tests, code-review, SDD acceptance criteria) will run in the next step.
```

## Constraints

- Never call `plan-expert`, run verification (lint, type check, tests, code-review — that is `verify-task-agent`), or open a PR (orchestrator does after verification).
- Never modify files outside the approved plan without re-confirming with the user.
- Never disable project lint/type/test commands; never commit secrets, `.env` files, or build artifacts.
- If the task is significantly larger than the SDD suggests, stop: "After reading the codebase, this task is larger than the SDD describes. Here is what I found: <summary>. Should I proceed, adjust the scope, or update the SDD?"
