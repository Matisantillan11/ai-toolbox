# AI Toolbox — Claude Code Plugin

A Claude Code plugin with a curated set of skills and agents for software teams. Covers accessibility auditing, code review, project initialization, and an end-to-end feature planning workflow backed by ClickUp.

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
| **plan-expert** | `/plan-expert` | Takes a ClickUp ticket or a free-form description and breaks it into detailed, ordered subtasks. Creates the subtasks directly on the ClickUp ticket or as a local task list. |

### Agents

Agents orchestrate multiple skills in sequence and run as a single end-to-end workflow.

| Agent | What it does |
|---|---|
| **planning-features-agent** | Runs `feature-discovery` then `plan-expert` back to back. Gathers all requirements, creates a ClickUp ticket, and immediately breaks it into an execution plan with subtasks. |

---

## Requirements

- [Claude Code](https://claude.ai/code) CLI installed
- A ClickUp account with API access (for skills that create/read tickets)
- A GitHub personal access token (for the GitHub MCP server)

---

## Installation

### 1. Clone the repository

Pick a permanent location on your machine — this folder needs to stay there as long as you want the plugin active.

```bash
git clone https://github.com/matisantillandev/ai-toolbox ~/tools/ai-toolbox
```

### 2. Register the plugin with Claude Code

Point Claude Code to the local folder:

```bash
claude plugins add ~/tools/ai-toolbox
```

Then enable it:

```bash
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

### 3. Configure MCP servers

The plugin ships with an `mcp.json` that pre-configures the GitHub and ClickUp MCP servers. You need to supply your GitHub token as an environment variable.

Add this to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export GITHUB_TOKEN=your_github_personal_access_token
```

The first time Claude Code connects to each MCP server, it will ask for your approval. ClickUp uses browser-based OAuth — no token setup required.

### 4. Verify the setup

Open Claude Code in any project and run:

```
/init-project
```

If the skill runs and produces an `AGENTS.md` file, the plugin is working.

### Keeping it up to date

Since the plugin runs from your local clone, updating is a regular `git pull`:

```bash
cd ~/tools/ai-toolbox && git pull
```

No reinstallation needed — Claude Code picks up the changes on the next session.

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
```

### Agents

Agents are invoked by describing the task naturally — Claude Code selects the right agent automatically based on what you ask.

```bash
# Start a full feature planning session (discovery → spec → ClickUp ticket → subtasks)
"I want to plan a new feature"
"Let's plan the user notification system"
```

Or explicitly:

```bash
claude --agent planning-features-agent
```

---

## Project structure

```
ai-toolbox/
├── .claude-plugin/
│   └── plugin.json          # Plugin metadata
├── agents/
│   └── planning-features-agent.md
├── skills/
│   ├── a11y-auditor/
│   │   └── SKILL.md
│   ├── code-review/
│   │   └── SKILL.md
│   ├── feature-discovery/
│   │   └── SKILL.md
│   ├── init-project/
│   │   └── SKILL.md
│   └── plan-expert/
│       └── SKILL.md
├── mcp.json                 # MCP server configuration (GitHub + ClickUp)
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

---

## MCP servers

| Server | Type | Purpose |
|---|---|---|
| `github` | HTTP | GitHub repository operations via the Copilot MCP endpoint |
| `clickup` | HTTP | ClickUp task management — read tickets, create tasks and subtasks |

The `mcp.json` at the project root is automatically picked up by Claude Code as a project-scoped MCP config. Tokens are read from environment variables — never committed to the repo.
