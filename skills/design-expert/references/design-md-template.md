# DESIGN.md template

Two layers: **YAML front matter** (machine-readable token contract) and a **Markdown body** (why/where, referencing tokens as `{group.key}`, never contradicting front matter).

Replace every `<…>`. Delete a front-matter key only if the project has no such token. Never delete a body section — use the "Not yet defined" line.

## Front matter

```yaml
---
version: alpha                      # bump to beta/stable once the team signs off
name: <Project name>
description: <One dense paragraph: surface temperature, accent strategy, type pairing, hierarchy (tint ladder vs shadows), radius tiers. Reused verbatim as the Storybook Foundations intro.>

colors:
  # Runtime-themed (swapped by dark mode / multi-theme) → "var(--color-<name>)"; static → resolved hex "#0A0A0A".
  # Every text-bearing surface/fill gets a <name>-foreground.
  background: "<value>"
  foreground: "<value>"
  card: "<value>"
  card-foreground: "<value>"
  primary: "<value>"
  primary-foreground: "<value>"
  secondary: "<value>"
  secondary-foreground: "<value>"
  muted: "<value>"
  muted-foreground: "<value>"
  accent: "<value>"
  accent-foreground: "<value>"
  destructive: "<value>"
  destructive-foreground: "<value>"
  border: "<value>"
  input: "<value>"
  ring: "<value>"

typography:
  # Named by ROLE; one entry per role used. letterSpacing omitted when default.
  heading-1: { fontFamily: "<family>", fontSize: <px>, fontWeight: <100-900>, lineHeight: <unitless>, letterSpacing: "<em>" }
  title:     { fontFamily: "<family>", fontSize: <px>, fontWeight: <weight>, lineHeight: <unitless> }
  label:     { fontFamily: "<family>", fontSize: <px>, fontWeight: <weight>, lineHeight: <unitless> }
  body:      { fontFamily: "<family>", fontSize: <px>, fontWeight: <weight>, lineHeight: <unitless> }
  caption:   { fontFamily: "<family>", fontSize: <px>, fontWeight: <weight>, lineHeight: <unitless> }

rounded: { none: 0px, sm: <px>, md: <px>, lg: <px>, xl: <px>, 2xl: <px>, full: 9999px }

spacing:
  unit: <px>                         # base step (Tailwind default = 4px)

components:
  # Only components CONFIRMED in source; values reference {group.key}.
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.<key>}"
    padding: "<y> <x>"
  card:
    backgroundColor: "{colors.card}"
    borderColor: "{colors.border}"
    rounded: "{rounded.<key>}"
---
```

## Body

Section order and headings are exact.

```markdown
## Overview

<2–4 short paragraphs: surface temperature, accent strategy, type pairing, radius tiers, elevation. First mention of each color/radius: `{colors.x}` — `var(--color-x)`.>

**Key Characteristics:**

- <Most identifiable palette trait>
- <Accent strategy>
- <Type pairing>
- <Radius tiers>
- <Elevation strategy — tint ladder, shadow ladder, or both>
- <Semantic coverage — which status colors exist and which do NOT>

## Colors

### Brand

- **Primary** (`{colors.primary}` — `<value>`): <role, where used>
- **Primary Foreground** (`{colors.primary-foreground}` — `<value>`): <role>

### Surface

- **Background** (`{colors.background}` — `<value>`): <role>
- **Card** (`{colors.card}` — `<value>`): <role>
- **Muted** (`{colors.muted}` — `<value>`): <role>
- **Border / Input** (`{colors.border}`, `{colors.input}`): <role>

### Text

- **Foreground** (`{colors.foreground}`): <role>
- **Muted Foreground** (`{colors.muted-foreground}`): <role>

### Semantic

- **Destructive** (`{colors.destructive}` — `<value>`): <role>
- <success / warning / info — or "No confirmed warning/success/info colors.">

### Dark mode

- **Strategy:** <class (`.dark` on `<html>`) | media | data-attribute | none>
- **Mechanism:** <e.g. "`:root` light values, `.dark` overrides; toggled by next-themes">

## Typography

### Font Family

- **<Heading family>** — headings and UI labels. Loaded via <next/font | Google Fonts | @fontsource | @font-face>, weights <range>.
- **<Body family>** — body copy and fallback. Weights <range>.

### Hierarchy

| Role | Family | Size | Weight | Line height | Letter spacing | Use |
| --- | --- | --- | --- | --- | --- | --- |
| `{typography.heading-1}` | <family> | <px> | <w> | <lh> | <ls> | <where> |
| `{typography.title}` | … | … | … | … | — | … |
| `{typography.label}` | … | … | … | … | — | … |
| `{typography.body}` | … | … | … | … | — | … |
| `{typography.caption}` | … | … | … | … | — | … |

### Principles

- <e.g. "Headings and UI chrome always use the heading family.">

## Layout

### Spacing System

<`{spacing.unit}` and how the scale is applied; confirmed recurring paddings.>

### Grid & Container

<Max width(s), gutters, columns — actual class/value.>

### Responsive Strategy

| Breakpoint | Min-width | Notes |
| --- | --- | --- |
| sm | <px> | |
| md | <px> | |
| lg | <px> | |
| xl | <px> | |
| 2xl | <px> | |

## Elevation & Depth

| Level | Token / class | Use |
| --- | --- | --- |
| Resting | `shadow-sm` | <resting cards> |
| Hover | `shadow-md` | <hovered tiles> |
| Floating | `shadow-lg` | <popovers> |
| Overlay | `shadow-2xl` | <modals> |

<One paragraph: tint ladder vs shadow. Shadow-free → say so and drop the table.>

## Shapes

### Border Radius Scale

Ordered by usage frequency (most used first):

| Token | Value | Use |
| --- | --- | --- |
| `{rounded.full}` | 9999px | <pills, avatars> |
| `{rounded.2xl}` | <px> | <cards, modals> |
| `{rounded.md}` | <px> | <buttons, inputs> |

<One line on deliberate radius tiering.>

## Components

### <Component group, e.g. Buttons>

**`<component-token>`**

- Fill `{colors.x}`, label `{colors.y}`, shape `{rounded.z}`
- Confirmed variants: <class strings / sizes>
- States: <hover / focus / disabled>

### Other components

- _Not yet defined — only the entries above were confirmed in source; extend this section as more of the product surface is captured._

## Do's and Don'ts

### Do

- <Imperative rule tied to a token, e.g. "Reserve `{colors.primary}` as the only chromatic accent.">

### Don't

- <Imperative prohibition tied to a token, e.g. "Don't apply `{rounded.full}` to cards.">
```
