---
name: code-review
description: Two-phase code review. Phase 1 runs fast pre-commit checks for spec compliance, type safety, and stack alignment. Phase 2 audits SOLID principles and structural integrity. Use before committing or opening a PR.
argument-hint: [--base-branch <branch>]
allowed-tools: Read Grep Glob Bash
effort: high
---

# code-review

Phase 1: fast surface checks. Phase 2: structural audit (SOLID, KISS/DRY/YAGNI). Be thorough over fast.

Usage: `/code-review --base-branch <branch>` (e.g. `main`, `develop`, `origin/main`) reviews only files changed vs that base; with no argument, ask for the base. Stack-aware checks use the project instructions — if neither `AGENTS.md` nor `CLAUDE.md` exists (and no `PROJECT_CONTEXT`), suggest running `/init-project` first.

## Setup — Resolve base branch

Current branch: `!git branch --show-current`

Available local branches:
```
!git branch
```

1. If `$ARGUMENTS` contains `--base-branch <value>`, `BASE_BRANCH` = value; go to 3.
2. Otherwise `AskUserQuestion` (header "Base branch", question "Which branch should be used as the base for this review?"). Options from the branch list: always `main` plus local branches, max 4 (3 most relevant + "Other" for free input if more). If only the default exists, use it without asking.
3. Review only files from `git diff <BASE_BRANCH>...HEAD --name-only`. If empty: "No changes detected between the current branch and `<BASE_BRANCH>`." and stop.

## Phase 1 — Fast pre-commit check

- **Spec & logic:** matches requirements exactly (no more, no less); edge cases (empty, null/undefined, error boundaries); no `console.log`, commented-out code, or TODO without ticket.
- **Types & validation:** no unjustified `any`/`unknown` casts; external input (API responses, form data, env vars) validated at the boundary; types from a single source of truth.
- **Stack alignment:** per project instructions (use `PROJECT_CONTEXT` if the caller passed it; otherwise read `AGENTS.md` at the project root, or `CLAUDE.md` if `AGENTS.md` does not exist) — framework patterns (server/client components, lifecycle, routing), styling approach, data-access layer patterns.
- **Verification:** existing tests pass; new behavior has unit/integration coverage; observable evidence it works (test output, screenshot, logs).
- **Security:** no hardcoded secrets; no sensitive data in logs/errors; input validation prevents injection; dependencies up to date.
- **Performance:** no N+1 or unnecessary DB queries, API calls, or computation.

Any failure → fix and re-run Phase 1 before Phase 2.

## Phase 2 — Structural audit

| Gate | Fail signals | Action on fail |
|---|---|---|
| 1 SRP | God objects mixing UI/state/I/O; nesting >2 levels; side effects in "pure" functions; functions well over ~20 lines | Decompose into single-purpose, independently testable units |
| 2 OCP/LSP | `if/else`/`switch` chains that grow per type; subclasses throwing "Not Implemented" | Strategy pattern / polymorphism; extend via composition |
| 3 ISP/DIP | Fat interfaces forcing stubs; `new SpecificClass()` in constructors; third-party SDKs coupled into business logic | Dependency injection; split interfaces; wrap third-party deps behind an owned abstraction |
| 4 KISS/DRY/YAGNI | Duplicated logic; speculative over-engineering; magic numbers; single-use abstractions more complex than what they replace; abbreviated names (`ptr`, `tmp`, `idx`); related code not colocated | Inline needless abstractions; named constants; prefer duplication over a premature abstraction |

Critical patterns:
- **Dependency impact:** before any signature change, find every importer; update all dependents in the same change — no broken imports or downstream type errors.
- **Structural integrity:** unreachable code, dead exports, circular dependencies, file location per project structure. Run the project's lint and type-check commands; block completion if they fail.

## Reporting

```
## Code Review Results

### ❌ Errors (must fix)
- <specific issue, file:line, remediation>

### ⚠️ Warnings (should fix)
- <specific issue, file:line, remediation>

### ✅ Passed
- <what was verified>

### Recommendation
Approve / Request Changes — <one-line rationale>
```

If errors exist, ask "Should I apply the fixes?"; after fixing, re-run the relevant phase.
