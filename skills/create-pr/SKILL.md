---
name: create-pr
description: Creates a GitHub pull request with a fully auto-populated standardized template. Infers the base branch, derives the description from the diff and commits, detects shared code impact, tags stakeholders from CODEOWNERS, and builds a concrete test plan from the changes. Designed to run without human input when called by an agent, or with a confirmation step when invoked directly.
argument-hint: [--base <branch>] [--ticket-id <id>] [--auto]
allowed-tools: Bash AskUserQuestion mcp__github__create_pull_request mcp__github__list_branches
effort: low
---

# create-pr

Generate a complete, reviewer-ready PR purely from git context (diff, commits, branch name, project files).

## Step 1 — Arguments

Parse `$ARGUMENTS`: `--base <branch>` (target; skips inference), `--ticket-id <id>` (optional ClickUp/issue ID), `--auto`. `AUTO_MODE = true` if `--auto` is present or when called by another skill/agent — then skip every confirmation.

## Step 2 — Git context

```bash
git branch --show-current
git remote get-url origin            # OWNER/REPO from git@github.com:owner/repo.git or https://github.com/owner/repo.git
git config user.email                # author, excluded from FYI
git branch -r --format='%(refname:short)' | sed 's/origin\///'
git log HEAD --oneline -20
# after BASE_BRANCH is resolved:
git diff <BASE_BRANCH>...HEAD --name-only
git diff <BASE_BRANCH>...HEAD --stat
git diff <BASE_BRANCH>...HEAD
```
If the working tree has uncommitted changes, warn: "Uncommitted changes detected. These will not be included in the PR. Commit them first or proceed anyway." In `AUTO_MODE`, proceed.

## Step 3 — Base branch

If `--base` was given, use it as `BASE_BRANCH` with no inference or confirmation (always correct when called by an agent). Otherwise first existing remote of: `main`, `master`, `develop`, `staging`, first `release/*`, else the most recently committed remote branch. If not `AUTO_MODE` and the result is not `main`/`master`, confirm: "Inferred base branch: `<branch>`. Is this correct?"

If current branch == `BASE_BRANCH`, stop: "The current branch is the same as the base branch. Switch to a feature branch first."

## Step 4 — Title

From the branch name: strip type prefix (`feat/` `fix/` `chore/` `refactor/` `docs/` `hotfix/`) and ticket/sprint/module prefix (`CU-abc123-`, `M3-S12-`); hyphens/underscores → spaces; title-case; prepend `[Feature]` `[Fix]` `[Refactor]` `[Docs]` `[Chore]` `[Hotfix]`; append `(<ticket id>)` if known (from `--ticket-id` or branch). E.g. `feat/CU-abc123-user-auth-flow` → `[Feature] User auth flow (CU-abc123)`.

## Step 5 — Populate the body

Read `templates/pull_request_template.md` in the **ai-toolbox** repo (where this skill lives) and use it as the exact skeleton — never add or remove sections except the two conditional ones below. Output must contain no instruction text or placeholder markers.

- **Description:** 2–4 bullets covering Why and What, each starting with exactly one of `add`, `update`, `fix`, `refactor`, `delete`. Rewrite commits as intent, don't paste them; name specific functions, components, routes.
- **Type of Change:** tick exactly one from the title label / branch prefix: Feature, Bug Fix (`fix/`), Refactor, Docs, Chore, Hotfix.
- **Related Ticket:** `https://app.clickup.com/t/<id>` from `--ticket-id` or the branch (e.g. `CU-abc123`); else `N/A`.
- **Module:** from branch + last 20 commits — Migration `M{N}` (`M1`, `migration-1`, `section-2`), Sprint `S{N}` (`S12`, `sprint-12`, `sprint/12`). If not found write `<!-- TBD -->`; never invent.
- **Shared Code Impact:** if a changed file is under `shared/`, `core/`, `common/`, `lib/`, `utils/`, `helpers/`, `hooks/`, `composables/`, `services/`, `types/`, `constants/` → **Yes**, list each path, add `Team notified: No`. Otherwise omit the section.
- **Breaking Changes:** changed/removed API params or responses, shared signature/interface changes, schema changes removing/altering columns, `BREAKING CHANGE:` or `type!:` commits → **Yes**, describe what breaks and the migration path. Otherwise omit the section.
- **FYI:** handles from `CODEOWNERS` (root or `.github/`) mapped to changed files, plus `git log <BASE_BRANCH>...HEAD --invert-grep -E --format="%ae" -- <changed files> | sort | uniq` mapped to handles (prefer CODEOWNERS handle). De-duplicate; **always remove the PR author** (`git config user.email`). If empty: `No additional stakeholders identified.`
- **Screenshots:** UI change = paths in `pages/`, `views/`, `routes/`, `screens/`, `app/`, `src/app/`; `.vue`, `.svelte`, `Page.`, `View.`, `Screen.`, `Layout.`; or components in route-level dirs. If UI: list each route/page with `https://github.com/<OWNER>/<REPO>/blob/<CURRENT_BRANCH>/.github/evidence/<filename>.png?raw=true` and note "Add screenshots at the paths above before requesting review." Else: `No UI changes in this PR.`
- **Test Plan:** ordered `- [ ] <imperative step>` list, one action each, every step derived from the actual diff (no generic "verify the app works"). Start at the real entry point (route, endpoint, action); happy path first, then ≥1 edge/error case when validation, error handling or conditionals changed; include setup (env vars, flags, seeds, migrations). Backend: method, endpoint, payload, expected response. UI: interaction and expected outcome. New tests: the exact run command (e.g. `npm test -- --testPathPattern=<file>`).
- **Release Readiness:** Ready for release: Yes if the test plan is expected to pass; Needs additional work: No unless known gaps/open questions exist.

## Step 6 — Render and confirm

Skeleton (must match the template file):
```markdown
## Description 📝
<populated description bullets>

### Type of Change
- [ ] Feature
- [ ] Bug Fix
- [ ] Refactor
- [ ] Docs
- [ ] Chore
- [ ] Hotfix

### Related Ticket
<ticket URL or "N/A">

### Module
- Migration: <M{N} or empty>
- Sprint: <S{N} or empty>

### Shared Code Impact
<Include only if Yes: file list and Team notified>

### Breaking Changes
<Include only if Yes: describe what breaks and the migration path>

### FYI 🙋
<@handles or "No additional stakeholders identified.">

### Screenshots 📸
<screenshot entries or "No UI changes in this PR.">

### Test Plan 🧪
<checkbox list>

### Release Readiness
- Ready for release: <Yes/No>
- Needs additional work: <Yes/No>
```
If not `AUTO_MODE`, show title and body and ask "Does this PR look correct? Reply Yes to create it, or paste corrections."; apply corrections.

## Step 7 — Create

```
mcp__github__create_pull_request { owner: "<OWNER>", repo: "<REPO>", title: "<PR title>", body: "<rendered PR body>", head: "<current branch>", base: "<BASE_BRANCH>" }
```

## Step 8 — Report

```
## Pull Request Created

Title:  <title>
URL:    <pr_url>
Base:   <BASE_BRANCH> <- <current branch>
Files:  <count> changed
```
Keep `PR_URL` and `PR_NUMBER` in context for downstream skills/agents.
