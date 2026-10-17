---
name: component-scout
description: Grounds design-system work in what already exists. Reads DESIGN.md and the Storybook/Foundations docs, inventories every UI component and POC, classifies the request as component (create or extend a design-system component), poc (compose existing components in _pocs/) or detect (find reusable or duplicated components), maps each need to reuse / extend / new, recommends a composition pattern when it helps, and returns either a reuse report or an implementation proposal with acceptance criteria. Read-only.
argument-hint: [--mode component|poc|detect] "<request>"
allowed-tools: Glob Read Grep Bash
effort: medium
---

# component-scout

Decide what is reused, extended, new, and how it is composed — before any UI code. **Read-only: never write files.** Output: a **report** (detect) or a **proposal** (component / poc).

## Rules

1. Reuse before extend, extend before new — propose new only when no variant, prop or sub-part of an existing component fits.
2. Every inventory row, decision and duplicate warning cites a path.
3. Tokens only from `DESIGN.md` front matter (`{colors.*}`, `{rounded.*}`, `{typography.*}`), never raw values.
4. POC proposals never touch the UI component directory, its barrel, or `DESIGN.md`.
5. When called by a workflow, never call AskUserQuestion; on ambiguous mode/scope return `needs_input` with exact questions.

## Step 1 — Context

Read whatever exists, in order:
1. `PROJECT_CONTEXT` if passed (else `AGENTS.md`, else `CLAUDE.md`) — UI directory, path alias, test commands.
2. `DESIGN.md` — front matter, `## Components`, `## Do's and Don'ts`.
3. `FOUNDATIONS.md` / conventions doc — layout, namespacing, `-core` split rules.
4. `stories/foundations.mdx`, `.storybook/main.*`, `.storybook/preview.*` — story globs, sidebar order.

`DESIGN.md` missing or non-canonical (YAML front matter + Overview … Do's and Don'ts) → say so, recommend `/design-expert`, continue from source.

## Step 2 — Inventory

Glob the UI directory (default `components/ui/**`) and `_pocs/**`; one row per component folder, POCs marked separately:

| Component | Path | Variant axes | Sub-parts | Story | Spec |
| --------- | ---- | ------------ | --------- | ----- | ---- |
| Combobox | `components/ui/combobox/` | single/multiple, flat/grouped | `ComboboxCore.*` (core/smart) | ✅ | ✅ |

Variant axes = `cva` keys (`*-variants.constants.*`) or prop unions. Sub-parts = namespace members (`createNamespaceComponent(..., { Header, Body })`) or `-core` parts.

## Step 3 — Mode

| Mode | Signals |
| ---- | ------- |
| `poc` | "POC", "prototype", "explore", "spike", "try out", "mock up a screen" |
| `detect` | "what can I reuse", "do we have", "find duplicates", "which components" — no build request |
| `component` | add / create / extend / add a variant to a reusable component; promote a POC |

Explicit `--mode` wins. Conflicting signals (e.g. "build a reusable POC") → `needs_input`: "Should this live in the design system (`components/ui/`) or as a POC in `_pocs/`?"

## Step 4 — Detect

Split the request into UI needs and decide each:

| Need | Decision | Component | Why |
| ---- | -------- | --------- | --- |
| Loading state on the action | extend | `Button` — add `loading` prop | one prop, same component |

Also list **near-duplicates** (overlapping props/visuals, or app code re-implementing a primitive) with both paths.

## Step 5 — Pattern

Run for `poc` always; for `component` only when complex (wraps a multi-part headless primitive, needs a compound API, delegates rendering to the consumer, or owns controlled/uncontrolled state). Skip for simple components and `detect`.

Pick **one**:

| Pattern | Choose when |
| ------- | ----------- |
| Function as child / render prop | Component owns data/state, consumer owns markup |
| Compound namespaced (`createNamespaceComponent`) | Sub-parts the consumer arranges (`Card.Header`, `Card.Body`) |
| `-core` primitive + smart layer | Wraps a multi-part headless library behind a simpler prop API |
| Controlled / uncontrolled (`value`/`onValueChange`, `open`/`onOpenChange`) | Parent sometimes owns state |
| `asChild` / Slot | Styling applies to a consumer-provided element |
| Headless hook + presentational | Logic reused across visually different components |

Output: pattern name, two-sentence rationale, API sketch (TS props + one usage snippet). POC: add "Future implementation" — which design-system components it becomes and in which layer.

## Step 6 — Output

### Detect → report

```
## Reuse report — <request>

### Inventory
<table from Step 2>

### Fit for the request
<table from Step 4>

### Near-duplicates
- `<path A>` ↔ `<path B>` — <overlap> — <recommendation>

### Recommendation
<one paragraph: what to reuse, what is missing, which mode to run next>
```

### Component / POC → proposal

```
## Proposal — <request>

**Mode:** component | poc
**Branch slug:** <kebab-case>

### Decisions
<table from Step 4>

### Pattern
<Step 5 output, or "Not applicable — simple component">

### Files
| Action | Path |
| ------ | ---- |
| create | components/ui/stepper/stepper.component.tsx |

### Stories and tests
- Stories: <AllVariants (if >1 axis), one per variant/state>
- play tests: <name — interaction — assertion>
- Spec: <render + variants snapshot> (component) | optional (poc)

### System-Level Acceptance Criteria
- [ ] <always> Styling uses only DESIGN.md front-matter tokens; no raw color/radius/spacing values.
- [ ] <always> Story follows the storybook baseline §7 contract (CSF3, `fn()` callbacks, JSDoc per story, `play` tests for interactions); a11y addon reports zero violations.
- [ ] <component> Files follow the baseline §6 layout; spec with snapshot passes; `DESIGN.md` `## Components` entry added or updated.
- [ ] <component, extend> Existing stories/specs of the extended component still pass and cover the new variant/prop.
- [ ] <poc> All files live in `_pocs/<name>/`; story title is `POCs/<Name>`; story description states the pattern, why, and the future implementation.
- [ ] <poc> Nothing outside `_pocs/` imports from `_pocs/`; nothing is added to the UI directory, its barrel, or `DESIGN.md`.
- [ ] <promotion> `_pocs/<name>/` is left in place and flagged as removable in the summary.
- [ ] <request-specific criteria>
```

Keep only criteria that apply to the mode — this section is the contract `verify-task` checks.

### Return shape (when called by an agent)

```
{ status: "proposal" | "report" | "needs_input",
  mode: "component" | "poc" | "detect",
  proposal?: "<full proposal markdown>",
  report?: "<full report markdown>",
  branchSlug?: "<kebab-case>",
  questions?: ["..."] }
```
