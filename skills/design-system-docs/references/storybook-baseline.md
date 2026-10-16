# Storybook baseline

The reference implementation every audit compares against and every setup plan produces. Examples are for Next.js + Tailwind v4 + Vitest; swap the framework package for other stacks (table in B1 of SKILL.md) — the structure does not change.

Target: **Storybook 10.x**. Since v9, Controls/Actions/Viewport/Backgrounds/Toolbars/Interactions live in core, and test utilities are imported from `storybook/test`.

---

## 1. Dependencies

```jsonc
// package.json → devDependencies
"storybook": "^10",
"@storybook/nextjs-vite": "^10",          // framework package (Vite-based, preferred for Next.js)
"@storybook/addon-docs": "^10",           // autodocs, MDX, doc blocks (ColorPalette, …)
"@storybook/addon-a11y": "^10",           // axe checks per story, surfaced in Vitest runs
"@storybook/addon-vitest": "^10",         // every story runs as a browser component test
"@chromatic-com/storybook": "^5",         // visual regression (needs CHROMATIC_PROJECT_TOKEN)
"chromatic": "^18",
"eslint-plugin-storybook": "^10",
"vitest": "...", "@vitest/browser-playwright": "...", "playwright": "...",
"@testing-library/react": "...", "@testing-library/jest-dom": "...", "jsdom": "..."
```

**Deprecated — flag and remove if present:**

| Package                                                  | Replace with                                     |
| -------------------------------------------------------- | ------------------------------------------------ |
| `@storybook/addon-essentials`                            | Built into core (v9+) — delete                   |
| `@storybook/addon-interactions`                          | Built into core (v9+) — delete                   |
| `@storybook/test`, `@storybook/jest`, `@storybook/testing-library` | `import { … } from "storybook/test"`   |
| `@storybook/addon-storysource`                           | addon-docs "Show code" panel                     |
| `@storybook/test-runner`                                 | `@storybook/addon-vitest` (Vite frameworks)      |
| `@storybook/experimental-nextjs-vite`                    | `@storybook/nextjs-vite`                         |
| `storybook-dark-mode`                                    | `@storybook/addon-themes` (only if dark mode)    |

## 2. Scripts

```jsonc
"storybook": "storybook dev -p 6006",
"build-storybook": "storybook build",
"test": "vitest run",                         // runs unit + storybook projects together
"test:storybook": "vitest --project=storybook",
"chromatic": "chromatic --exit-zero-on-changes"
```

## 3. `.storybook/main.ts`

```ts
import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: [
    "../stories/**/*.mdx",                       // global, non-component docs only (Foundations)
    "../components/**/*.mdx",
    "../components/**/*.stories.@(ts|tsx)",      // stories are co-located with components
    "../app/**/*.mdx",
    "../app/**/*.stories.@(ts|tsx)",
    "../_pocs/**/*.mdx",                         // POCs — explorations, never part of the design system (§10)
    "../_pocs/**/*.stories.@(ts|tsx)",
  ],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
  ],
  framework: "@storybook/nextjs-vite",
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
};
export default config;
```

## 4. `.storybook/preview.tsx`

```tsx
import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";                    // the SAME stylesheet the app loads — tokens, fonts, resets

const preview: Preview = {
  tags: ["autodocs"],                           // every component gets a Docs page; no per-file opt-in needed
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    options: {
      storySort: { order: ["Foundations", "UI", "POCs"] },   // Foundations leads; POCs always last
    },
  },
};
export default preview;
```

Add a global decorator only for providers that **every** story needs (theme, i18n, query client). Providers needed by one component go in that component's `meta.decorators`.

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
      {
        extends: true,                          // unit/spec tests
        test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"], globals: true },
      },
      {
        extends: true,                          // every story = a browser component test
        plugins: [storybookTest({ configDir: path.join(dirname, ".storybook") })],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
```

```ts
// vitest.shims.d.ts
/// <reference types="@vitest/browser-playwright" />
```

`vitest.setup.ts` imports `@testing-library/jest-dom/vitest` and stubs jsdom gaps the headless primitives need (`ResizeObserver`, `Element.prototype.scrollIntoView`, pointer-capture methods) — each stub with a one-line comment naming the library that requires it.

## 6. File layout per UI component

```
components/ui/button/
  button.component.tsx           # component only — default export
  button.types.ts                # ButtonProps and shared types
  button-variants.constants.ts   # cva variant map
  button.spec.tsx                # behaviour spec + snapshot
  button.stories.tsx             # stories + play-function interaction tests
  __snapshots__/
  index.ts                       # barrel
```

For a two-layer component (`<name>-core` restyled primitive + `<name>` smart wrapper), only the smart layer gets `.spec.tsx` and `.stories.tsx`.

## 7. Story file contract

```tsx
import type { Meta, StoryObj } from "@storybook/nextjs-vite";   // from the framework package
import { expect, fn, userEvent, within } from "storybook/test";
import { ButtonProps } from "./button.types";
import Button from "./button.component";

// Variant axes as typed constants — the single list both argTypes and AllVariants read from.
const VARIANTS = ["primary", "destructive", "outline", "secondary", "ghost", "link"] as const satisfies readonly ButtonProps["variant"][];
const SIZES = ["default", "sm", "lg", "icon"] as const satisfies readonly ButtonProps["size"][];

const meta = {
  title: "UI/Button",                                   // "UI/<Component>" — matches storySort
  component: Button,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        // What it is, what it is built on, and which DESIGN.md tokens it uses.
        component: "The primary interactive action. Built on Radix `Slot` (`asChild`) and `cva`, using DESIGN.md `button-primary`: `{colors.primary}` fill, `{rounded.md}` corners.",
      },
    },
  },
  argTypes: {
    variant: { control: "select", options: VARIANTS, description: "Visual style.", table: { defaultValue: { summary: "primary" } } },
    size:    { control: "select", options: SIZES,    description: "Padding/height.", table: { defaultValue: { summary: "default" } } },
    onClick: { table: { disable: true } },              // callbacks hidden from the table
  },
  args: { children: "Button", onClick: fn() },          // callbacks are spies so play functions can assert
  tags: ["autodocs"],
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every variant × size, grouped by variant. Exported FIRST — the snapshot target for Chromatic. */
export const AllVariants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-8">
      {VARIANTS.map((variant) => (
        <div key={variant} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground capitalize">{variant}</h3>
          <div className="flex flex-wrap items-center gap-4">
            {SIZES.map((size) => <Button key={size} variant={variant} size={size}>{size}</Button>)}
          </div>
        </div>
      ))}
    </div>
  ),
};

/** Default CTA — fills with `{colors.primary}`. */
export const Primary: Story = { args: { variant: "primary" } };

export const Disabled: Story = { args: { disabled: true } };

/** Interaction test: clicking fires onClick exactly once. */
export const Clickable: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Button" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

/** Interaction test: disabled is inert, not just dimmed. */
export const DisabledIsNotClickable: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button", { name: "Button" });
    await expect(button).toBeDisabled();
    await expect(userEvent.click(button)).rejects.toThrow(/pointer-events/i);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
```

Rules the contract encodes:

1. CSF3 only: `const meta = {…} satisfies Meta<typeof X>`, `type Story = StoryObj<typeof meta>`, named story exports. No `Template.bind({})`.
2. `title` is `"UI/<Component>"` for `components/ui/**`; feature components use their feature group.
3. `parameters.docs.description.component` names the primitive it is built on and the `DESIGN.md` tokens it consumes.
4. Every story except `AllVariants` and the primary default has a one-line JSDoc stating when to use that state.
5. More than one variant/size axis → an `AllVariants` story, grouped by variant, exported immediately after `export default meta`, controls disabled.
6. One story per variant and per meaningful state (disabled, loading, error, empty, open, with icon, `asChild`).
7. Callbacks are `fn()` spies in `args` and hidden from the args table.
8. Every interactive component has ≥ 1 `play` interaction test. Query by role/label (`getByRole`, `getByLabelText`); use `screen` instead of `within(canvasElement)` for content rendered in a portal (dialogs, popovers, selects, toasts).
9. Controlled components get a small stateful `*Demo` wrapper (`useState`) rendered via `render`, so interaction tests exercise real state changes.
10. Components needing a provider declare it in `meta.decorators`.
11. Icon-only stories pass an `aria-label` — the a11y addon must report zero violations.

## 8. Foundations page — `stories/foundations.mdx`

The rendered counterpart of `DESIGN.md`. `DESIGN.md` is the source of truth; if they disagree, fix the page.

```mdx
import { Meta, ColorPalette, ColorItem, Typeset, Unstyled } from "@storybook/addon-docs/blocks";
import { Button, Input } from "../components/ui";     // relative import — the ~ alias may not resolve in MDX

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
## Components      — live Button/Input/Card examples showing the confirmed tokens in use
## Do's and Don'ts — DESIGN.md list, verbatim
## Design system vs POCs — "Everything under UI is the design system. Everything under POCs is an
##                          exploration: never imported by app code, never in DESIGN.md. Promoting a
##                          POC means rebuilding it as a UI component."
```

## 9. Lint

`eslint.config.mjs` extends `plugin:storybook/recommended` (flat config: `...storybook.configs["flat/recommended"]`).

## 10. POCs — `_pocs/`

POCs are explorations built by composing existing design-system components. They are visible in Storybook so they can be reviewed, but they are **not** part of the design system.

```
_pocs/checkout-summary/
  checkout-summary.poc.tsx       # the POC, composing components from the UI directory
  order-line.tsx                 # local pieces live here too, never in the UI directory
  checkout-summary.stories.tsx   # required
  checkout-summary.spec.tsx      # optional
```

- **Title:** `POCs/<Name>` — the sidebar shows them after `UI` (§4).
- **Story:** same structure as §7. `parameters.docs.description.component` states the composition pattern chosen (e.g. function as child, compound namespace), why, and what the future design-system implementation would look like.
- **Isolation:** nothing outside `_pocs/` imports from `_pocs/`. POCs never add to the UI directory, its barrel (`index.ts`), or `DESIGN.md`.
- **Promotion:** rebuild the component in the UI directory following §6–7, using the POC's pattern as input. The POC folder is not deleted automatically; remove it once the component is approved.
