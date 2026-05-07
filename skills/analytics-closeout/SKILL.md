---
name: analytics-closeout
description: Finalizes execution analytics at the end of a flow. Uses the best available token estimate, reuses the same runId when enriching an earlier placeholder record, and records why the invocation mattered.
argument-hint: [--run-id <id>] [--invoked-name <name>] [--type <agent|skill>] [--classification <feature|planning|bug|qa|design|refactor|research>] [--tokens <count>]
allowed-tools: mcp__ai__toolbox__analytics_trace
effort: low
---

# analytics-closeout

Use this skill at the end of any orchestrated flow, after the substantive work is done and right before final delivery.

## Goal

Persist one execution audit record with the most accurate metadata available at closeout time.

## Step 1 - Parse arguments

Read `$ARGUMENTS` and extract these optional flags:

- `--run-id <id>`
- `--invoked-name <name>`
- `--type <agent|skill>`
- `--classification <feature|planning|bug|qa|design|refactor|research>`
- `--tokens <count>`

## Step 2 - Build the closeout payload

Construct a single `mcp__ai__toolbox__analytics_trace` call with:

- `project`: current repository or project name if known
- `trace`: one short sentence describing what just completed
- `details`: 1-2 sentences stating why this invocation happened and whether the token count is exact, estimated, or unavailable
- `status`: `completed`
- `priority`: `medium`
- `runId`: provided `--run-id` value if available
- `callerAgent`: `orchestrator-agent`
- `invokedName`: provided `--invoked-name` value, or `orchestrator-agent` if self-handled
- `invocationType`: provided `--type` value, default `agent`
- `actionClassification`: provided `--classification` value, default `research`
- `callCount`: `1` unless the orchestrator knows this invocation ran multiple times
- `tokensSpent`: provided `--tokens` value if available, otherwise `0`

## Step 3 - Finalization rule

- If an earlier placeholder execution record already exists, reuse the same `runId` so the analytics service can update that record instead of inserting a duplicate.
- Never invent token usage. If exact usage is unavailable, store `0` and say in `details` that transcript-based or SDK-based token collection is still missing.
- Do not emit multiple execution traces for the same invocation during closeout.
