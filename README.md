# AI Toolbox — Claude Code Plugin + OpenCode Pack

A Claude Code plugin and OpenCode-compatible pack with a curated set of skills and agents for software teams. Covers accessibility auditing, code review, project initialization, design system documentation, and end-to-end feature planning workflows backed by ClickUp.

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

Agents follow an **orchestrator → sub-agent** architecture in Claude Code. The `orchestrator-agent` is the only agent Claude auto-selects — it analyzes every user request and routes to the correct specialist sub-agent.

In OpenCode, the same agents are installed as optional agents without pinning them to a specific model. Skills are also installed separately, so the user can choose the most suitable agent or skill for the job instead of inheriting Claude's auto-routing behavior.

### Orchestrator (default)

| Agent | Role |
|---|---|
| **orchestrator-agent** | **Default entry point.** Handles any user request by classifying intent, recalling NKN context through MCP, and routing to the right sub-agent. Always runs first; always responds last. |

### Sub-agents (invoked by orchestrator only)

| Agent | Activated when |
|---|---|
| **planning-features-agent** | `new_feature` intent — coordinates discovery + planning end-to-end. |
| **feature-discovery-agent** | Called by `planning-features-agent` — structured requirement interviews → FEATURE_SPEC + ClickUp ticket. |
| **plan-expert-agent** | `quick_task`, `refactor`, or after discovery — decomposes specs into 8-section subtasks. |
| **implement-task-agent** | `implementation` intent or after planning — writes code, runs review, commits, opens PR. |
| **design-system-setup-agent** | `design_system` intent — design-expert → design-system-docs → plan-expert pipeline. |

> **How to use:** Just describe what you want in natural language. The orchestrator routes automatically. Use `/` skills for direct, one-off invocations when you know exactly which step to run.

---

## Requirements

- [Claude Code](https://claude.ai/code) CLI installed
- A ClickUp account with API access (for skills that create/read tickets)
- A GitHub personal access token (for the GitHub MCP server)

---

## Installation

### NKN MCP runtime

This repository ships a self-contained Node.js workspace under `learn-tool/` for NKN access. It contains the MCP server, local CLI, SQLite service layer, and tests. The MCP server is meant to be started as a local process through `pnpm`, not from a GitHub URL.

```bash
cd learn-tool && pnpm install
```

Claude Code can load the included `.mcp.json` project config so agents can call `mcp__ai__toolbox__nkn__recall`, `mcp__ai__toolbox__nkn__learn`, `mcp__ai__toolbox__nkn__update`, and `mcp__ai__toolbox__nkn__delete` directly. The SQLite database stays at `~/.ai-toolbox/nkn.db` by default, or you can override it with `AI_TOOLBOX_NKN_DB_PATH`.

Important:
- MCP server entries must point to a local checked-out copy of this repository.
- Do not use a GitHub URL like `https://github.com/Matisantillan11/ai-toolbox/learn-tool` in `.mcp.json`.
- Prefer an absolute filesystem path when configuring another project.

### Using learn-tool

Install dependencies once:

```bash
cd learn-tool && pnpm install
```

Run the local validation commands:

```bash
cd learn-tool && pnpm run check
cd learn-tool && pnpm test
```

Initialize the SQLite database manually if needed:

```bash
node learn-tool/src/cli/nkn.js init
```

Query past learnings from the CLI:

```bash
node learn-tool/src/cli/nkn.js query --term "auth flow"
```

Persist a learning from the CLI:

```bash
node learn-tool/src/cli/nkn.js log \
  --project "ai-toolbox" \
  --topic "Architecture" \
  --decision "Use the learn-tool MCP for NKN access" \
  --reasoning "Centralizes memory access for all agents"
```

Update an existing learning from the CLI:

```bash
node learn-tool/src/cli/nkn.js update \
  --id 1 \
  --decision "Use the ai-toolbox NKN MCP for memory access"
```

Delete an existing learning from the CLI:

```bash
node learn-tool/src/cli/nkn.js delete --id 1
```

Start the MCP server through the package script:

```bash
cd learn-tool && pnpm run mcp:start
```

Sensitive values such as decision bodies, reasoning text, and raw payloads are redacted from logs by default. The ai-toolbox guidance now treats learning as automatic, and stale memories can also be updated or deleted automatically through the MCP tools.

If you want to use this MCP from another project, first make sure this repository exists locally on disk and `learn-tool` dependencies are installed. Then configure that other project's `.mcp.json` like this:

```json
{
  "mcpServers": {
    "ai__toolbox__nkn": {
      "command": "pnpm",
      "args": [
        "--dir",
        "/Users/matisantillandev/Desktop/Projects/ai-toolbox/learn-tool",
        "--silent",
        "run",
        "mcp:start"
      ]
    }
  }
}
```

Notes:
- Replace the path above with the real absolute path on your machine.
- Avoid `~` in `.mcp.json`; many runners do not expand it reliably.
- The value for `--dir` must be a local directory containing `learn-tool/package.json`.
- A GitHub URL cannot be used here because MCP must launch a local process.

### Option 1 — Install directly in Claude Code through the marketplace

Add the marketplace, then install the plugin from it:

```bash
claude plugin marketplace add Matisantillan11/ai-toolbox
claude plugin install ai-toolbox@matisantillan11-ai-toolbox --scope user
```

If the marketplace already exists, refresh it first:

```bash
claude plugin marketplace update matisantillan11-ai-toolbox
```

---

### Option 2 — Clone locally for development

Use this option if you want to modify skills or develop your own on top of this plugin.

**1. Clone the repository**

Pick a permanent location on your machine — this folder needs to stay there as long as you want the plugin active.

```bash
git clone https://github.com/Matisantillan11/ai-toolbox ~/tools/ai-toolbox
```

**2. Load the plugin locally while developing**

```bash
claude --plugin-dir ~/tools/ai-toolbox
```

This loads the local checkout directly for the current Claude session, which is the safest path while iterating on plugin files.

**3. Keep it up to date**

Since the plugin runs from your local clone, updating is a regular `git pull`:

```bash
cd ~/tools/ai-toolbox && git pull
```

---

### Option 3 — Unified Installer for Claude, Antigravity, OpenCode, and Codex

Use the single installer from the root of the project where you want `.mcp.json` configured. It will:
- maintain a local ai-toolbox checkout in `~/.ai-toolbox/repo`
- install `learn-tool` dependencies with `pnpm`
- write or update `.mcp.json` so `ai__toolbox__nkn` points at that local checkout
- write or update `.codex/config.toml` with the same `ai__toolbox__nkn` server when Codex is selected
- install the selected Claude, Antigravity, OpenCode, and/or Codex assets

Interactive mode:

```bash
bash <(curl -s https://raw.githubusercontent.com/Matisantillan11/ai-toolbox/main/install.sh)
```

Non-interactive examples:

```bash
bash <(curl -s https://raw.githubusercontent.com/Matisantillan11/ai-toolbox/main/install.sh) --targets claude
bash <(curl -s https://raw.githubusercontent.com/Matisantillan11/ai-toolbox/main/install.sh) --targets antigravity,opencode
bash <(curl -s https://raw.githubusercontent.com/Matisantillan11/ai-toolbox/main/install.sh) --targets codex
bash <(curl -s https://raw.githubusercontent.com/Matisantillan11/ai-toolbox/main/install.sh) --targets all
bash <(curl -s https://raw.githubusercontent.com/Matisantillan11/ai-toolbox/main/install.sh) --targets opencode --global-opencode
```

Target behavior:
- `claude`: adds the ai-toolbox marketplace and installs `ai-toolbox@matisantillan11-ai-toolbox`
- `antigravity`: installs native Knowledge Items into `.gemini/`
- `opencode`: installs skills into `.opencode/skills/` and agents into `.opencode/agents/`
- `codex`: installs skills into `.agents/skills/`, exports custom agents into `.codex/agents/`, and configures project-local Codex MCP in `.codex/config.toml`

MCP behavior:
- `learn-tool` is installed locally at `~/.ai-toolbox/repo/learn-tool`
- `.mcp.json` in the current project is updated with the `ai__toolbox__nkn` server entry
- when `codex` is selected, `.codex/config.toml` is also updated with the same server as a Codex MCP entry

Important:
- OpenCode agents are exported without pinning a model.
- OpenCode agents do not preload skills.
- Codex custom agents are exported without pinning a model.
- Codex does not auto-run these agents; they stay available for explicit use or delegation.
- This is intentional so users can choose the right model, agent, and skill per task.

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
│   ├── orchestrator-agent.md            # Default entry point — routes all intents
│   ├── planning-features-agent.md       # Sub-agent: discovery + planning pipeline
│   ├── feature-discovery-agent.md       # Sub-agent: requirement interviews
│   ├── plan-expert-agent.md             # Sub-agent: technical decomposition
│   ├── implement-task-agent.md          # Sub-agent: code + PR delivery
│   └── design-system-setup-agent.md     # Sub-agent: design system pipeline
├── learn-tool/
│   ├── package.json                     # Dedicated Node.js workspace for the NKN tool
│   ├── src/
│   │   ├── cli/nkn.js                   # Local NKN CLI for init/query/log
│   │   ├── mcp/server.js                # MCP server exposing learn/recall
│   │   └── nkn/                         # Shared SQLite-backed NKN core
│   └── test/
│       └── nkn-service.test.js          # NKN service coverage
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
   description: >
     Sub-agent: invoked only by the orchestrator-agent when [X intent] is detected.
     [What it does]. Do not invoke directly.
   model: claude-opus-4-6
   color: blue
   effort: medium
   tools:
     - AskUserQuestion
     - Read
     - Bash
   skills:
     - skill-one
     - skill-two
   ---

   Agent orchestration instructions...
   ```

   **Important:** All agents in this plugin are sub-agents. Only `orchestrator-agent` is
   auto-selected by Claude Code. New agents must be registered in the orchestrator's Routing Table.

3. Use the `skills` frontmatter field to preload skills. This ensures skills execute inline in the agent's context rather than being delegated to a subagent.

> **Note:** If you want the workflow to also be available as a `/` command, create a matching skill under `skills/my-agent/SKILL.md` with `allowed-tools` instead of `tools` and the same body. Both files can coexist — the agent handles auto-selection, the skill handles direct invocation.

---

## MCP servers

| Server | Type | Purpose |
|---|---|---|
| `nkn` | stdio | Local SQLite-backed project memory for recall and user-confirmed learn operations |
| `github` | HTTP | GitHub repository operations via the Copilot MCP endpoint |
| `clickup` | HTTP | ClickUp task management — read tickets, create tasks and subtasks |

The MCP configuration is automatically picked up by Claude Code as a project-scoped config. Tokens are read from environment variables — never committed to the repo.
