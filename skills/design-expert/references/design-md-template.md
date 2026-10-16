# DESIGN.md template

This is the exact shape every `DESIGN.md` must follow. It has two layers:

1. **YAML front matter** — the machine-readable token contract. Agents read values from here.
2. **Markdown body** — the human/agent-readable rationale. It explains *why* and *where*, always referencing tokens by `{group.key}`, never re-declaring raw values that contradict the front matter.

Replace every `<…>` placeholder. Delete a front-matter key only if the project genuinely has no such token. Never delete a body section — use the "Not yet defined" line instead.

---

## Front matter

```yaml
---
version: alpha                      # bump to beta/stable once the team signs off
name: <Project name>
description: <One dense paragraph: the visual identity in plain words — surface temperature, accent strategy, type pairing, how hierarchy is expressed (tint ladder vs shadows), radius tiers. This paragraph is reused verbatim as the intro of the Storybook Foundations page.>

colors:
  # Value rule:
  #   - Runtime-themed tokens (CSS variables swapped by dark mode / multi-theme) → "var(--color-<name>)"
  #   - Static tokens (no runtime swap)                                         → resolved hex, e.g. "#0A0A0A"
  # Pairs are mandatory: every surface/fill token that carries text gets a <name>-foreground.
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
  # Named by ROLE, not by size. One entry per role actually used in the UI.
  heading-1:
    fontFamily: "<family>"
    fontSize: <px>
    fontWeight: <100-900>
    lineHeight: <unitless>
    letterSpacing: "<em>"            # omit when default
  title:
    fontFamily: "<family>"
    fontSize: <px>
    fontWeight: <weight>
    lineHeight: <unitless>
  label:
    fontFamily: "<family>"
    fontSize: <px>
    fontWeight: <weight>
    lineHeight: <unitless>
  body:
    fontFamily: "<family>"
    fontSize: <px>
    fontWeight: <weight>
    lineHeight: <unitless>
  caption:
    fontFamily: "<family>"
    fontSize: <px>
    fontWeight: <weight>
    lineHeight: <unitless>

rounded:
  none: 0px
  sm: <px>
  md: <px>
  lg: <px>
  xl: <px>
  2xl: <px>
  full: 9999px

spacing:
  unit: <px>                         # base step of the spacing scale (Tailwind default = 4px)

components:
  # Only components whose styling was CONFIRMED in source. Values reference tokens with {group.key}.
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

---

## Body

Section order is fixed. Headings are exact.

```markdown
## Overview

<2–4 short paragraphs: surface temperature, accent strategy, type pairing, radius tiers, elevation strategy. Every color/radius mention is written as `{colors.x}` — `var(--color-x)` (token + resolved/CSS reference) the first time it appears.>

**Key Characteristics:**

- <The single most identifiable trait of the palette>
- <Accent strategy — how many accents, what they are for>
- <Type pairing>
- <Radius tiers — e.g. cards softer than buttons>
- <Elevation strategy — tint ladder, shadow ladder, or both>
- <Semantic coverage — which status colors exist and which do NOT>

## Colors

### Brand

- **Primary** (`{colors.primary}` — `<value>`): <role, where it is used>
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
- <success / warning / info — or state explicitly: "No confirmed warning/success/info colors.">

### Dark mode

- **Strategy:** <class (`.dark` on `<html>`) | media | data-attribute | none>
- **Mechanism:** <e.g. "`:root` holds light values, `.dark` overrides the same variables; toggled by next-themes">

## Typography

### Font Family

- **<Heading family>** — headings and UI labels. Loaded via <next/font | Google Fonts link | @fontsource | @font-face>, weights <range>.
- **<Body family>** — body copy and fallback. Weights <range>.

### Hierarchy

| Role                     | Family   | Size | Weight | Line height | Letter spacing | Use            |
| ------------------------ | -------- | ---- | ------ | ----------- | -------------- | -------------- |
| `{typography.heading-1}` | <family> | <px> | <w>    | <lh>        | <ls>           | <where>        |
| `{typography.title}`     | …        | …    | …      | …           | —              | …              |
| `{typography.label}`     | …        | …    | …      | …           | —              | …              |
| `{typography.body}`      | …        | …    | …      | …           | —              | …              |
| `{typography.caption}`   | …        | …    | …      | …           | —              | …              |

### Principles

- <e.g. "Headings and UI chrome always use the heading family; never set body copy in it.">

## Layout

### Spacing System

<Base unit `{spacing.unit}` and how the scale is applied; note any confirmed recurring paddings, e.g. `p-6`, `px-8 py-7`.>

### Grid & Container

<Max container width(s), gutters, grid columns — with the actual class/value.>

### Responsive Strategy

| Breakpoint | Min-width | Notes |
| ---------- | --------- | ----- |
| sm         | <px>      |       |
| md         | <px>      |       |
| lg         | <px>      |       |
| xl         | <px>      |       |
| 2xl        | <px>      |       |

## Elevation & Depth

| Level        | Token / class | Use                                  |
| ------------ | ------------- | ------------------------------------ |
| Resting      | `shadow-sm`   | <e.g. resting cards>                 |
| Hover        | `shadow-md`   | <e.g. hovered tiles>                 |
| Floating     | `shadow-lg`   | <e.g. popovers>                      |
| Overlay      | `shadow-2xl`  | <e.g. modals>                        |

<One paragraph: when to use the tint ladder vs a shadow. If the system is shadow-free, say so and drop the table.>

## Shapes

### Border Radius Scale

Ordered by usage frequency in source (most used first):

| Token            | Value  | Use                         |
| ---------------- | ------ | --------------------------- |
| `{rounded.full}` | 9999px | <pills, avatars, …>         |
| `{rounded.2xl}`  | <px>   | <cards, modals, …>          |
| `{rounded.md}`   | <px>   | <buttons, inputs, …>        |

<One line on any deliberate radius tiering.>

## Components

### <Component group, e.g. Buttons>

**`<component-token>`**

- Fill `{colors.x}`, label `{colors.y}`, shape `{rounded.z}`
- Confirmed variants: <class strings / sizes found in source>
- States: <hover / focus / disabled behaviour found in source>

### Other components

- _Not yet defined — only the entries above were confirmed in source; extend this section as more of the product surface is captured._

## Do's and Don'ts

### Do

- <Imperative rule tied to a token, e.g. "Reserve `{colors.primary}` as the only chromatic accent.">

### Don't

- <Imperative prohibition tied to a token, e.g. "Don't apply `{rounded.full}` to cards.">
```
