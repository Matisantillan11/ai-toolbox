# Design-system workflow — design

Date: 2026-10-16
Status: draft, pending approval

## Intent

Frontend engineers spend most of their design-system time on three recurring jobs:

1. **Adding a new component** to the design system.
2. **Building a POC** by composing existing components, to explore an idea before it is implemented for real.
3. **Detecting reusable components** — finding what already exists (or is duplicated) before building anything.

The toolbox today only *documents and audits* the design system (`design-system-setup-agent`: design-expert → design-system-docs → plan-expert). Nothing helps with the day-to-day component work. This adds a `design-system` workflow for those three jobs, built on the conventions already encoded in `design-expert` (canonical `DESIGN.md`) and `design-system-docs` (`references/storybook-baseline.md`), which mirror the spar reference project.

## Goals

- One workflow that classifies the request into **component**, **POC** or **detect** mode and follows the matching path.
- Always ground the work in the project's `DESIGN.md`, Foundations docs and the existing component inventory before proposing anything.
- Recommend a composition pattern (e.g. [function-as-child](https://reactpatterns.js.org/docs/function-as-child-component/)) when it helps — always for POCs, for complex components in component mode, never for simple ones.
- Pause for the user's approval of the proposal before writing code.
- Produce code + spec test + Storybook story, verified, and **leave everything uncommitted** for the user to review.

## Non-goals

- No commit, no push, no PR. The user reviews the working tree and commits themselves.
- Not a replacement for `design-system-setup-agent` — documenting `DESIGN.md` and auditing/setting up Storybook stays there.
- No Figma / visual-design input.

## Anti-goals (failure even if it "works")

- Writing code before the user approved what gets built.
- A POC that leaks into the design system: imported from `components/ui/`, exported from the UI barrel, or added to `DESIGN.md`.
- A new design-system component built with raw values instead of `DESIGN.md` tokens, or shipped without its spec and story.
- Building a new component when an existing one could have been reused or extended.

## The three modes

| | **component** | **poc** | **detect** |
|---|---|---|---|
| Trigger examples | "add a Stepper component", "add a `loading` variant to Button" | "POC of a checkout summary using our components", "explore a filterable table" | "what components can I reuse for X?", "find duplicated components" |
| Location | `components/ui/<name>/` (or the project's UI dir from `AGENTS.md`) | `_pocs/<name>/` at the repo root | nothing written |
| Storybook title | `UI/<Name>` | `POCs/<Name>` | — |
| May use | `DESIGN.md` front-matter tokens only | existing design-system components + local pieces inside `_pocs/<name>/` | — |
| Pattern step | only if complex (wraps a multi-part headless primitive, needs compound/namespaced API, render delegation, or controlled/uncontrolled state) | always | skipped |
| Files | baseline §6 layout: `.component.tsx`, `.types.ts`, `-variants.constants.ts`, `.spec.tsx` + snapshot, `.stories.tsx`, `index.ts` | `<name>.poc.tsx` (+ local parts), `<name>.stories.tsx`; spec optional | report only |
| Story | baseline §7 contract (AllVariants first, `fn()` callbacks, `play` tests) | baseline §7 structure; `docs.description.component` states the chosen pattern, why, and what a future real implementation would look like | — |
| DESIGN.md | add/extend the entry under `## Components` (and `components:` front matter if confirmed tokens) | never touched | never touched |
| Ends with | uncommitted changes + review summary | uncommitted changes + review summary | reuse report |

**Extend vs new:** in component mode, detection may conclude the request is best served by extending an existing component (new variant/prop). That is still component mode; the proposal says "extend `Button`" and the code step edits that component, its spec and story.

**POC rules (also added to docs, see "Docs changes"):** POCs are explorations. App code never imports from `_pocs/`. Nothing in `components/ui/` imports from `_pocs/`. Promoting a POC means running the workflow again in component mode, using the POC's pattern recommendation as input. The workflow never deletes `_pocs/<name>/`; the review summary lists it as safe to remove once the component is approved.

## Pipeline

```
Analyze ──► (pause: proposal returned to user) ──► Implement ──► Verify ⇄ fix (≤3 rounds) ──► a11y gate ──► Review summary
   │
   └── detect mode ends here with the reuse report
```

### 1. Analyze (one agent hop)

Inputs: user request, `PROJECT_CONTEXT`, optional `mode` hint.

1. **Context:** read `DESIGN.md` (front matter + Do's and Don'ts), `FOUNDATIONS.md` if present, `stories/foundations.mdx`, `.storybook/main.*` and `preview.*`.
2. **Inventory:** list every component in the UI dir and `_pocs/` with its variant axes (`cva` keys), sub-parts (namespace), and whether it has a story/spec.
3. **Classify mode:** component / poc / detect. If the user said "POC", "prototype", "explore", "spike" → poc. "what can I reuse", "find duplicates", "do we have" → detect. Adding/changing a reusable component → component. If ambiguous, return `needs_input`.
4. **Detect:** map each piece the request needs to **reuse** (existing component as is), **extend** (new variant/prop/sub-part), or **new**. Also flag near-duplicates noticed in the inventory.
5. **Pattern (when applicable per the mode table):** recommend one composition pattern with a short rationale and a sketch of the public API. Candidate set (builder may add): function-as-child / render prop, compound namespaced component (`createNamespaceComponent`), `-core` primitive + smart layer split, controlled/uncontrolled (`value`/`onValueChange`), `asChild`/Slot polymorphism, headless hook + presentational component.
6. **Output:** for detect mode, the final report. Otherwise a **proposal** that doubles as the SDD for verification: mode, files to create/edit, reuse/extend/new table, pattern + API sketch, required stories/`play` tests/spec, and acceptance criteria (token-only styling, baseline §7 rules, POC isolation rules).

### 2. Approval pause

The workflow returns `{ status: 'needs_approval', mode, proposal }`. The orchestrator shows the proposal to the user. On approval it relaunches the workflow with `approvedProposal` in args, which skips Analyze (same mechanism as `deliver-task` skipping Plan when `sdd` is passed). If the user asks for changes, the orchestrator relaunches Analyze with the feedback appended to the request.

### 3. Implement

`implement-task-agent` implements the approved proposal **without committing**. Code, spec and story are written in this one hop (the story's `play` functions are tests too, so story is not a separate late step). Implement does not run tests — its existing rule stays; running them is Verify's job.

### 4. Verify ⇄ fix

`verify-task-agent` verifies the **working-tree diff** (uncommitted changes vs `HEAD`, including untracked files listed via `git ls-files --others --exclude-standard` — never staged) against the proposal's acceptance criteria. When the diff contains `*.stories.*` files and the project has a Storybook Vitest project, verify also runs it (e.g. `test:storybook`) so `play` tests and a11y addon checks actually execute. Failures loop back to Implement with `blocking_issues`, max 3 rounds, same as `deliver-task`.

### 5. a11y gate

`a11y-auditor` at WCAG AA, scoped to changed UI files. Blocking findings return `blocked` with the findings; nothing is reverted.

### 6. Review summary (end)

Return `{ status: 'ready_for_review', mode, branch, files, checksRun, notes }`: files created/edited, tests and stories run with results, pattern chosen, and "look here first" pointers. The only git write in the whole workflow is checking out the feature branch at the start of Implement (created from the current branch if missing, `design/<slug>` unless the caller passes `branch`).

## Routing

- New intent **`design_component`** (my call on the name, to keep the existing `design_system` intent for docs/audit):
  - `design_component` → `design-system` workflow: create, extend or compose components, POCs, reuse detection.
  - `design_system` → `design-system-setup-agent` (unchanged): document DESIGN.md, audit or set up Storybook.
- On Claude Code, `design_component` runs as the workflow **by default** — no slash command or "run as workflow" opt-in needed (user decision: any request on these topics creates the workflow). This is an explicit exception to the orchestrator's general opt-in rule. Codex/OpenCode run the sequential equivalent with the same no-commit, approval-pause and working-tree rules.
- Update `agents/orchestrator-agent.md`: intent list, classification hints, routing table (workflow mode on Claude Code, and a sequential equivalent for Codex/OpenCode: analyze → ask approval → implement → verify → a11y → summary), and result handling for `needs_approval` / `ready_for_review`.
- Update `hooks/hooks.json` mandatory-action text to mention `/ai-toolbox:design-system`.

## Scope of a run

Everything uncommitted in the working tree (modified + untracked) is the run's scope — user decision. A dirty tree at start means a previous run was not fully accurate, or the user is mid-iteration; users commit and push on demand, so there is no earlier "clean" baseline to protect. Verify and the a11y gate judge the whole uncommitted diff; the workflow does not refuse to start on a dirty tree and does not snapshot a baseline.

## Codex / OpenCode

The workflow script is Claude Code-only. Codex and OpenCode get the same behavior through `orchestrator-agent` sequential mode, because every hop is an agent or skill their installers already copy (`agents/*.md` → `.codex/agents` / OpenCode agents; `skills/*` → `.agents/skills` / OpenCode skills). Required:

- `orchestrator-agent.md` routing entry for `design_component` with the full sequential sequence, written with the same rules as the workflow:
  1. `component-scout-agent` → proposal (or report in detect mode, then stop).
  2. Orchestrator shows the proposal and asks the user to approve or change it — interactive hosts can ask directly, so no relaunch is needed.
  3. Check out the feature branch.
  4. `implement-task-agent` with `no_commit: true` and the approved proposal as the SDD.
  5. `verify-task-agent` with `diff_scope: working_tree`; on fail, back to step 4 with `blocking_issues`, max 3 rounds.
  6. `a11y-auditor` on the changed UI files.
  7. Review summary. No commit, push or PR.
- `opencode-plugin/analytics-core.mjs`: add `component-scout-agent` to the known agent list so its runs are traced like the others.
- No separate Codex/OpenCode entry point is needed: `AGENTS.md` makes every interaction go through the orchestrator, which classifies `design_component` from plain language.

## Behavior lives in agents/skills, not the script

Per the orchestrator rule ("never put behavior in workflow scripts that is not already defined by an agent or skill"):

- **New agent `component-scout-agent`** (thin, like the other hop agents) that loads the new skill; it is the `agentType` of the Analyze hop and the `first_hop` of the `design_component` route on Codex/OpenCode. Installers pick it up like every other file in `agents/`.
- **New skill `component-scout`** — the Analyze step (context, inventory, mode classification, reuse/extend/new detection, pattern recommendation, proposal/report format). Usable standalone as `/component-scout` for detect mode.
- **`implement-task-agent` / `implement-task` skill** — add a `commit: false` mode: when the caller passes `no_commit: true`, skip the commit step and return `status: 'implemented'` with the list of changed files. Default behavior (commit) is unchanged for `deliver-task`.
- **`verify-task-agent` / `verify-task` skill** — accept `diff_scope: working_tree` to verify uncommitted + untracked changes against `HEAD` instead of branch vs base, and run the Storybook Vitest project when stories changed. `deliver-task` behaviour is unchanged (default scope stays branch vs base).
- **`workflows/design-system.js`** — only sequences: Analyze → pause → Implement ⇄ Verify → a11y → summary.

## Docs changes

- `skills/design-system-docs/references/storybook-baseline.md`:
  - `main.ts` stories globs include `"../_pocs/**/*.mdx"` and `"../_pocs/**/*.stories.@(ts|tsx)"`.
  - `preview.tsx` `storySort.order` becomes `["Foundations", "UI", "POCs"]`.
  - New section "POCs": location, title prefix, isolation rules, promotion path.
- `design-system-docs` audit: add checks — POC globs present, `POCs` in storySort, no import from `_pocs/` outside `_pocs/` (grep).
- Foundations page template (baseline §8): a short "Design system vs POCs" note stating the isolation rules.
- `README.md`: document the workflow, the skill, and the new intent.

## Tests

Extend `scripts/workflows.test.mjs` (stubbed `agent()`):

- `design-system` meta phases match `phase()` calls.
- detect mode: one Analyze call, returns report, no Implement call.
- component/poc without `approvedProposal`: returns `needs_approval` after Analyze, no Implement call.
- with `approvedProposal`: skips Analyze, runs Implement with `no_commit`, Verify with `diff_scope: working_tree`, a11y, returns `ready_for_review`.
- verify fail → fix loop → pass; never more than 3 fix rounds; returns `blocked` after.
- no prompt anywhere instructs commit, push, or create-pr.
- `needs_input` from Analyze is surfaced, not guessed.

## Target

The repo's `workflows/` directory with plugin namespace `ai-toolbox`, as `deliver-task.js` and `scripts/workflows.test.mjs` already assume. The untracked `.claude/workflows/` copies come from the separately installed `axis-human-ai-toolbox` plugin and are out of scope.

## Constraints

- Claude Code workflow script conventions as in `workflows/deliver-task.js` (literal `meta`, `agent()` with `agentType` + `schema`, `NON_INTERACTIVE`, analytics closeout per hop).
- Codex/OpenCode run the same flow sequentially via `orchestrator-agent`.
- Assumes a React + Storybook project for component/poc file layouts; other stacks map the same structure to their idioms (the skill says so).

## Decided by the user

- Three jobs: new component, POC from existing components, reuse detection.
- Path: check DESIGN.md/docs → detect reusable/new → pattern suggestion (POC) → code → test → story.
- No commit, no push, no PR — the user reviews first.
- POCs live in `_pocs/` at the root, appear in Storybook under `POCs`, never enter the design system.
- Approval pause after detection/pattern.
- On Claude Code, design-component requests use the workflow by default.
- Everything uncommitted is the run's scope; no clean-tree check, no baseline snapshot.
- A feature branch is created/checked out at the start (the only git write); no commits.
- One workflow with a clear component/poc split (documented in Foundations/baseline).

## Builder's calls (Claude's, open to correction)

- Intent name `design_component`; workflow name `design-system`; skill name `component-scout`.
- Pattern step also runs for complex components in component mode.
- POC spec test optional; POC story required.
- `component-scout-agent` as a thin agent wrapping the skill.
- Tests run in Verify (incl. Storybook project when stories changed); Implement still does not run tests.
- Promoting a POC never deletes `_pocs/<name>/`; the summary flags it as removable.
- a11y gate kept; security gate dropped (no new dependencies or data handling expected — the a11y and verify gates cover UI work).
