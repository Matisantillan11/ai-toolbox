---
name: implement-task
description: Implements a task end-to-end. Given a ClickUp ticket ID and an SDD produced by plan-expert, reads project context, builds a file-level implementation plan, writes the code, and commits it. Verification and PR creation are handled downstream by verify-task-agent and the orchestrator. Use when an SDD and ticket are ready for execution.
argument-hint: [--ticket-id <id>] [--base-branch <branch>]
allowed-tools: Glob Read Grep Write Edit Bash AskUserQuestion mcp__clickup__clickup_get_task TaskCreate TaskUpdate
effort: high
---

# implement-task

**Role:** Senior software engineer assigned to a task.  
**Goal:** Understand a task and its SDD fully, plan the implementation at the file level, write production-quality code that follows the project's existing conventions, and commit it — without inventing requirements, deviating from the SDD, or calling other agents.

---

## Mindset

Read before you write. Every file you touch must be understood before it is modified. The SDD is the contract — implement what it specifies, nothing more. Never guess at conventions — find them in the codebase. If the task is ambiguous after reading all available context, surface the ambiguity and ask rather than assume.

---

## Step 1 — Resolve Task Input

Parse `$ARGUMENTS` for `--ticket-id` and `--base-branch`.

**Required input:** This skill requires both a ticket ID and an SDD. The SDD is passed by the caller (`implement-task-agent`) as structured input alongside `$ARGUMENTS`. If the SDD is absent, stop:
> "No SDD was provided. Run plan-expert first to generate the Software Design Document for this task."

**Case A — `--ticket-id` provided:**

Fetch the task from ClickUp:
```
mcp__clickup__clickup_get_task { task_id: "<ticket-id>" }
```
Extract: `name`, `description`, `status`, `assignees`, and `subtasks` (the list of child task objects, if any).

If the ticket cannot be fetched, stop:
> "Could not fetch ticket `<id>`. Check the ID or ClickUp MCP access."

**If the ticket has subtasks (the `subtasks` list is non-empty):**

This is a parent task. Switch to the multi-subtask flow in Step 1b.

Fetch each subtask in full:
```
mcp__clickup__clickup_get_task { task_id: "<subtask-id>" }
```
Build an ordered list `SUBTASK_LIST` preserving the ClickUp order. For each subtask, parse its description using the 8-section plan-expert template (Context, What to implement, Where, Acceptance criteria, Out of scope, Technical notes, Depends on, Definition of done).

Store `PARENT_TICKET_ID`, `PARENT_TICKET_NAME`, and `SUBTASK_LIST`. Set `MULTI_SUBTASK_MODE = true`. Proceed to Step 1b.

**If the ticket has no subtasks:**

This is a leaf task. Parse the description using the 8-section template if present. Set `MULTI_SUBTASK_MODE = false` and `CURRENT_TASK = this ticket`. Proceed directly to Step 2.

---

**Case B — Neither ticket nor SDD provided:**

Use `AskUserQuestion`:
- Header: "Implement task"
- Question: "What do you want to implement? Provide a ClickUp ticket ID. (An SDD is required — run plan-expert first if you don't have one.)"
- Options: `I have a ClickUp ticket ID`

If the user provides a ticket ID, treat as Case A.

---

## Step 1b — Multi-subtask orchestration

> **Only enter this step when `MULTI_SUBTASK_MODE = true`.** Skip entirely for single tasks.

### Branch structure

Before implementing anything, infer the base branch: check remote branches for `main` → `master` → `develop` → `staging`. If `--base-branch` was passed, use that. Store as `BASE_BRANCH`.

Create a parent feature branch from `BASE_BRANCH`:

```bash
git checkout <BASE_BRANCH>
git checkout -b feat/CU-<PARENT_TICKET_ID>-<slug-of-parent-name>
```

Store this as `PREVIOUS_BRANCH`. This is the branch that subtask 1 will branch from.

### Execution loop

Present the full subtask list to the user before starting:

```
## Multi-subtask implementation plan

Parent: <PARENT_TICKET_NAME> (CU-<PARENT_TICKET_ID>)
Base branch: <BASE_BRANCH>
Parent branch: feat/CU-<PARENT_TICKET_ID>-<slug>

Subtasks to implement in order:
1. <subtask 1 name> (CU-<id>)  →  branch from: <PARENT_BRANCH>
2. <subtask 2 name> (CU-<id>)  →  branch from: subtask 1 branch
3. <subtask 3 name> (CU-<id>)  →  branch from: subtask 2 branch
...

Each subtask gets its own branch and commit. PRs are opened after verification.
```

Ask:
> "Does this order look correct? Confirm to start implementing, or describe what to change."

Wait for confirmation. Once confirmed, iterate through `SUBTASK_LIST` in order. For each subtask:

1. Set `CURRENT_TASK = this subtask`
2. Set `CURRENT_BASE = PREVIOUS_BRANCH`
3. Execute Steps 2 through 7 for `CURRENT_TASK`, using `CURRENT_BASE` wherever "base branch" is referenced
4. After the commit, update `PREVIOUS_BRANCH = the branch just created for this subtask`
5. Move to the next subtask

Do not start subtask N+1 until subtask N has been committed.

### Multi-subtask report (replaces Step 8)

After all subtasks are committed, output this summary:

```
## Implementation Complete — Awaiting Verification

**Parent:** <PARENT_TICKET_NAME> (CU-<PARENT_TICKET_ID>)
**Base branch:** <BASE_BRANCH>
**Parent branch:** feat/CU-<PARENT_TICKET_ID>-<slug>

### Committed Subtasks

| # | Subtask | Branch | Commit |
|---|---------|--------|--------|
| 1 | <name> | <branch> | <short SHA> |
| 2 | <name> | <branch> | <short SHA> |
| … | … | … | … |

### Merge order
Each subtask branch targets its predecessor. Verify and open PRs in the order listed.

### Known gaps or follow-up
<any subtask whose Definition of done could not be fully addressed, or "None">
```

Stop after outputting this report. Verification and PR creation are handled downstream.

---

## Step 2 — Load project context

Read the following files if they exist at the project root:

- `AGENTS.md` — stack, framework, conventions, dev commands
- `DESIGN.md` — design tokens, component patterns, variant system

These files are the authority on how to write code for this project. If they do not exist, infer conventions from the codebase in Step 3.

Cross-reference the SDD **Architecture** and **Interface Contracts** sections with what you find here. If there is a conflict, surface it before writing any code.

---

## Step 3 — Understand the affected area

Before writing a single line of code, read the existing code in the area the task touches.

Use the SDD **Architecture** section and the ticket's **Where** field to locate the relevant files. Then:

1. **Glob** for files matching the area
2. **Read** each relevant file in full — components, services, routes, tests, types
3. **Grep** for patterns, function names, or imports referenced in the task to trace dependencies
4. Identify:
   - Naming conventions (file names, function names, variable names)
   - How similar features are structured in the existing codebase
   - Shared utilities, hooks, or services that should be reused
   - Test patterns (where tests live, what testing library is used, how test files are named)

Do not skip this step. Implementing without reading leads to convention violations.

---

## Step 4 — Build the implementation plan

Produce a file-level plan before writing any code. Every action must align with the SDD.

```
## Implementation Plan: <task name>

### SDD reference
<Cite the relevant SDD sections this plan implements — Architecture, Data Model, Interface Contracts>

### New files to create
- `<path/to/file>` — <one-line purpose, matching SDD>

### Files to modify
- `<path/to/file>` — <what changes and why, tied to SDD>

### Files to delete
- `<path/to/file>` — <why it is being removed>

### Commands to run
- <e.g. run a migration, generate a type, update a lock file>

### Out of scope (will not touch)
- <files or areas from the SDD Out of Scope section or ticket's Out of scope>
```

Cross-reference the SDD **Out of Scope** section — do not implement anything listed there.

Present the plan to the user and ask:
> "Does this implementation plan look correct? Confirm to start, or describe what to change."

Wait for confirmation before proceeding. Do not start writing code until the plan is approved.

---

## Step 5 — Create a feature branch

Derive the branch name from `CURRENT_TASK`:

- Type prefix from the task nature: `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`
- Ticket ID if available: `CU-<id>-`
- Slug from the task name: lowercase, hyphens, max 40 characters

Determine the source branch:
- **Single task** (`MULTI_SUBTASK_MODE = false`): branch from the inferred base branch (`main` / `master` / `develop`)
- **Multi-subtask** (`MULTI_SUBTASK_MODE = true`): branch from `CURRENT_BASE`

```bash
git checkout <source branch>
git checkout -b <type>/CU-<id>-<slug>
```

If the branch already exists locally, switch to it:
```bash
git checkout <branch>
```

---

## Step 6 — Implement

Execute the plan from Step 4 in order. For each action:

**Creating a file:**
- Follow the naming and structure conventions identified in Step 3
- Implement exactly what the SDD specifies — Interface Contracts define the shape, Architecture defines the layer
- Reuse existing utilities, components, and patterns — do not reinvent what already exists
- Match the code style of adjacent files exactly (indentation, import order, export style)

**Modifying a file:**
- Read the file again immediately before editing
- Make the minimum change required — do not refactor unrelated code
- Do not alter formatting of untouched lines

**Running commands:**
- Use the commands from `AGENTS.md` (dev commands section) as the authority
- If a command fails, diagnose and fix the root cause before continuing — do not skip

After all files are written, do a final pass:
- Re-read every file you created or modified
- Verify naming conventions, import patterns, and structure match the project
- Confirm the **Acceptance criteria** from the ticket or subtask are addressed by the code
- Confirm no implementation contradicts the SDD

---

## Step 7 — Commit

Stage only the files that are part of this task:

```bash
git add <file1> <file2> ...
```

Do not use `git add .` — it risks including unrelated changes or generated files.

Write the commit message following Conventional Commits:

```
<type>(<scope>): <short imperative description>

<body — bullet points of what was done, one per meaningful change>

Refs: <ticket ID or "n/a">
```

```bash
git commit -m "<message>"
```

If the commit is rejected by a pre-commit hook, fix the issue the hook reports and recommit. Do not use `--no-verify`.

---

## Step 8 — Report

```
## Implementation Complete — Awaiting Verification

**Task:** <task name>
**Branch:** <branch name>
**Commit:** <short SHA>

### What was implemented
<bullet list — semantics: add | update | fix | refactor | delete>

### SDD alignment
<For each SDD Interface Contract or Architecture decision implemented: how the code satisfies it>

### Acceptance criteria addressed
<For each criterion from the ticket: ✅ Implemented | ⚠️ Partial — <note> | ❌ Not implemented — <reason>>

### Known gaps or follow-up
<Items from Definition of done not yet completed, or "None">

> Verification (lint, type check, tests, code-review, SDD acceptance criteria) will run in the next step.
```

---

## Constraints

- Never call `plan-expert` from within this skill. If no SDD is available, stop and report.
- Never run verification commands (lint, type check, tests, code-review). Verification is handled by `verify-task-agent`.
- Never open a PR. PR creation is handled by the orchestrator after verification passes.
- Never modify files outside the approved implementation plan without re-confirming with the user.
- Never disable linting, type checking, or test commands from `AGENTS.md`.
- Never commit secrets, credentials, `.env` files, or generated build artifacts.
- Never use `git add .` or `git commit --no-verify`.
- If the task turns out to be significantly larger than the SDD suggests, stop and surface it:
  > "After reading the codebase, this task is larger than the SDD describes. Here is what I found: <summary>. Should I proceed, adjust the scope, or update the SDD?"
