---
name: design-expert
description: Scan the current project for every confirmed design decision (color tokens, typography roles, radius, spacing, elevation, component styling, dark mode) and write or update a root DESIGN.md in the canonical two-layer format — YAML token front matter plus a fixed-order Markdown body that references tokens as {group.key}. Use when starting UI work on an unfamiliar codebase, documenting an existing design system, or when DESIGN.md has drifted from source.
allowed-tools: Glob Read Grep Write AskUserQuestion
effort: medium
---

# design-expert

**Role:** Senior design systems engineer.
**Goal:** Produce a `DESIGN.md` that an AI agent can follow to write UI that is indistinguishable from the existing product — every value confirmed in source, every rule tied to a token.

The output format is fixed: [`references/design-md-template.md`](references/design-md-template.md). Read it before Step 4. Do not invent alternative structures.

---

## Non-negotiable rules

1. **Confirmed or absent.** Every value written to `DESIGN.md` must be traceable to a file you read. No defaults from memory, no "typical" values. If a value is not in source, the key is omitted (front matter) or marked `_Not yet defined_` (body).
2. **Extrapolation is labeled.** If a value is derived (e.g. a size inferred from two confirmed neighbours), append `(extrapolated)` in the body and keep it out of the front matter.
3. **Front matter is the contract; the body explains it.** Body prose references tokens as `{colors.primary}`, `{rounded.md}`, `{typography.body}`. A raw value may appear next to its token for readability (`{colors.primary}` — `var(--color-primary)`), never instead of it, and never contradicting it.
4. **Tokens are named by role, not appearance.** `primary`, `muted-foreground`, `heading-1`, `caption` — never `black`, `gray-500`, `text-60`.
5. **Foreground pairs are mandatory.** Every fill/surface token that carries text has a `<name>-foreground` pair, or the body states why not.
6. **Say what does not exist.** Absence is information: "No confirmed warning/success/info colors", "Shadow-free system", "No dark mode". Agents otherwise invent it.
7. **Imperative voice.** Do's and Don'ts are commands tied to tokens. No "consider", "try to", "you may want to".

---

## Step 1 — Context

1. Load project instructions: `PROJECT_CONTEXT` if the caller passed it; otherwise `AGENTS.md` at the root, else `CLAUDE.md`. Note the styling approach and component library.
2. If `DESIGN.md` exists, read it fully and keep it as `EXISTING_DESIGN_MD`. The full scan still runs — the existing file is only used in Step 4 to detect drift and preserve hand-written context.
3. If a Storybook foundations page exists (`stories/foundations.mdx`, `**/*oundations*.mdx`, `**/*okens*.mdx`), read it — it must mirror `DESIGN.md` and you will report drift in Step 5.

---

## Step 2 — Discovery

Locate sources in this priority order. **Higher rows win on conflict.**

| Priority | Source                     | Globs / signals                                                                                                                               |
| -------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Runtime theme tokens       | `app/globals.css`, `**/globals.css`, `**/theme.css`, `**/variables.css`, `:root {`, `.dark {`, `[data-theme`, `@theme`                        |
| 2        | Theme config               | `tailwind.config.*`, `theme.{ts,js}`, `tokens.{ts,js,json}`, `*.tokens.json`, `style-dictionary.config.*`, `createTheme(`, `definePreset(`   |
| 3        | Component source           | `components/ui/**`, `src/components/ui/**`, `lib/ui/**` — variant maps (`cva(`, `*-variants.constants.*`), class strings                      |
| 4        | Font loading               | `next/font` in layouts, `fonts.googleapis.com` links, `@fontsource/*`, `@font-face`                                                           |
| 5        | Brand assets               | `public/brand/**`, `app/icon.*`, `public/logo*`                                                                                               |
| 6        | Existing docs              | `DESIGN.md`, `FOUNDATIONS.md`, `*.mdx` under `stories/`, `docs/design/**`                                                                     |

Also record from `package.json` (or equivalent): component/headless library (`@radix-ui/*`, `@mui/*`, `@headlessui/*`, `vuetify`, …), variant tooling (`class-variance-authority`, `tailwind-merge`, `clsx`), icon library (`lucide-*`, `@heroicons/*`, …), theming (`next-themes`, …), Tailwind major version (v4 = CSS-first `@theme`, no config file required).

If the project uses a non-web stack (React Native, Swift, Kotlin), map the same categories to its theme objects — the output format does not change.

---

## Step 3 — Extraction

Read every file found. Extract into a working table `TOKEN | VALUE | SOURCE_FILE:LINE`. A row without a source is dropped.

- **Colors** — every semantic variable and its light/dark values. Decide the value style once for the whole file: `var(--color-*)` if tokens swap at runtime (dark mode / multi-theme), resolved hex otherwise.
- **Typography** — families + loaded weight ranges; derive *roles* from usage: find the classes on `h1`/hero headings, card titles, labels/buttons, body paragraphs, captions/tooltips. Record size, weight, line-height, tracking per role.
- **Radius** — every radius token; count usages (`Grep -c "rounded-<key>"`) to order the scale by frequency and to assign each tier its real use (cards vs buttons vs pills).
- **Spacing** — base unit; recurring paddings on cards/buttons (e.g. `p-6`, `px-8 py-3`).
- **Elevation** — every `shadow-*` usage grouped by surface type (resting, hover, floating, overlay). If none, the system is shadow-free.
- **Layout** — container max-width, gutters, breakpoints (custom or framework default — say which).
- **Components** — for each UI primitive with confirmed styling (button, card, input, tooltip, badge, dialog, …): fill, text, border, radius, padding, variants, states. These feed both `components:` in front matter and `## Components` in the body.
- **Dark mode** — strategy and mechanism.
- **Brand** — logo files and their variants; quote the canonical SVG if it is small and authoritative.

---

## Step 4 — Write `DESIGN.md`

Follow [`references/design-md-template.md`](references/design-md-template.md) exactly: front matter keys, body section order, heading names.

### New file

Fill every section from the extraction table. Write `_Not yet defined_` for body subsections with no confirmed data — never drop a section.

### Existing file → reconcile, then overwrite

Classify every difference between `EXISTING_DESIGN_MD` and the extraction table:

| Class      | Action                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------ |
| Stale      | Source disagrees with the doc → replace with source value                                  |
| Missing    | Template section/key absent → add                                                          |
| Incomplete | Section is placeholder-only but source now has data → populate                            |
| New        | Source has data the doc never covered → add                                                |
| Hand-written | Rationale or rules not derivable from source (brand intent, product decisions) → preserve verbatim |
| Off-format | Content valid but in a non-template structure (e.g. old `# Design System` tables) → migrate into the template shape |

Then write the full file. Never leave the old and new structure side by side.

### Validation gate — run before reporting

Re-read the written file and check every item. Fix and re-check until all pass:

- [ ] Front matter parses as YAML and contains `version`, `name`, `description`, `colors`, `typography`, `rounded`, `spacing`.
- [ ] Every `{group.key}` reference in front matter `components:` and in the body resolves to a front-matter key.
- [ ] Body sections appear in this order: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts.
- [ ] Every non-`foreground`/`border`/`input`/`ring` color has a `-foreground` pair or an explicit note.
- [ ] No raw value in the body contradicts the front matter.
- [ ] Do's and Don'ts each have ≥ 3 imperative bullets, each naming at least one token.
- [ ] No sentence uses "probably", "likely", "seems", "might", "typically".

---

## Step 5 — Report

```
## DESIGN.md <created | updated>

**Stack:** <styling approach> · <component/headless library> · <icon library> · <font loading>
**Tokens documented:** <n> colors · <n> typography roles · <n> radius steps · <n> components
**Validation gate:** passed

### Changes (update only)
- Stale → current: <section — old → new>
- Added: <section — what>
- Migrated: <section — from old structure>
- Preserved: <section — hand-written content kept>

### Not yet defined
- <sections left as _Not yet defined_ and why (no source found)>

### Conflicts resolved
- <e.g. "--radius in globals.css (0.75rem) overrides tailwind.config borderRadius.lg (0.5rem) — priority 1 wins">

### Foundations drift
- <"stories/foundations.mdx matches DESIGN.md" | list of values that differ — DESIGN.md is the source of truth; run /design-system-docs to fix the page>
```

If no project instructions existed, add one line: `Run /init-project to give future scans stack context.`
