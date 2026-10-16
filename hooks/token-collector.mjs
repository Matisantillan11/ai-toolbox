#!/usr/bin/env node
// Real token usage for Claude Code, read from the transcripts it writes.
//
// The model cannot see its own usage, so nothing here asks it. Claude Code
// records every API response's `usage` block in the session transcript (and
// each sub-agent's in its own file); this hook reads those and stores input
// and output tokens per turn and per sub-agent in the analytics database.
//
// Wiring (hooks.json): Stop, SubagentStop and SessionEnd all run this file.
// Each one only spawns a detached collector and returns: Claude Code flushes
// the transcript asynchronously, so reading it while the hook runs would miss
// the turn that just ended. The collector waits, then re-reads the whole
// session — every write carries complete totals, so overlapping runs agree.
//
// Two rules this file must never break:
//   1. Nothing on stdout. Hook stdout can be fed back into the model's context.
//   2. Never fail the session. Every path exits 0; errors go to a local log.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ANALYTICS_ROOT = path.join(path.dirname(SELF), "..", "analytics-tool", "src");
const HOME_DIR = process.env.AI_TOOLBOX_ANALYTICS_HOME_DIR || process.env.AI_TOOLBOX_HOME_DIR || path.join(os.homedir(), ".ai-toolbox");
const LOG = path.join(HOME_DIR, "token-collector.log");
const COLLECT_DELAY_MS = Number(process.env.AI_TOOLBOX_COLLECT_DELAY_MS ?? 4000);

main();

function main() {
  if (process.env.AI_TOOLBOX_TOKEN_COLLECTOR === "off") {
    return;
  }

  if (process.argv[2] === "--collect") {
    setTimeout(() => collect(process.argv[3], process.argv[4], process.argv[5]), COLLECT_DELAY_MS);
    return;
  }

  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw || "{}");
      if (input.transcript_path) {
        spawnCollector(input.transcript_path, input.cwd || "", input.session_id || "");
      }
    } catch (error) {
      note("hook input failed", error);
    }
    process.exit(0);
  });
  process.stdin.on("error", () => process.exit(0));
}

function spawnCollector(transcriptPath, cwd, sessionId) {
  try {
    const child = spawn(process.execPath, [SELF, "--collect", transcriptPath, cwd, sessionId], {
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
  } catch (error) {
    note("spawn failed", error);
  }
}

async function collect(transcriptPath, cwd, sessionId) {
  let service;
  try {
    const { collectSession } = await import(moduleUrl("collector", "collect.js"));
    const { createAnalyticsTraceService } = await import(moduleUrl("analytics", "service.js"));

    const session = collectSession({ transcriptPath, cwd: cwd || undefined, sessionId: sessionId || undefined });
    if (session.records.length === 0) {
      return;
    }

    service = createAnalyticsTraceService();
    const result = service.recordUsage(session.sessionId, session.records);
    if (!result.ok) {
      note("store failed", new Error(result.error));
    }
  } catch (error) {
    note("collect failed", error);
  } finally {
    service?.close();
  }
}

function moduleUrl(...segments) {
  return pathToFileURL(path.join(ANALYTICS_ROOT, ...segments)).href;
}

function note(what, error) {
  try {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${what}: ${error?.message ?? error}\n`);
  } catch {
    // Nothing left to try.
  }
}
