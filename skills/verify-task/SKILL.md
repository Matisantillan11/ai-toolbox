---
name: verify-task
description: Verifies a completed implementation against its SDD. Runs automated checks (lint, type check, tests), code-review, and validates every acceptance criterion defined in the SDD. Returns a structured pass/fail verification report. Invoked only by verify-task-agent.
argument-hint: [--branch <branch>] [--base-branch <base>] [--ticket-id <id>] [--diff-scope working_tree]
allowed-tools: Glob Read Grep Bash mcp__clickup__clickup_get_task
effort: medium
---

# verify-task

**Role:** QA engineer and final gate before a PR. Find gaps, never fill them: read-only, report every failing check and unmet criterion so `implement-task-agent` can fix them.

## Step 1 — Load context

Parse `$ARGUMENTS` for `--branch`, `--base-branch`, `--ticket-id`, `--diff-scope`.

- **SDD:** passed directly by the caller. If missing or without a non-empty **System-Level Acceptance Criteria** section, stop: "SDD is missing or has no System-Level Acceptance Criteria. Cannot verify."
- **Ticket:** if `--ticket-id`, `mcp__clickup__clickup_get_task { task_id: "<ticket-id>" }` for the task and all subtasks; parse each subtask's **Acceptance criteria** section (8-section template).
- **Commands** (lint, type check, test runner, test file pattern): from `PROJECT_CONTEXT` if the caller passed it; otherwise read `AGENTS.md` at the project root, or `CLAUDE.md` if `AGENTS.md` does not exist. If undefined, infer from `package.json`, `Makefile`, `pyproject.toml`, etc. and note the inference in the report.
- `VERIFICATION_BRANCH` = `--branch`; `BASE_BRANCH` = `--base-branch`, else first remote of `main` → `master` → `develop`.

## Step 2 — Automated checks

`CHANGED_FILES` = `git diff --name-only <BASE_BRANCH>...<VERIFICATION_BRANCH>`.

**If `--diff-scope working_tree`:** the work is intentionally uncommitted; `CHANGED_FILES` = union of `git diff --name-only HEAD` and `git ls-files --others --exclude-standard`. Never stage files to inspect them; read diffs with `git diff HEAD -- <file>` and untracked files in full.

Run every check even if an earlier one fails; on FAIL record details and continue.
- **2a Lint:** `<lint command> <changed files>`. Record each error as `file:line — message`.
- **2b Type check:** `<type check command>`. Record every error.
- **2c Tests:** `<test command> <affected test pattern>` (match `CHANGED_FILES` to the project's test naming). If `CHANGED_FILES` includes `*.stories.*` and the project has a Storybook Vitest project (`storybook` project in `vitest.config.*` or a `test:storybook` script), also run it (e.g. `<pm> test:storybook` or `<pm> vitest run --project=storybook`) — this runs `play` tests and a11y addon checks; an unrun story is unverified. Record failing test names and output.

## Step 3 — Code review

Run the full `code-review` skill with `--base-branch <BASE_BRANCH>`. **If `--diff-scope working_tree`:** review `CHANGED_FILES` instead — `git diff HEAD -- <file>` for modified, full content for untracked; never stage or commit to make them visible. Do not apply fixes. Classify each finding ❌ **Error** (blocks PASS) or ⚠️ **Warning** (deferred).

## Step 4 — Acceptance criteria

For each SDD **System-Level Acceptance Criteria** item (4a) and each fetched subtask's **Acceptance criteria** (4b), locate the code (Grep/Glob/Read) and classify: ✅ **Met** (cite file/line — required), ⚠️ **Partial** (note what is missing), ❌ **Not Met**.

## Step 5 — Report

```
## Verification Report

**Branch:** <VERIFICATION_BRANCH>
**Base:** <BASE_BRANCH> | **Diff scope:** working tree (uncommitted + untracked vs HEAD)
**Verdict:** ✅ PASS | ❌ FAIL

### Automated Checks

| Check       | Status            |
|-------------|-------------------|
| Lint        | ✅ PASS / ❌ FAIL |
| Type Check  | ✅ PASS / ❌ FAIL |
| Tests       | ✅ PASS / ❌ FAIL |

<errors per check, if any>

### Code Review Findings
<"No issues found." or each ❌ Error / ⚠️ Warning with file:line>

### SDD System-Level Acceptance Criteria
- ✅ / ⚠️ / ❌  <criterion text> — <evidence or gap note>

### Subtask Acceptance Criteria
#### Subtask 1 — <name>
- ✅ / ⚠️ / ❌  <criterion>

### Blocking Issues
<Numbered ❌ items to resolve before a PR, or "None — ready for PR.">

### Deferred Warnings
<Numbered ⚠️ items with justification, or "None.">
```
(Show the **Diff scope** part only for working tree runs.)

**Verdict:** PASS iff 2a, 2b, 2c all pass, no ❌ code-review Error, and no ❌ Not Met in 4a/4b. Any single ❌ = FAIL.

## Step 6 — Return

PASS (signals the PR can be opened):
```yaml
verification_status: pass
branch: <VERIFICATION_BRANCH>
base_branch: <BASE_BRANCH>
report: <full report from Step 5>
```

FAIL (orchestrator routes `blocking_issues` back to `implement-task-agent`):
```yaml
verification_status: fail
branch: <VERIFICATION_BRANCH>
blocking_issues: <numbered list from "Blocking Issues" section>
report: <full report from Step 5>
```

## Constraints

- Never create, edit, or delete files; only run shell commands.
- Never open a PR — the orchestrator does after `verification_status: pass`.
