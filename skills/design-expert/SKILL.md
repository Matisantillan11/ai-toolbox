---
name: design-expert
description: Scan the current project for every confirmed design decision (color tokens, typography roles, radius, spacing, elevation, component styling, dark mode) and write or update a root DESIGN.md in the canonical two-layer format — YAML token front matter plus a fixed-order Markdown body that references tokens as {group.key}. Use when starting UI work on an unfamiliar codebase, documenting an existing design system, or when DESIGN.md has drifted from source.
allowed-tools: Glob Read Grep Write AskUserQuestion
effort: medium
---

# design-expert

Produce a `DESIGN.md` an agent can follow to write UI indistinguishable from the product. Format is fixed by [`references/design-md-template.md`](references/design-md-template.md) — read it before Step 4; no alternative structures.

## Rules

1. **Confirmed or absent.** Every value traces to a file you read. Not in source → omit the key (front matter) or write `_Not yet defined_` (body).
2. **Label extrapolation.** Derived values get `(extrapolated)` in the body and stay out of front matter.
3. **Front matter is the contract.** Body references tokens as `{colors.primary}`, `{rounded.md}`, `{typography.body}`; a raw value may sit beside its token, never replace or contradict it.
4. **Role names, not appearance:** `primary`, `muted-foreground`, `heading-1` — never `black`, `gray-500`.
5. **Foreground pairs:** every text-bearing fill/surface has `<name>-foreground`, or the body says why not.
6. **State absences** ("No confirmed warning/success/info colors", "Shadow-free system", "No dark mode").
7. **Imperative Do's and Don'ts** tied to tokens; no "consider"/"try to".

## Step 1 — Context

1. Project instructions: `PROJECT_CONTEXT` if passed; else `AGENTS.md`, else `CLAUDE.md`. Note styling approach and component library.
2. If `DESIGN.md` exists, read it fully as `EXISTING_DESIGN_MD` (used only in Step 4 for drift and hand-written context; the full scan still runs).
3. Read any Storybook foundations page (`stories/foundations.mdx`, `**/*oundations*.mdx`, `**/*okens*.mdx`) for drift reporting in Step 5.

## Step 2 — Discovery

Higher priority wins on conflict.

| # | Source | Globs / signals |
| --- | --- | --- |
| 1 | Runtime theme tokens | `app/globals.css`, `**/globals.css`, `**/theme.css`, `**/variables.css`, `:root {`, `.dark {`, `[data-theme`, `@theme` |
| 2 | Theme config | `tailwind.config.*`, `theme.{ts,js}`, `tokens.{ts,js,json}`, `*.tokens.json`, `style-dictionary.config.*`, `createTheme(`, `definePreset(` |
| 3 | Component source | `components/ui/**`, `src/components/ui/**`, `lib/ui/**` — `cva(`, `*-variants.constants.*`, class strings |
| 4 | Font loading | `next/font`, `fonts.googleapis.com`, `@fontsource/*`, `@font-face` |
| 5 | Brand assets | `public/brand/**`, `app/icon.*`, `public/logo*` |
| 6 | Existing docs | `DESIGN.md`, `FOUNDATIONS.md`, `stories/**/*.mdx`, `docs/design/**` |

From `package.json` record: component/headless library (`@radix-ui/*`, `@mui/*`, `@headlessui/*`, `vuetify`…), variant tooling (`class-variance-authority`, `tailwind-merge`, `clsx`), icons (`lucide-*`, `@heroicons/*`…), theming (`next-themes`…), Tailwind major (v4 = CSS-first `@theme`). Non-web stacks (React Native, Swift, Kotlin): map the same categories to their theme objects; output format unchanged.

## Step 3 — Extraction

Read every file found; build `TOKEN | VALUE | SOURCE_FILE:LINE` (drop rows without a source).
- **Colors**: every semantic variable, light/dark values. One value style for the file: `var(--color-*)` if tokens swap at runtime, else resolved hex.
- **Typography**: families + loaded weights; derive roles from usage (hero/`h1`, card titles, labels/buttons, body, captions/tooltips) with size, weight, line-height, tracking.
- **Radius**: every token; order by usage count (`Grep -c "rounded-<key>"`) and assign each tier its real use.
- **Spacing**: base unit; recurring card/button paddings.
- **Elevation**: `shadow-*` usages by surface (resting, hover, floating, overlay); none → shadow-free.
- **Layout**: container max-width, gutters, breakpoints (custom or framework default — say which).
- **Components**: each primitive with confirmed styling — fill, text, border, radius, padding, variants, states (feeds `components:` and `## Components`).
- **Dark mode**: strategy and mechanism.
- **Brand**: logo files/variants; quote the canonical SVG if small and authoritative.

## Step 4 — Write `DESIGN.md`

Follow the template exactly (front matter keys, section order, headings).

- **New file**: fill every section; `_Not yet defined_` for unconfirmed subsections — never drop a section.
- **Existing file**: classify each difference, then overwrite the whole file (never old and new structure side by side):

| Class | Action |
| --- | --- |
| Stale | Source disagrees → use source value |
| Missing | Template section/key absent → add |
| Incomplete | Placeholder but source now has data → populate |
| New | Source data never covered → add |
| Hand-written | Rationale not derivable from source → preserve verbatim |
| Off-format | Valid content in non-template structure → migrate |

**Validation gate** — re-read the file; fix and re-check until all pass:
- Front matter parses as YAML with `version`, `name`, `description`, `colors`, `typography`, `rounded`, `spacing`.
- Every `{group.key}` in `components:` and the body resolves to a front-matter key.
- Body order: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts.
- Every color except `foreground`/`border`/`input`/`ring` has a `-foreground` pair or a note.
- No body raw value contradicts front matter.
- Do's and Don'ts each ≥ 3 imperative bullets naming ≥ 1 token.
- No "probably", "likely", "seems", "might", "typically".

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

If no project instructions existed, add: `Run /init-project to give future scans stack context.`
