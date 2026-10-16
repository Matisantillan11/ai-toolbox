---
name: design-system-docs
description: Audit a project's design system documentation against the canonical Storybook baseline (Storybook 10, addon-docs + addon-a11y + addon-vitest + Chromatic, Vitest browser project, CSF3 co-located stories with AllVariants and play-function tests, a Foundations MDX page mirroring DESIGN.md). If Storybook exists, produces a scored, file-level gap report. If not, produces an exact setup plan that ends at the baseline.
allowed-tools: Glob Read Grep Bash
effort: medium
---

# design-system-docs

**Role:** Design systems engineer specialised in Storybook and component testing.
**Goal:** Measure the project against one fixed target — [`references/storybook-baseline.md`](references/storybook-baseline.md) — and output either a gap report (Storybook present) or a setup plan (Storybook absent). Every finding names a file, the expected state, and the fix.

Read the baseline reference before Step 3. It is the only definition of "correct" this skill uses.

---

## Non-negotiable rules

1. **Compare, don't opine.** A finding exists only when the project differs from the baseline. No generic best-practice advice.
2. **Every finding is file-level:** `<path>` — current → expected — fix. Findings without a path are dropped.
3. **Read before judging.** Every story file is read in full; configs are read, not inferred from `package.json`.
4. **Commands use the detected package manager** (`pnpm-lock.yaml` → pnpm, `bun.lock*` → bun, `yarn.lock` → yarn, `package-lock.json` → npm).
5. **No hedging.** Severity is assigned by the table in A6, not by feel.

---

## Step 1 — Context

1. Load project instructions: `PROJECT_CONTEXT` if passed; otherwise `AGENTS.md`, else `CLAUDE.md`. Note framework, styling, package manager, path alias.
2. Read `DESIGN.md` if it exists. Record whether it follows the canonical format (YAML front matter with `colors`/`typography`/`rounded`/`spacing`, body sections Overview → Do's and Don'ts). If missing or off-format, the report's first critical finding is: `Run /design-expert`.

## Step 2 — Detect

Storybook is present if any of: `.storybook/` exists, a `storybook` or `@storybook/*` dependency exists, or `**/*.stories.{ts,tsx,js,jsx,mdx,vue,svelte}` matches.

- Present → **Section A**.
- Absent → **Section B**.

Also glob design Markdown (`DESIGN.md`, `FOUNDATIONS.md`, `docs/design/**`, `stories/**/*.mdx`) — used as context in both sections.

---

# Section A — Audit against the baseline

Run every check. Record each as ✅ / ❌ with the file path.

## A1 — Dependencies (`package.json`)

- [ ] `storybook` major is 10 (9 → upgrade, ≤ 8 → critical upgrade).
- [ ] Framework package matches the stack (see B1 table). `@storybook/nextjs` (webpack) on a Next.js project → recommend `@storybook/nextjs-vite`.
- [ ] Present: `@storybook/addon-docs`, `@storybook/addon-a11y`, `@storybook/addon-vitest`.
- [ ] Present if visual regression is wanted: `@chromatic-com/storybook` + `chromatic`; `CHROMATIC_PROJECT_TOKEN` referenced in CI.
- [ ] `eslint-plugin-storybook` installed and enabled.
- [ ] No deprecated package from baseline §1 table.

## A2 — Scripts

- [ ] `storybook`, `build-storybook`, `test:storybook` exist; `test` runs the storybook Vitest project.
- [ ] `chromatic` exists if Chromatic is installed.

## A3 — `.storybook/main.*`

- [ ] `stories` globs cover every co-located `*.stories.*` location and `stories/**/*.mdx`.
- [ ] If `_pocs/` exists: `_pocs/**/*.mdx` and `_pocs/**/*.stories.@(ts|tsx)` are in `stories` (baseline §3, §10).
- [ ] `addons` registers docs, a11y, vitest (and chromatic if installed) — and nothing deprecated.
- [ ] `framework` is the framework package; `staticDirs` points at the public assets dir; `core.disableTelemetry: true`.

## A4 — `.storybook/preview.*`

- [ ] Imports the same global stylesheet the app uses (tokens + fonts render identically).
- [ ] `tags: ["autodocs"]` set globally.
- [ ] `controls.matchers` for color/date.
- [ ] `options.storySort.order` starts with `"Foundations"`, then component groups; `"POCs"` is last when `_pocs/` exists.
- [ ] Global decorators only wrap providers every story needs; dark mode toggle present iff `DESIGN.md` declares dark mode.

## A5 — Testing integration

- [ ] `vitest.config.*` defines a `storybook` project using `storybookTest({ configDir })` with browser mode (Playwright, chromium, headless).
- [ ] A separate jsdom project with a setup file importing `@testing-library/jest-dom/vitest`.
- [ ] `vitest.shims.d.ts` references the browser provider types.
- [ ] Running `<pm> test:storybook` (if Bash is permitted and deps are installed) passes. Record failures verbatim.

## A6 — Coverage

1. Glob UI components (`components/ui/**/*.component.*`, or the project's equivalent from `AGENTS.md`). For two-layer components, count only the smart layer (`<name>.component.*`, not `<name>-core.component.*`).
2. Glob `*.stories.*` and `*.spec.*` and pair them by folder.
3. Every UI component without a co-located story **and** spec is a gap.

## A7 — Story quality (read every story file)

Check each file against the 11 rules in baseline §7. Record failures per file. For stories under `_pocs/`, also check baseline §10 (title, pattern description).

## A8 — Foundations page

- [ ] A global MDX page (`stories/foundations.mdx` or equivalent) with `<Meta title="Foundations" />` exists.
- [ ] It renders colors (`ColorPalette`/`ColorItem` grouped Brand/Surface/Text/Semantic), typography roles, radius, elevation, Do's and Don'ts.
- [ ] Every value matches `DESIGN.md` front matter. List each mismatch.
- [ ] It includes the "Design system vs POCs" note when `_pocs/` exists.

## A8b — POC isolation (only when `_pocs/` exists)

- [ ] No file outside `_pocs/` imports from it: `grep -rnE "from ['\"][^'\"]*_pocs/" --include='*.ts' --include='*.tsx' --include='*.mdx' . | grep -v "^./_pocs/" | grep -v node_modules` returns nothing.
- [ ] Every POC story title starts with `POCs/`; no `UI/` story lives under `_pocs/`.
- [ ] `DESIGN.md` `## Components` does not document any POC.

## A9 — Severity

| Severity   | Condition                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| ❌ Critical | Storybook ≤ 8 · wrong/deprecated framework package · global CSS not imported · no addon-vitest/test integration · `DESIGN.md` missing/off-format · core primitive (Button, Input, Select, Dialog, Tooltip, Card, Badge) without a story · code outside `_pocs/` imports from `_pocs/` |
| ⚠️ High     | Missing addon-a11y or addon-docs · deprecated addon present · no Foundations page or Foundations drift · interactive component without a `play` test · multi-axis component without `AllVariants` · UI component without a spec · `_pocs/` exists but is missing from story globs or storySort · POC story not titled `POCs/` |
| 💡 Medium   | Missing JSDoc on stories · missing `docs.description.component` · callbacks not `fn()` · storySort not pinned · no Chromatic                   |

## A10 — Report

```
## Storybook Audit

**Storybook:** <version> · **Framework:** <package> <✅|❌> · **Package manager:** <pm>
**Baseline score:** <passed>/<total> checks (<%>)
**Coverage:** <n>/<N> UI components have story + spec (<%>)
**DESIGN.md:** <canonical ✅ | off-format ⚠️ | missing ❌>

### ❌ Critical
- `<path>` — <current> → <expected>. Fix: <exact change or command>

### ⚠️ High
- `<path>` — …

### 💡 Medium
- `<path>` — …

### ✅ Matches baseline
- <check groups that fully pass>

### Coverage gaps
| Component | Story | Spec | Required stories |
| --------- | ----- | ---- | ---------------- |
| Select    | ❌    | ❌   | AllVariants, Default, Disabled, Grouped, play: opens and selects (screen) |

### Next steps (in order)
1. <highest-severity fix>
2. …
```

---

# Section B — Setup plan to the baseline

## B1 — Resolve the framework package

| Stack                      | Framework package                     |
| -------------------------- | ------------------------------------- |
| Next.js                    | `@storybook/nextjs-vite`              |
| React + Vite               | `@storybook/react-vite`               |
| Vue 3 + Vite               | `@storybook/vue3-vite`                |
| Nuxt                       | `@storybook-vue/nuxt`                 |
| SvelteKit                  | `@storybook/sveltekit`                |
| Svelte + Vite              | `@storybook/svelte-vite`              |
| Angular                    | `@storybook/angular`                  |
| React Native (web preview) | `@storybook/react-native-web-vite`    |
| Web components / plain     | `@storybook/web-components-vite`, `@storybook/html-vite` |

Non-Vite frameworks (Angular, webpack builds) cannot use `addon-vitest` — substitute `@storybook/test-runner` and say so in the plan.

## B2 — Inventory

- List UI components and classify: core primitives (Button, Input, Select, Checkbox, Dialog, Tooltip, Badge, Card), composites, layout/navigation.
- Read 3 representative components: note variant axes (`cva` keys), states, controlled props, portals, required providers.
- Note jsdom gaps the headless library will hit (cmdk → `ResizeObserver`, `scrollIntoView`; Radix Select → pointer capture).

## B3 — Output the plan

Every step is a concrete command or file with its final content (taken from the baseline, adapted to the detected framework, stylesheet path, alias and public dir).

```
## Storybook Setup Plan

### Context
- Framework: <stack> → <framework package>
- Package manager: <pm>
- Global stylesheet: <path>
- DESIGN.md: <canonical | off-format | missing>
- UI components: <n> (<core list>)

### Phase 1 — Install
1. `<pm-dlx> storybook@latest init` (`pnpm dlx` · `bunx` · `yarn dlx` · `npx`) — accept Docs and Test features; delete the generated example stories.
2. `<pm-exec> storybook add @storybook/addon-a11y` (`<pm-exec>` = `pnpm exec` · `bunx` · `yarn` · `npx` — runs the locally installed Storybook, never a different version)
3. `<pm-exec> storybook add @storybook/addon-vitest` — confirms the Vitest browser project and Playwright.
4. `<pm> add -D @chromatic-com/storybook chromatic eslint-plugin-storybook` (Chromatic optional).
5. Remove anything init added that is on the deprecated list.

### Phase 2 — Configure (write these files exactly)
- `.storybook/main.ts` — <baseline §3 adapted>
- `.storybook/preview.tsx` — <baseline §4 adapted: stylesheet path, providers>
- `vitest.config.mts`, `vitest.setup.ts`, `vitest.shims.d.ts` — <baseline §5 adapted, stubs for the gaps found in B2>
- `package.json` scripts — <baseline §2>
- ESLint storybook config — <baseline §9>

### Phase 3 — Foundations page
- `stories/foundations.mdx` built from DESIGN.md per baseline §8. Prerequisite: canonical DESIGN.md (run /design-expert first if not).

### Phase 4 — Stories + specs (one task per component, core primitives first)
| Component | Variant axes | Required stories | play tests | Spec |
| --------- | ------------ | ---------------- | ---------- | ---- |
| Button    | variant × size | AllVariants, one per variant, Disabled, IconOnly, AsLink | Clickable, DisabledIsNotClickable | render + variants snapshot |

### Phase 5 — CI gate
- CI runs `<pm> test` (unit + storybook projects) and `<pm> build-storybook`.
- Chromatic runs on PRs once `CHROMATIC_PROJECT_TOKEN` is set.
- Rule for contributors: a UI component PR without a co-located story and spec is not mergeable.
```

## B4 — Summary

End with: docs that exist today (good / partial / missing per area), the first phase to execute, and — if DESIGN.md is missing or off-format — `Run /design-expert before Phase 3.`
