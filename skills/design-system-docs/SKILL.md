---
name: design-system-docs
description: Audit a project's design system documentation against the canonical Storybook baseline (Storybook 10, addon-docs + addon-a11y + addon-vitest + Chromatic, Vitest browser project, CSF3 co-located stories with AllVariants and play-function tests, a Foundations MDX page mirroring DESIGN.md). If Storybook exists, produces a scored, file-level gap report. If not, produces an exact setup plan that ends at the baseline.
allowed-tools: Glob Read Grep Bash
effort: medium
---

# design-system-docs

Measure the project against [`references/storybook-baseline.md`](references/storybook-baseline.md) (read it before Step 3; it is the only definition of "correct") and output a gap report (Storybook present) or a setup plan (absent).

## Rules

1. A finding exists only where the project differs from the baseline — no generic advice.
2. Every finding: `<path>` — current → expected — fix. Drop findings without a path.
3. Read every story file in full; read configs, don't infer from `package.json`.
4. Commands use the detected package manager (`pnpm-lock.yaml` → pnpm, `bun.lock*` → bun, `yarn.lock` → yarn, `package-lock.json` → npm).
5. Severity comes only from the A9 table.

## Step 1 — Context

1. Project instructions: `PROJECT_CONTEXT` if passed; else `AGENTS.md`, else `CLAUDE.md`. Note framework, styling, package manager, path alias.
2. Read `DESIGN.md` if present; check canonical format (YAML front matter with `colors`/`typography`/`rounded`/`spacing`; body Overview → Do's and Don'ts). Missing/off-format → first critical finding: `Run /design-expert`.

## Step 2 — Detect

Storybook present if `.storybook/` exists, a `storybook`/`@storybook/*` dependency exists, or `**/*.stories.{ts,tsx,js,jsx,mdx,vue,svelte}` matches. Present → Section A; absent → Section B. In both, glob design Markdown (`DESIGN.md`, `FOUNDATIONS.md`, `docs/design/**`, `stories/**/*.mdx`) for context.

# Section A — Audit

Record each check ✅/❌ with its file path.

**A1 — Dependencies (`package.json`)**
- `storybook` major 10 (9 → upgrade; ≤ 8 → critical upgrade).
- Framework package matches the stack (B1). `@storybook/nextjs` (webpack) on Next.js → recommend `@storybook/nextjs-vite`.
- Present: `@storybook/addon-docs`, `@storybook/addon-a11y`, `@storybook/addon-vitest`, `eslint-plugin-storybook` (enabled); for visual regression `@chromatic-com/storybook` + `chromatic` with `CHROMATIC_PROJECT_TOKEN` in CI.
- Nothing from the baseline §1 deprecated table.

**A2 — Scripts**: `storybook`, `build-storybook`, `test:storybook` exist; `test` runs the storybook Vitest project; `chromatic` if Chromatic installed.

**A3 — `.storybook/main.*`**
- `stories` globs cover every co-located `*.stories.*` location and `stories/**/*.mdx`.
- If `_pocs/` exists: `_pocs/**/*.mdx` and `_pocs/**/*.stories.@(ts|tsx)` included (baseline §3, §10).
- `addons`: docs, a11y, vitest (+ chromatic if installed), nothing deprecated.
- `framework` is the framework package; `staticDirs` → public assets; `core.disableTelemetry: true`.

**A4 — `.storybook/preview.*`**
- Imports the app's global stylesheet (tokens + fonts).
- Global `tags: ["autodocs"]`; `controls.matchers` for color/date.
- `options.storySort.order` starts with `"Foundations"`, then component groups; `"POCs"` last when `_pocs/` exists.
- Global decorators only wrap providers every story needs; dark mode toggle iff `DESIGN.md` declares dark mode.

**A5 — Testing**
- `vitest.config.*` has a `storybook` project with `storybookTest({ configDir })`, browser mode (Playwright, chromium, headless).
- Separate jsdom project whose setup file imports `@testing-library/jest-dom/vitest`.
- `vitest.shims.d.ts` references browser provider types.
- If Bash is permitted and deps installed, run `<pm> test:storybook`; record failures verbatim.

**A6 — Coverage**: glob UI components (`components/ui/**/*.component.*` or the project equivalent; for two-layer components count only `<name>.component.*`, not `-core`), pair with `*.stories.*` and `*.spec.*` by folder. A component lacking a co-located story **and** spec is a gap.

**A7 — Story quality**: check every story file against the 11 rules in baseline §7; `_pocs/` stories also against §10 (title, pattern description). Record failures per file.

**A8 — Foundations page**
- Global MDX (`stories/foundations.mdx` or equivalent) with `<Meta title="Foundations" />`.
- Renders colors (`ColorPalette`/`ColorItem` grouped Brand/Surface/Text/Semantic), typography roles, radius, elevation, Do's and Don'ts.
- Every value matches `DESIGN.md` front matter; list each mismatch.
- Includes the "Design system vs POCs" note when `_pocs/` exists.

**A8b — POC isolation (only if `_pocs/` exists)**
- Nothing outside `_pocs/` imports it: `grep -rnE "from ['\"][^'\"]*_pocs/" --include='*.ts' --include='*.tsx' --include='*.mdx' . | grep -v "^./_pocs/" | grep -v node_modules` is empty.
- Every POC story title starts with `POCs/`; no `UI/` story under `_pocs/`.
- `DESIGN.md` `## Components` documents no POC.

**A9 — Severity**

| Severity | Condition |
| --- | --- |
| ❌ Critical | Storybook ≤ 8 · wrong/deprecated framework package · global CSS not imported · no addon-vitest/test integration · `DESIGN.md` missing/off-format · core primitive (Button, Input, Select, Dialog, Tooltip, Card, Badge) without a story · code outside `_pocs/` imports from `_pocs/` |
| ⚠️ High | Missing addon-a11y or addon-docs · deprecated addon present · no Foundations page or Foundations drift · interactive component without a `play` test · multi-axis component without `AllVariants` · UI component without a spec · `_pocs/` missing from story globs or storySort · POC story not titled `POCs/` |
| 💡 Medium | Missing JSDoc on stories · missing `docs.description.component` · callbacks not `fn()` · storySort not pinned · no Chromatic |

**A10 — Report**

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
```

# Section B — Setup plan

**B1 — Framework package**: Next.js → `@storybook/nextjs-vite` · React + Vite → `@storybook/react-vite` · Vue 3 + Vite → `@storybook/vue3-vite` · Nuxt → `@storybook-vue/nuxt` · SvelteKit → `@storybook/sveltekit` · Svelte + Vite → `@storybook/svelte-vite` · Angular → `@storybook/angular` · React Native (web preview) → `@storybook/react-native-web-vite` · Web components / plain → `@storybook/web-components-vite`, `@storybook/html-vite`.

Non-Vite frameworks (Angular, webpack) can't use `addon-vitest` — substitute `@storybook/test-runner` and say so.

**B2 — Inventory**
- Classify UI components: core primitives (Button, Input, Select, Checkbox, Dialog, Tooltip, Badge, Card), composites, layout/navigation.
- Read 3 representative components: variant axes (`cva` keys), states, controlled props, portals, required providers.
- Note jsdom gaps (cmdk → `ResizeObserver`, `scrollIntoView`; Radix Select → pointer capture).

**B3 — Plan.** Every step is a concrete command or a file with final content (baseline adapted to framework, stylesheet path, alias, public dir).

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

**B4 — Summary**: docs that exist today (good / partial / missing per area), the first phase to execute, and — if DESIGN.md is missing/off-format — `Run /design-expert before Phase 3.`
