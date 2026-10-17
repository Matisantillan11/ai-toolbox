---
name: create-issue
description: Acts as an issue triager to gather all required information for a bug or issue, creates a ticket in ClickUp, and then creates an issue in GitHub natively using the templates.
argument-hint: [--title "<issue title>" | --description "<initial issue description>"]
allowed-tools: Bash AskUserQuestion mcp__clickup__clickup_get_workspace_hierarchy mcp__clickup__clickup_create_task mcp__github__issue_write
effort: medium
disable-model-invocation: true
---

# create-issue

Gather what `templates/issue_template.md` needs, confirm it, create a ClickUp task, then a linked GitHub issue. Be conversational: one or a few grouped questions at a time.

## Step 1 — Context

Use `--title` / `--description` from `$ARGUMENTS` if present (acknowledge briefly). Otherwise `AskUserQuestion`, header "Create Issue": "What issue or bug are you reporting? Please provide a brief summary or title to start."

## Step 2 — Fill the template

Ask, in grouped `AskUserQuestion` calls, only for what's missing:
1. **Expected Behavior**
2. **Current Behavior**
3. **Steps to Reproduce** — insist on unambiguous steps.
4. **Context (Environment)** — impact, goal, OS/browser/version.
5. **Possible Solution** (optional).

## Step 3 — Confirm

```markdown
# [Issue Title]

## Expected Behavior
<description>

## Current Behavior
<description>

## Steps to Reproduce
1. <step 1>
2. <step 2>

## Context (Environment)
<description>

## Possible Solution
<description>
```

Ask: "Does this capture the issue correctly? Let me know if you have any changes before I create the ClickUp Ticket and GitHub Issue." Apply changes first.

## Step 4 — ClickUp

1. Unless the list is already known: `mcp__clickup__clickup_get_workspace_hierarchy`, present spaces/lists, `AskUserQuestion`: "Which list should I create this ClickUp task in?"
2. `mcp__clickup__clickup_create_task { list_id: "<selected list id>", name: "<Issue Title>", description: "<full issue spec in markdown>" }`
3. Keep the task `url`.

## Step 5 — GitHub

1. `git remote get-url origin` → extract `OWNER`/`REPO` (SSH or HTTPS form).
2. `mcp__github__issue_write { method: "create", owner: "<OWNER>", repo: "<REPO>", title: "<Issue Title>", body: "<full issue spec in markdown>\n\n---\n**ClickUp Task:** <task url>" }`
3. On failure, tell the user and ask whether to retry or finish. On success keep the issue URL.

## Step 6 — Finalize

Output exactly:

```markdown
✅ Issue successfully created!

**ClickUp Task:** <task url>
**GitHub Issue:** <github issue url>
```
