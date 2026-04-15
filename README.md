# AI Toolbox — Claude Code Plugin

A Claude Code plugin with a curated set of skills and agents for software teams. Covers accessibility auditing, code review, project initialization, design system documentation, and end-to-end feature planning workflows backed by ClickUp.

---

## What's inside

### Skills

Skills are reusable workflows invoked with a `/` command directly in Claude Code. Each skill is independent and can be used on its own.

| Skill | Command | What it does |
|---|---|---|
| **init-project** | `/init-project` | Scans the codebase and generates an `AGENTS.md` with the detected stack, structure, and dev commands. Run this first on any new project. |
| **code-review** | `/code-review` | Two-phase code review: fast pre-commit checks (spec compliance, type safety, security) followed by a deep SOLID / KISS / DRY structural audit. |
| **a11y-auditor** | `/a11y-auditor` | Audits code or components for accessibility barriers against WCAG 2.2 (A, AA, AAA). Auto-detects web vs. mobile stack. |
| **feature-discovery** | `/feature-discovery` | Acts as a functional analyst to gather all feature requirements through structured questioning. Outputs a comprehensive spec and optionally creates a ClickUp ticket. |
| **plan-expert** | `/plan-expert` | Takes a ClickUp ticket or a free-form description and breaks it into detailed, ordered subtasks using a structured 8-section template. Creates subtasks on the ClickUp ticket or as a local task list. |
| **design-expert** | `/design-expert` | Scans the project for all design-related information (colors, typography, spacing, component patterns, dark mode, design system) and generates or updates a `DESIGN.md` file. |
| **design-system-docs** | `/design-system-docs` | Audits design system documentation. If Storybook is present, reviews its quality and suggests improvements. If not, produces a step-by-step plan to implement it. |
| **design-system-setup** | `/design-system-setup` | End-to-end design system setup. Runs `design-expert` → `design-system-docs` → `plan-expert` in sequence to document the design system, audit or plan Storybook, and create all execution tasks in ClickUp or locally. |
| **planning-features** | `/planning-features` | End-to-end feature planning. Runs `feature-discovery` then `plan-expert` back to back — gathers requirements, creates a ClickUp ticket, and breaks it into an execution plan. |
| **create-pr** | `/create-pr` | Creates a GitHub PR with a fully auto-populated standardized template. Infers base branch, derives description from the diff, detects shared code impact, tags stakeholders from CODEOWNERS, and builds a concrete test plan. Designed to run without human input when called by an agent. |
| **implement-task** | `/implement-task` | Implements a task end-to-end. Given a ClickUp ticket ID or description, reads project context, plans at the file level, writes the code, runs automated checks + `code-review`, applies fixes, commits, and opens a PR via `create-pr`. |

### Agents

Agents orchestrate multiple skills in sequence. They are auto-selected by Claude based on context, or accessible via `/agents`.

| Agent | What it does |
|---|---|
| **planning-features-agent** | Runs `feature-discovery` then `plan-expert` back to back. Gathers all requirements, creates a ClickUp ticket, and immediately breaks it into an execution plan with subtasks. |
| **design-system-setup-agent** | Runs `design-expert` → `design-system-docs` → `plan-expert` in sequence. Documents the design system, audits or plans Storybook, and creates all execution tasks in ClickUp or locally. |
| **implement-task-agent** | Implements a task end-to-end. Resolves a ClickUp ticket or description (via `plan-expert`), reads the codebase, plans and writes the code, runs `code-review` and applies fixes, commits, and opens a PR via `create-pr`. |

> **Tip:** Each agent has a matching skill (`/planning-features`, `/design-system-setup`) for direct slash-command invocation. Use the skill when you know exactly what you want; rely on the agent for automatic selection when you describe the goal naturally.

---

## Requirements

- [Claude Code](https://claude.ai/code) CLI installed
- A ClickUp account with API access (for skills that create/read tickets)
- A GitHub personal access token (for the GitHub MCP server)

---

## Installation

### Option 1 — Install directly via Claude Code (no cloning required)

Point Claude Code to the GitHub repository URL and it will install the plugin automatically:

```bash
claude plugins add https://github.com/Matisantillan11/ai-toolbox
```

Then enable it:

```bash
claude plugins enable ai-toolbox
```

Claude Code fetches the plugin from GitHub and keeps it available. To update to the latest version at any time:

```bash
claude plugins update ai-toolbox
```

---

### Option 2 — Clone and install locally

Use this option if you want to modify skills or develop your own on top of this plugin.

**1. Clone the repository**

Pick a permanent location on your machine — this folder needs to stay there as long as you want the plugin active.

```bash
git clone https://github.com/Matisantillan11/ai-toolbox ~/tools/ai-toolbox
```

**2. Register the plugin with Claude Code**

```bash
claude plugins add ~/tools/ai-toolbox
claude plugins enable ai-toolbox
```

Or open `~/.claude/settings.json` and add it manually:

```json
{
  "enabledPlugins": {
    "ai-toolbox": true
  }
}
```

**3. Keep it up to date**

Since the plugin runs from your local clone, updating is a regular `git pull`:

```bash
cd ~/tools/ai-toolbox && git pull
```

---

### Option 3 — Install for Gemini / Antigravity

If you want to use these skills directly in Gemini/Antigravity instead of Claude, you can instantly inject the Knowledge Items (KIs) into your project by running the official installer.

Run this single command from the root of any project:

```bash
bash <(curl -s https://raw.githubusercontent.com/Matisantillan11/ai-toolbox/main/install.sh)
```

This will safely download the AI-Toolbox and link the skills as native KIs in a `.gemini/` folder locally, keeping your project portable. Just ask Gemini *"Run the init-project skill"* to test it!

---

### Verify the setup

Open Claude Code in any project and run:

```
/init-project
```

If the skill runs and produces an `AGENTS.md` file, the plugin is working.

---

## Usage

### Skills

All skills accept optional arguments. Run without arguments and the skill will ask for what it needs.

```bash
# Scan the project and generate AGENTS.md
/init-project

# Review only files changed against main
/code-review --base-branch main

# Audit for WCAG AA compliance (default)
/a11y-auditor

# Audit for WCAG AAA compliance
/a11y-auditor --level AAA

# Start a feature discovery session
/feature-discovery

# Start with an initial idea
/feature-discovery --description "Allow users to export reports as PDF"

# Plan from a ClickUp ticket
/plan-expert --ticket-id abc123xyz

# Plan from a description
/plan-expert --description "Build a user authentication flow with email and OAuth"

# Document the project's design system
/design-expert

# Audit or plan Storybook documentation
/design-system-docs

# Full design system setup (design-expert + design-system-docs + plan-expert)
/design-system-setup

# Full feature planning session (feature-discovery + plan-expert)
/planning-features

# Create a PR with auto-populated template from the current branch diff
/create-pr

# Create a PR targeting a specific base branch
/create-pr --base develop

# Implement a task from a ClickUp ticket and open a PR
/implement-task --ticket-id abc123xyz

# Implement a task from a description (runs plan-expert first, then implements)
/implement-task --description "Add email validation to the signup form"
```

### Agents

Agents are invoked by describing the task naturally — Claude Code selects the right agent automatically based on what you ask. They are also accessible via `/agents`.

```
# Feature planning
"I want to plan a new feature"
"Let's plan the user notification system"

# Design system setup
"Set up the design system for this project"
"I want to document our design system and plan the Storybook work"

# Task implementation
"Implement ticket CU-abc123"
"Work on this task and open a PR when done"
```

---

## Project structure

```
ai-toolbox/
├── .claude-plugin/
│   └── plugin.json                      # Plugin metadata
├── agents/
│   ├── planning-features-agent.md
│   ├── design-system-setup-agent.md
│   └── implement-task-agent.md
├── skills/
│   ├── a11y-auditor/
│   │   └── SKILL.md
│   ├── code-review/
│   │   └── SKILL.md
│   ├── create-pr/
│   │   └── SKILL.md
│   ├── design-expert/
│   │   └── SKILL.md
│   ├── design-system-docs/
│   │   └── SKILL.md
│   ├── design-system-setup/
│   │   └── SKILL.md
│   ├── feature-discovery/
│   │   └── SKILL.md
│   ├── implement-task/
│   │   └── SKILL.md
│   ├── init-project/
│   │   └── SKILL.md
│   ├── plan-expert/
│   │   └── SKILL.md
│   └── planning-features/
│       └── SKILL.md
└── README.md
```

---

## Adding a new skill

1. Create a new directory under `skills/`:
   ```bash
   mkdir skills/my-skill
   ```

2. Create `skills/my-skill/SKILL.md` with this frontmatter:
   ```markdown
   ---
   name: my-skill
   description: One-line description of when and why to use this skill.
   argument-hint: [--option <value>]
   allowed-tools: Read Grep Glob Bash AskUserQuestion
   effort: low|medium|high
   ---

   # my-skill

   Instructions for Claude to follow when this skill is invoked...
   ```

3. The skill is immediately available as `/my-skill` in any project where this plugin is enabled.

---

## Adding a new agent

1. Create a new file under `agents/`:
   ```bash
   touch agents/my-agent.md
   ```

2. Write the agent file with this frontmatter:
   ```markdown
   ---
   name: my-agent
   description: When Claude should automatically select this agent.
   tools: AskUserQuestion, Read, Bash
   skills: [skill-one, skill-two]
   model: sonnet
   effort: medium
   ---

   Agent orchestration instructions...
   ```

3. Use the `skills` frontmatter field to preload skills. This ensures skills execute inline in the agent's context rather than being delegated to a subagent.

> **Note:** If you want the workflow to also be available as a `/` command, create a matching skill under `skills/my-agent/SKILL.md` with `allowed-tools` instead of `tools` and the same body. Both files can coexist — the agent handles auto-selection, the skill handles direct invocation.

---

## MCP servers

| Server | Type | Purpose |
|---|---|---|
| `github` | HTTP | GitHub repository operations via the Copilot MCP endpoint |
| `clickup` | HTTP | ClickUp task management — read tickets, create tasks and subtasks |

The MCP configuration is automatically picked up by Claude Code as a project-scoped config. Tokens are read from environment variables — never committed to the repo.
