---
name: a11y-auditor
description: Audits code, components, or screenshots for accessibility barriers following WCAG 2.2 (Levels A, AA, AAA). Detects the environment automatically and runs only the relevant checks — Web (HTML, React, Next.js, Tailwind) or Mobile (React Native, Expo, Swift, Kotlin).
argument-hint: [--level <A|AA|AAA>]
allowed-tools: Read Grep Glob Bash
effort: high
disable-model-invocation: true
---

# a11y-auditor

Role: senior accessibility engineer. Standard: WCAG 2.2 A/AA/AAA. Deliver actionable, criterion-referenced findings for the given code, components, or screenshots.

Usage: `/a11y-auditor [--level A|AA|AAA]`

## Step 1 — Conformance level

Parse `$ARGUMENTS` for `--level` (`A`, `AA`, `AAA`); default `AA`. On an invalid value, tell the user and list the valid levels. Report only criteria at or below the target level.

## Step 2 — Environment

Stack source of truth: `PROJECT_CONTEXT` if passed; else `AGENTS.md` at the root; else `CLAUDE.md`. Read its `## Stack` (or equivalent). Never infer from file extensions or imports.
- **Web**: HTML, React, Next.js, Remix, Astro, Nuxt, Svelte, Angular, any browser stack.
- **Mobile**: React Native, Expo, Swift/SwiftUI, Kotlin/Jetpack Compose, Flutter.
- Both (e.g. Expo Web) → Web; note the dual target in the report.

If no project instructions or no stack is identified, stop and tell the user: the stack is unknown, so the audit would be unreliable; run `/init-project` to generate `AGENTS.md`, then re-run `/a11y-auditor`.

Run only the matching section below.

## Web Audit

**Perceivable**
- 1.1.1 (A) `<img>` has meaningful `alt`; decorative `alt=""`. Icon-only buttons/links named via `aria-label`/`aria-labelledby`/visually hidden text. Content SVGs have `<title>` + `role="img"`.
- 1.2 (A/AA) `<video>`/`<audio>` have captions (A) and audio description (AA); media is not the sole carrier of information.
- 1.3.1 (A) Semantic HTML: headings, landmarks (`main`, `nav`, `header`, `footer`, `aside`), lists, `label`/`fieldset`/`legend`.
- 1.3.2 (A) Reading/operation order makes sense without CSS.
- 1.3.3 (A) Instructions don't rely only on shape, color, position.
- 1.3.4 (AA) No orientation lock unless essential.
- 1.3.5 (AA) Inputs have correct `autocomplete`.
- 1.4.1 (A) Color is not the only means of conveying information.
- 1.4.3 (AA) Contrast: normal text ≥ 4.5:1, large ≥ 3:1. 1.4.6 (AAA): ≥ 7:1 / ≥ 4.5:1.
- 1.4.4 (AA) Text resizes to 200% without loss.
- 1.4.5 (AA) No images of text except logos.
- 1.4.10 (AA) Reflow at 320px without horizontal scroll.
- 1.4.11 (AA) Non-text contrast (UI parts, focus indicators) ≥ 3:1.
- 1.4.12 (AA) Text spacing overrides (line-height 1.5×, letter 0.12em, word 0.16em) cause no loss.
- 1.4.13 (AA) Hover/focus content is dismissible, hoverable, persistent.

**Operable**
- 2.1.1/2.1.2 (A) Everything keyboard-operable; no keyboard traps.
- 2.1.4 (A) Single-character shortcuts can be turned off or remapped.
- 2.2.2 (A) Moving/auto-updating content can be paused, stopped, or hidden.
- 2.3.1 (A) Nothing flashes more than 3×/second.
- 2.4.1 (A) Working skip-to-main link. 2.4.2 (A) Descriptive `<title>`. 2.4.3 (A) Logical focus order. 2.4.4 (A) Link purpose clear from text or context.
- 2.4.5 (AA) Multiple navigation mechanisms. 2.4.6 (AA) Descriptive headings/labels. 2.4.7 (AA) Visible focus indicator.
- 2.4.11 (AA) Focused element not obscured; 2.4.13 (AAA) focus indicator area and contrast sufficient.
- 2.5.1 (A) Pointer gestures have single-pointer alternatives. 2.5.2 (A) Pointer cancellation (no down-event activation). 2.5.3 (A) Visible label is in the accessible name. 2.5.4 (A) Motion input has a UI alternative and can be disabled.
- 2.5.8 (AA) Targets ≥ 24×24 CSS px.

**Understandable**
- 3.1.1 (A) `<html lang>` set and correct. 3.1.2 (AA) Language changes use `lang`.
- 3.2.1/3.2.2 (A) No context change on focus or on input without warning. 3.2.3/3.2.4 (AA) Consistent navigation and labeling.
- 3.3.1 (A) Errors identified and described in text. 3.3.2 (A) Inputs have labels/instructions. 3.3.3 (AA) Error suggestions when known. 3.3.4 (AA) Legal/financial submissions reviewable and correctable.

**Robust**
- 4.1.1/4.1.2 (A) Valid markup (no duplicate IDs or AT-breaking nesting); name, role, value exposed via native semantics or ARIA.
- 4.1.3 (AA) Status messages announced without focus (`role="status"`/`"alert"`, `aria-live`).

## Mobile Audit

**React Native / Expo**
- Perceivable: `<Image>` has `accessible` + meaningful `accessibilityLabel`; decorative uses `accessibilityElementsHidden` (iOS) / `importantForAccessibility="no"` (Android). Icon buttons have `accessibilityLabel` + `accessibilityRole="button"`. Color not the only state signal. Contrast ≥ 4.5:1 normal, ≥ 3:1 large. Text scales with system font size (don't defeat `allowFontScaling`).
- Operable: touchables (`Pressable`, `Touchable*`) ≥ 44×44 pt (iOS) / 48×48 dp (Android). Custom gestures have a single-tap alternative. Timed interactions can be extended or disabled. Animations respect `AccessibilityInfo.isReduceMotionEnabled()`.
- Understandable: correct `accessibilityRole` (`button`, `link`, `header`, `image`, `text`, `checkbox`, `radio`, `tab`, `none`). `accessibilityState` reflects `{ disabled, selected, checked, busy, expanded }`. `accessibilityHint` clarifies non-obvious actions without repeating the label. Inputs labeled (`accessibilityLabelledBy` RN 0.71+ or grouped label + input). Errors announced via `AccessibilityInfo.announceForAccessibility()`.
- Robust: modals use `accessibilityViewIsModal`; focus scope managed with `importantForAccessibility` / `accessibilityElementsHidden`. No `pointerEvents="none"` on screen-reader-reachable elements. Recommend manual VoiceOver/TalkBack testing.

**Swift (iOS)**
- Informative views: `isAccessibilityElement = true` + meaningful `accessibilityLabel`.
- Correct `accessibilityTraits` (`.button`, `.header`, `.link`, `.image`, `.selected`, `.notEnabled`); `accessibilityHint` describes the result.
- Dynamic Type: `UIFont.preferredFont(forTextStyle:)` + `adjustsFontForContentSizeCategory = true`.
- Targets ≥ 44×44 pt. Respect `UIAccessibility.isReduceMotionEnabled`. Gesture-only actions also exposed via `UIAccessibilityCustomAction`.

**Kotlin (Android)**
- Interactive views have `contentDescription`; decorative set `importantForAccessibility` explicitly.
- Custom roles/actions and `AccessibilityNodeInfo` via `ViewCompat.setAccessibilityDelegate`.
- Targets ≥ 48×48 dp. Reduce motion: honor `Settings.Global.TRANSITION_ANIMATION_SCALE == 0`.

## Step 3 — Report

```
## A11y Audit Report

**Environment:** Web | Mobile (<platform>)
**Conformance Level:** A | AA | AAA
**Files / Components Reviewed:** <list>

### ❌ Violations
| WCAG | Level | Issue | Location | Fix |
|------|-------|-------|----------|-----|
| 1.1.1 | A | Missing alt on <img src="hero.png"> | Hero.tsx:14 | Add alt="..." or alt="" if decorative |

### ⚠️ Warnings (manual verification needed)
| WCAG | Level | Issue | Location | Notes |
|------|-------|-------|----------|-------|

### ✅ Passed
- <criterion and what was verified>

### Summary
- **Violations:** X
- **Warnings:** X
- **Passed:** X
- **Overall:** Fails / Passes Level <target>

### Recommended Next Steps
1. <highest priority fix>
```

Order violations by impact: screen-reader blockers, keyboard, visual/contrast, then AAA enhancements. If `axe-core`, `eslint-plugin-jsx-a11y`, or `@testing-library/jest-dom` is present, mark which violations are automatable vs. manual.

## Step 4 — Export

Skip entirely when the caller says read-only / do not modify files (e.g. a workflow gate) — return the report only.

Otherwise ask with `AskUserQuestion`:
1. Header "Export report": "Would you like to export this audit report as a Markdown file?" — `Yes` / `No`. On No, stop.
2. Header "Export location": "Where should the report be saved?" — `Default (docs/)` (`docs/a11y-audit-report.md`) / `Custom path` (user types it via "Other").

Resolve the path from the project root, create missing directories, write the report exactly as displayed, and confirm `Report saved to <resolved-path>`.
