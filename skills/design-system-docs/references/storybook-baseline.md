# Storybook baseline

Reference every audit compares against and every setup plan produces. Examples: Next.js + Tailwind v4 + Vitest; for other stacks swap the framework package (SKILL.md B1) — structure is unchanged.

Target **Storybook 10.x**. Controls/Actions/Viewport/Backgrounds/Toolbars/Interactions are core (v9+); test utilities come from `storybook/test`.

## 1. Dependencies

```jsonc
// devDependencies
"storybook": "^10",
"@storybook/nextjs-vite": "^10",     // framework package
"@storybook/addon-docs": "^10",      // autodocs, MDX, doc blocks
"@storybook/addon-a11y": "^10",      // axe per story, surfaced in Vitest
"@storybook/addon-vitest": "^10",    // stories run as browser tests
"@chromatic-com/storybook": "^5", "chromatic": "^18",   // visual regression (CHROMATIC_PROJECT_TOKEN)
"eslint-plugin-storybook": "^10",
"vitest", "@vitest/browser-playwright", "playwright",
"@testing-library/react", "@testing-library/jest-dom", "jsdom"
```

**Deprecated — flag and remove:**

| Package | Replace with |
| --- | --- |
| `@storybook/addon-essentials` | Core (v9+) — delete |
| `@storybook/addon-interactions` | Core (v9+) — delete |
| `@storybook/test`, `@storybook/jest`, `@storybook/testing-library` | `import { … } from "storybook/test"` |
| `@storybook/addon-storysource` | addon-docs "Show code" panel |
| `@storybook/test-runner` | `@storybook/addon-vitest` (Vite frameworks) |
| `@storybook/experimental-nextjs-vite` | `@storybook/nextjs-vite` |
| `storybook-dark-mode` | `@storybook/addon-themes` (only if dark mode) |

## 2. Scripts

```jsonc
"storybook": "storybook dev -p 6006",
"build-storybook": "storybook build",
"test": "vitest run",                          // unit + storybook projects
"test:storybook": "vitest --project=storybook",
"chromatic": "chromatic --exit-zero-on-changes"
```

## 3. `.storybook/main.ts`

```ts
import type { StorybookConfig } from "@storybook/nextjs-vite";
const config: StorybookConfig = {
  stories: [
    "../stories/**/*.mdx",                     // global docs only (Foundations)
    "../components/**/*.mdx", "../components/**/*.stories.@(ts|tsx)",   // co-located
    "../app/**/*.mdx", "../app/**/*.stories.@(ts|tsx)",
    "../_pocs/**/*.mdx", "../_pocs/**/*.stories.@(ts|tsx)",             // POCs (§10)
  ],
  addons: ["@chromatic-com/storybook", "@storybook/addon-vitest", "@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: "@storybook/nextjs-vite",
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
};
export default config;
```

## 4. `.storybook/preview.tsx`

```tsx
import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";                   // SAME stylesheet as the app
const preview: Preview = {
  tags: ["autodocs"],
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    options: { storySort: { order: ["Foundations", "UI", "POCs"] } },   // POCs last
  },
};
export default preview;
```

Global decorators only for providers **every** story needs (theme, i18n, query client); others go in that component's `meta.decorators`.

## 5. Vitest integration

```ts
// vitest.config.mts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
const dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "~": path.resolve(dirname, ".") } },
  test: {
    passWithNoTests: true,
    projects: [
      { extends: true, test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"], globals: true } },
      {
        extends: true,
        plugins: [storybookTest({ configDir: path.join(dirname, ".storybook") })],
        test: { name: "storybook", browser: { enabled: true, headless: true, provider: playwright({}), instances: [{ browser: "chromium" }] } },
      },
    ],
  },
});
```

```ts
// vitest.shims.d.ts
/// <reference types="@vitest/browser-playwright" />
```

`vitest.setup.ts` imports `@testing-library/jest-dom/vitest` and stubs jsdom gaps (`ResizeObserver`, `Element.prototype.scrollIntoView`, pointer-capture methods), each with a one-line comment naming the library that needs it.

## 6. File layout per UI component

```
components/ui/button/
  button.component.tsx           # component only — default export
  button.types.ts                # ButtonProps and shared types
  button-variants.constants.ts   # cva variant map
  button.spec.tsx                # behaviour spec + snapshot
  button.stories.tsx             # stories + play tests
  __snapshots__/
  index.ts                       # barrel
```

Two-layer components (`<name>-core` primitive + `<name>` smart wrapper): only the smart layer gets `.spec.tsx` and `.stories.tsx`.

## 7. Story file contract

```tsx
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ButtonProps } from "./button.types";
import Button from "./button.component";

const VARIANTS = ["primary", "destructive", "outline"] as const satisfies readonly ButtonProps["variant"][];
const SIZES = ["default", "sm", "lg"] as const satisfies readonly ButtonProps["size"][];

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
    docs: { description: { component: "Primary action. Built on Radix `Slot` + `cva`; DESIGN.md `button-primary`: `{colors.primary}`, `{rounded.md}`." } },
  },
  argTypes: {
    variant: { control: "select", options: VARIANTS, table: { defaultValue: { summary: "primary" } } },
    size: { control: "select", options: SIZES },
    onClick: { table: { disable: true } },
  },
  args: { children: "Button", onClick: fn() },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllVariants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-8">
      {VARIANTS.map((v) => (
        <div key={v}><h3>{v}</h3>{SIZES.map((s) => <Button key={s} variant={v} size={s}>{s}</Button>)}</div>
      ))}
    </div>
  ),
};

export const Primary: Story = { args: { variant: "primary" } };

/** Use when the action is unavailable. */
export const Disabled: Story = { args: { disabled: true } };

/** Clicking fires onClick once. */
export const Clickable: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Button" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
```

Rules:

1. CSF3 only: `const meta = {…} satisfies Meta<typeof X>`, `type Story = StoryObj<typeof meta>`, named exports. No `Template.bind({})`.
2. `title` is `"UI/<Component>"` for `components/ui/**`; feature components use their feature group.
3. `parameters.docs.description.component` names the underlying primitive and the `DESIGN.md` tokens used.
4. Every story except `AllVariants` and the primary default has a one-line JSDoc saying when to use that state.
5. More than one variant/size axis → `AllVariants`, grouped by variant, exported right after `export default meta`, controls disabled.
6. One story per variant and per meaningful state (disabled, loading, error, empty, open, with icon, `asChild`).
7. Callbacks are `fn()` spies in `args`, hidden from the args table.
8. Every interactive component has ≥ 1 `play` test. Query by role/label; use `screen` instead of `within(canvasElement)` for portal content (dialogs, popovers, selects, toasts).
9. Controlled components get a small stateful `*Demo` wrapper (`useState`) via `render`.
10. Provider needs go in `meta.decorators`.
11. Icon-only stories pass `aria-label`; the a11y addon must report zero violations.

## 8. Foundations page — `stories/foundations.mdx`

Rendered counterpart of `DESIGN.md`; `DESIGN.md` wins on disagreement.

```mdx
import { Meta, ColorPalette, ColorItem, Typeset, Unstyled } from "@storybook/addon-docs/blocks";
import { Button, Input } from "../components/ui";     // relative — ~ alias may not resolve in MDX

<Meta title="Foundations" />

# Foundations

<DESIGN.md front-matter `description`, verbatim>

This page is the rendered counterpart of `DESIGN.md`. If the two disagree, `DESIGN.md` wins — fix this page.

**Key characteristics**
<DESIGN.md Overview → Key Characteristics, verbatim>

## Colors
### Brand
<ColorPalette>
  <ColorItem title="Primary" subtitle="<role from DESIGN.md>" colors={{ primary: "var(--color-primary)" }} />
</ColorPalette>
### Surface · ### Text · ### Semantic   (one ColorPalette each, same grouping as DESIGN.md)

## Typography      — one live specimen per {typography.*} role, with family/size/weight/line-height
## Radius          — one box per {rounded.*} step, labeled with its use
## Elevation       — one card per shadow level
## Components      — live Button/Input/Card examples using the confirmed tokens
## Do's and Don'ts — DESIGN.md list, verbatim
## Design system vs POCs — "Everything under UI is the design system. Everything under POCs is an
##                          exploration: never imported by app code, never in DESIGN.md. Promoting a
##                          POC means rebuilding it as a UI component."
```

## 9. Lint

`eslint.config.mjs` extends `plugin:storybook/recommended` (flat: `...storybook.configs["flat/recommended"]`).

## 10. POCs — `_pocs/`

Explorations composing existing design-system components; shown in Storybook for review, **not** part of the design system.

```
_pocs/checkout-summary/
  checkout-summary.poc.tsx       # composes UI components
  order-line.tsx                 # local pieces stay here, never in the UI directory
  checkout-summary.stories.tsx   # required
  checkout-summary.spec.tsx      # optional
```

- **Title:** `POCs/<Name>` (sorted after `UI`, §4).
- **Story:** §7 structure; `parameters.docs.description.component` states the composition pattern (e.g. function as child, compound namespace), why, and the future design-system implementation.
- **Isolation:** nothing outside `_pocs/` imports from it; POCs never touch the UI directory, its barrel (`index.ts`), or `DESIGN.md`.
- **Promotion:** rebuild in the UI directory per §6–7 using the POC's pattern. The POC folder is not deleted automatically; remove it once the component is approved.
