# Design-system Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `design_component` route — `component-scout` skill/agent + `workflows/design-system.js` — that turns component, POC and reuse-detection requests into an approved proposal, then code + spec + story, verified and left uncommitted.

**Architecture:** Behavior lives in markdown agents/skills (portable to Codex/OpenCode via `orchestrator-agent` sequential mode); the Claude Code workflow script only sequences Analyze → approval pause → Implement ⇄ Verify → a11y gate → summary. Two existing agents gain opt-in modes (`no_commit`, `diff_scope: working_tree`) without changing `deliver-task` behavior.

**Tech Stack:** Markdown agent/skill definitions, Claude Code workflow script (plain JS), `node:test` harness in `scripts/workflows.test.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-16-design-system-workflow-design.md`

## Global Constraints

- Plugin namespace in workflow `agentType`: `ai-toolbox:` (as in `workflows/deliver-task.js`).
- Workflow file: `workflows/design-system.js`, `meta.name: 'design-system'`, literal `meta` (the test loader regex requires `export const meta = {…\n}\n`).
- The workflow never commits, pushes, stages, or opens a PR. The only git write is checking out the feature branch (created from the current branch if missing), default name `design/<slug>`.
- Run scope = everything uncommitted (modified + untracked). No clean-tree check, no baseline snapshot. Untracked files are listed with `git ls-files --others --exclude-standard`, never staged.
- Modes: `component` | `poc` | `detect`. POCs live in `_pocs/<name>/`, Storybook title `POCs/<Name>`, never imported outside `_pocs/`, never added to `DESIGN.md`. Promotion never deletes `_pocs/<name>/`.
- Max fix rounds: 3 (same as `deliver-task`).
- Intent name `design_component`; existing `design_system` stays routed to `design-system-setup-agent`.
- On Claude Code, `design_component` runs the workflow by default (exception to the opt-in rule).
- **Repo rule for this plan's own execution:** stage changes, do not commit — the user reviews and commits.

## Review Focus

- Relaunch with `approvedProposal` but no `mode` (or `mode: 'detect'`) → `needs_input`, not a crash or a silent default. → Task 3 test.
- `component-scout-agent` returns nothing → `blocked` at `analyze`. → Task 3 test.
- `implement-task-agent` ignores `no_commit` and returns `committed` → `blocked` at `implement` with that reason; workflow does not continue as if fine. → Task 3 test.
- a11y gate agent returns nothing → treated as blocking. → Task 3 test.
- A workflow referencing an `agentType` whose agent file does not exist → caught by test. → Task 1 test.

---

### Task 1: `component-scout` skill + agent

**Files:**
- Create: `skills/component-scout/SKILL.md`
- Create: `agents/component-scout-agent.md`
- Modify: `opencode-plugin/analytics-core.mjs:4-10` (add `"component-scout-agent"` to the agent list)
- Test: `scripts/workflows.test.mjs`

**Interfaces:**
- Produces: agent `component-scout-agent` (skills: `component-scout`, `analytics-closeout`; tools: Glob, Read, Grep, Bash). Return shape used by Task 3:
  `{ status: 'proposal' | 'report' | 'needs_input', mode: 'component' | 'poc' | 'detect', proposal?: string, report?: string, branchSlug?: string, questions?: string[] }`

- [ ] **Step 1: Write the failing test** — `every workflow agentType resolves to an agent file`: for each `workflows/*.js`, collect `` agentType: `${PLUGIN}:<name>` `` / `'ai-toolbox:<name>'` occurrences (resolve `${PLUGIN}` to `ai-toolbox`) and assert `agents/<name>.md` exists. Also assert `agents/component-scout-agent.md` frontmatter lists `component-scout` under `skills:`.

- [ ] **Step 2: Run** `node --test scripts/workflows.test.mjs` — Expected: FAIL on the component-scout assertion.

- [ ] **Step 3: Write `skills/component-scout/SKILL.md`** — frontmatter `name: component-scout`, `allowed-tools: Glob Read Grep Bash`, `effort: medium`. Sections, in order, matching spec "1. Analyze":
  1. Context: `DESIGN.md` front matter + Do's and Don'ts, `FOUNDATIONS.md`, `stories/foundations.mdx`, `.storybook/main.*`/`preview.*`; `PROJECT_CONTEXT` if passed.
  2. Inventory table: component | path | variant axes (`cva` keys) | sub-parts | story | spec — for the UI dir and `_pocs/`.
  3. Mode classification with the spec's trigger words; ambiguous → `needs_input`.
  4. Detect table: need | reuse / extend / new | component | why; plus near-duplicates.
  5. Pattern step per the spec's mode table, candidate set from spec (function-as-child/render prop, compound namespace via `createNamespaceComponent`, `-core` + smart split, controlled/uncontrolled, `asChild`/Slot, headless hook + presentational), with rationale + public API sketch.
  6. Output templates: **report** (detect) and **proposal** (component/poc). The proposal has a `System-Level Acceptance Criteria` section (required by `verify-task`) that always includes: token-only styling (component), baseline §7 story rules, spec + snapshot (component), POC isolation rules + `POCs/<Name>` title (poc), and for promotions "`_pocs/<name>/` left in place, flagged removable".
  7. Non-interactive rule: never call AskUserQuestion when invoked by a workflow; return `needs_input`.

- [ ] **Step 4: Write `agents/component-scout-agent.md`** — mirror `agents/verify-task-agent.md` frontmatter shape (`model`, `color`, `effort: medium`, tools, skills). Workflow: load skill → return the shape in Interfaces → `analytics-closeout` with `--invoked-name component-scout-agent --classification design`. Boundaries: read-only, never writes files.

- [ ] **Step 5: Add `"component-scout-agent"` to the list in `opencode-plugin/analytics-core.mjs`.** Run `node --test opencode-plugin/analytics-core.test.mjs` — Expected: PASS.

- [ ] **Step 6: Run** `node --test scripts/workflows.test.mjs` — Expected: PASS.

- [ ] **Step 7: Stage** `git add skills/component-scout agents/component-scout-agent.md opencode-plugin/analytics-core.mjs scripts/workflows.test.mjs`

---

### Task 2: `no_commit` and `diff_scope: working_tree` modes

**Files:**
- Modify: `agents/implement-task-agent.md` (Input payload list, `5_commit`, `7_return`)
- Modify: `skills/implement-task/SKILL.md` (its commit step)
- Modify: `agents/verify-task-agent.md` (input payload)
- Modify: `skills/verify-task/SKILL.md` (Step 1 args, Step 2 changed-files, Step 2c tests)

**Interfaces:**
- Produces for Task 3:
  - implement-task-agent input `no_commit: true` → skips staging/commit, returns `{ status: 'implemented', branch, files: string[], summary }`. Without it, unchanged (`committed`).
  - verify-task input `diff_scope: working_tree` (`--diff-scope working_tree`) → `CHANGED_FILES` = `git diff --name-only HEAD` ∪ `git ls-files --others --exclude-standard`; and if `CHANGED_FILES` contains `*.stories.*` and the project has a Storybook Vitest project, also run it (`test:storybook` or `vitest --project=storybook`). Default scope unchanged.

- [ ] **Step 1: Edit `implement-task-agent.md`** — add `no_commit` to the input list; `5_commit` begins "If `no_commit: true`: do not stage or commit; list changed + untracked files and skip to 6."; `7_return` documents both return shapes. Leave the "cannot run tests" boundary as is.
- [ ] **Step 2: Edit `skills/implement-task/SKILL.md`** commit step with the same `no_commit` branch.
- [ ] **Step 3: Edit `verify-task` skill + agent** with the `diff_scope` behavior above; add `[--diff-scope working_tree]` to `argument-hint`.
- [ ] **Step 4: Verify** `grep -n "no_commit" agents/implement-task-agent.md skills/implement-task/SKILL.md` and `grep -n "working_tree" agents/verify-task-agent.md skills/verify-task/SKILL.md` each return hits; `node --test scripts/workflows.test.mjs` still PASS (deliver-task unchanged).
- [ ] **Step 5: Stage** the four files.

---

### Task 3: `workflows/design-system.js`

**Files:**
- Create: `workflows/design-system.js`
- Test: `scripts/workflows.test.mjs` (add `"design-system"` to the meta/phase test list; add tests below)

**Interfaces:**
- Consumes: Task 1 scout return shape; Task 2 `implemented` shape and `diff_scope`.
- Produces: `args = string | { request?, mode?, approvedProposal?, branch?, projectContext?, nknContext? }`. Returns one of:
  - `{ status: 'needs_input', stage: 'start' | 'analyze' | 'implement', questions }`
  - `{ status: 'reported', mode: 'detect', report }`
  - `{ status: 'needs_approval', mode, proposal, branch }`
  - `{ status: 'blocked', stage: 'analyze' | 'implement' | 'verify' | 'a11y', branch?, reason?, blockingIssues?, findings? }`
  - `{ status: 'ready_for_review', mode, branch, files, checksRun: ['verify-task', 'code-review', 'a11y'], notes }`
- Labels/phases (tests rely on them): `component-scout-agent` (phase `Analyze`), `implement-task-agent` / `implement-task-agent (fix round N)` (`Implement`), `verify-task-agent (round N)` (`Verify`), `a11y gate` (`A11y`).

- [ ] **Step 1: Write the failing tests**
  - `design-system detect mode returns the report without implementing` — scout → `{status:'report', mode:'detect', report:'R'}`; assert result `{status:'reported', mode:'detect', report:'R'}`, labels `['component-scout-agent']`, `calls[0].opts.agentType === 'ai-toolbox:component-scout-agent'`.
  - `design-system pauses for approval after analysis` — scout → proposal `P`, mode `poc`, branchSlug `checkout`; assert `{status:'needs_approval', mode:'poc', proposal:'P', branch:'design/checkout'}`, one call.
  - `design-system with an approved proposal skips analysis and ends ready for review` — args `{approvedProposal:'P', mode:'component', branch:'design/x'}`; implement → `{status:'implemented', files:['a.tsx']}`, verify pass, a11y not blocking; assert labels `['implement-task-agent','verify-task-agent (round 1)','a11y gate']`, result status `ready_for_review`, `files` `['a.tsx']`; implement prompt matches `/no_commit: true/` and `/P/`; verify prompt matches `/diff_scope: working_tree/`.
  - `design-system loops fixes and blocks after 3 rounds` — verify always fails `['story missing']`; assert `blocked`/`verify`, 4 verify calls, a fix-round implement prompt matches `/1\. story missing/`, no `a11y gate`.
  - `design-system never commits, pushes or opens a PR` — run the happy path; assert no label `create-pr` and every prompt matches `/Do not commit, push, stage, or open a PR/` and none matches `/create-pr/`.
  - `design-system surfaces needs_input from analysis` — scout → `needs_input` `['Which mode?']`; assert `{status:'needs_input', stage:'analyze', questions:['Which mode?']}` and prompt matches `/Do NOT call AskUserQuestion/`.
  - Review Focus tests: approved proposal without `mode` → `needs_input`/`start`, zero calls; approved proposal with `mode:'detect'` → same; scout returns `null` → `blocked`/`analyze`; implement returns `{status:'committed'}` → `blocked`/`implement`, reason matches `/no_commit/`; a11y returns `null` → `blocked`/`a11y`.

- [ ] **Step 2: Run** `node --test scripts/workflows.test.mjs` — Expected: FAIL (`design-system.js` missing).

- [ ] **Step 3: Implement `workflows/design-system.js`** following `deliver-task.js` structure: literal `meta` with `name: 'design-system'`, `whenToUse`, phases `Analyze`, `Implement`, `Verify`, `A11y`; constants `PLUGIN = 'ai-toolbox'`, `MAX_FIX_ROUNDS = 3`, `NON_INTERACTIVE` (same text as deliver-task), `NO_GIT_WRITES = 'Do not commit, push, stage, or open a PR. The only allowed git write is checking out the branch above.'` appended to every prompt; schemas `SCOUT_SCHEMA`, `IMPLEMENT_SCHEMA` (`status: implemented|committed|needs_input|failed`, `files`, `summary`, `questions`), `VERIFY_SCHEMA`, `GATE_SCHEMA`; closeout line per hop with `--classification design`. Branch = `input.branch` || `design/${scout.branchSlug || mode}`; the first Implement prompt says "Check out the branch above first, creating it from the current branch if it does not exist." Mode-specific rules (component vs poc, from the spec table) included in the Implement prompt. a11y gate always runs (prompt: `a11y-auditor` at WCAG AA on the uncommitted UI files, do not modify files).

- [ ] **Step 4: Run** `node --test scripts/workflows.test.mjs` — Expected: all PASS.

- [ ] **Step 5: Stage** `git add workflows/design-system.js scripts/workflows.test.mjs`

---

### Task 4: Routing — orchestrator, hooks, README

**Files:**
- Modify: `agents/orchestrator-agent.md` (step `2_intent_classification` list; Execution Modes `workflow.how` + `results`; Routing Table — add `design_component` after `design_system`)
- Modify: `hooks/hooks.json` (UserPromptSubmit text)
- Modify: `README.md` (skills table, agents table, Workflows table, tree)

**Interfaces:**
- Consumes: Task 3 return statuses; Task 1/2 agent inputs.

- [ ] **Step 1: Orchestrator** —
  - Add `design_component` to the intent list; `design_system` `when:` becomes "Documenting DESIGN.md or auditing/setting up Storybook"; new entry `design_component` `when:` "Creating or extending a design-system component, building a POC from existing components, or detecting reusable components", with the 7-step sequential sequence from the spec's "Codex / OpenCode" section, `first_hop: component-scout-agent`.
  - Execution Modes: `design_component → ai-toolbox:design-system` with `args: { request, mode, approvedProposal, branch, nknContext, projectContext }`; note it runs by default on Claude Code (no opt-in). Results: `needs_approval` → show proposal, on approval relaunch with `approvedProposal`, `mode`, `branch`; on change requests relaunch with feedback appended to `request`. `reported` → show report. `ready_for_review` → show summary, never commit/push/PR.
- [ ] **Step 2: hooks.json** — append to the UserPromptSubmit message: "Requests to create/extend components, build POCs, or find reusable components run the ai-toolbox design-system workflow by default (/ai-toolbox:design-system); it never commits." Verify: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8'))"` exits 0.
- [ ] **Step 3: README** — add `component-scout` skill row, `component-scout-agent` row, `design-system` workflow row (`/ai-toolbox:design-system` | `design_component` | component-scout-agent → approval → implement-task-agent (no commit) ⇄ verify-task-agent (working tree, up to 3 fix rounds) → a11y gate → review summary), tree entries.
- [ ] **Step 4: Verify** `grep -n "design_component" agents/orchestrator-agent.md README.md hooks/hooks.json` returns hits in all three.
- [ ] **Step 5: Stage** the three files.

---

### Task 5: POCs in the Storybook baseline and audit

**Files:**
- Modify: `skills/design-system-docs/references/storybook-baseline.md` (§3 globs, §4 storySort, new §10 "POCs", §8 Foundations note)
- Modify: `skills/design-system-docs/SKILL.md` (A3, A4, new A8b checks; A9 severity)

- [ ] **Step 1: Baseline** — §3 add `"../_pocs/**/*.mdx"` and `"../_pocs/**/*.stories.@(ts|tsx)"`; §4 `order: ["Foundations", "UI", "POCs"]`; §8 add a "Design system vs POCs" note; §10 POCs: location `_pocs/<name>/`, files `<name>.poc.tsx` + `<name>.stories.tsx` (spec optional), title `POCs/<Name>`, story description states chosen pattern + why + future implementation, isolation rules, promotion via component mode without deleting the POC.
- [ ] **Step 2: Audit** — A3: POC globs present when `_pocs/` exists; A4: `"POCs"` in storySort after component groups; new check: `grep -rn "_pocs/" --include=*.{ts,tsx} . | grep -v "^./_pocs/"` returns nothing; A9: POC import leak = ❌ Critical, missing POC globs/sort = ⚠️ High.
- [ ] **Step 3: Verify** `grep -n "_pocs" skills/design-system-docs/SKILL.md skills/design-system-docs/references/storybook-baseline.md` returns hits in both.
- [ ] **Step 4: Stage** both files.
