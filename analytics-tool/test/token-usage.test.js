import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAnalyticsTraceService } from "../src/analytics/service.js";
import { createDatabaseConnection, selectSessionUsage, selectTokenUsage } from "../src/analytics/db.js";
import { findIntentMarker } from "../src/analytics/intents.js";
import { agentRunId, collectSession, turnRunId } from "../src/collector/collect.js";
import { parseAgentTranscript, parseSessionTranscript } from "../src/collector/transcript.js";

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "hooks", "token-collector.mjs");
const SESSION = "sess-1";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-usage-"));
}

function jsonl(records) {
  return records.map((record) => JSON.stringify(record)).join("\n") + "\n";
}

function user(promptId, content, extra = {}) {
  return { type: "user", sessionId: SESSION, promptId, cwd: "/work/my-app", gitBranch: "main", timestamp: "2026-10-16T10:00:00.000Z", message: { role: "user", content }, ...extra };
}

/** One API response written the way Claude Code writes it: one line per content block, same id and usage on each. */
function response(id, usage, blocks, extra = {}) {
  return blocks.map((block) => ({
    type: "assistant",
    sessionId: SESSION,
    version: "2.5.0",
    timestamp: "2026-10-16T10:00:05.000Z",
    message: { id, model: "claude-opus-5-5", usage, content: [block] },
    ...extra,
  }));
}

const usage = (input, output, cacheRead = 0, cacheCreation = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheCreation,
});

test("findIntentMarker only accepts a known intent on a line of its own, last one wins", () => {
  assert.equal(findIntentMarker("[ai-toolbox] intent=bug_fix"), "bug_fix");
  assert.equal(findIntentMarker("Routing.\n[ai-toolbox] intent=quick_task\n...\n[ai-toolbox] intent=refactor\n"), "refactor");
  assert.equal(findIntentMarker("emit `[ai-toolbox] intent=bug_fix` when done"), null);
  assert.equal(findIntentMarker("[ai-toolbox] intent=<intent>"), null);
  assert.equal(findIntentMarker("[ai-toolbox] intent=feature"), null);
});

test("parseSessionTranscript counts each API response once and splits turns by promptId", () => {
  const text = jsonl([
    user("p1", "first question"),
    ...response("msg-a", usage(3, 100, 1000, 50), [{ type: "thinking" }, { type: "text", text: "hi" }, { type: "tool_use", input: {} }]),
    user("p1", [{ type: "tool_result", content: "ok" }]),
    ...response("msg-b", usage(2, 40, 1200, 10), [{ type: "text", text: "done" }]),
    user("p2", "second question"),
    ...response("msg-c", usage(5, 7, 0, 900), [{ type: "text", text: "sure" }]),
  ]);

  const { sessionId, turns } = parseSessionTranscript(text);

  assert.equal(sessionId, SESSION);
  assert.equal(turns.length, 2);
  assert.deepEqual(
    { input: turns[0].inputTokens, out: turns[0].outputTokens, read: turns[0].cacheReadTokens, write: turns[0].cacheCreationTokens, calls: turns[0].apiCalls, tools: turns[0].toolCalls },
    { input: 5, out: 140, read: 2200, write: 60, calls: 2, tools: 1 },
  );
  assert.equal(turns[1].outputTokens, 7);
  assert.equal(turns[1].cacheCreationTokens, 900);
  assert.equal(turns[0].model, "claude-opus-5-5");
});

test("parseSessionTranscript skips sidechain and synthetic records and reads intent markers", () => {
  const text = jsonl([
    user("p1", "fix the login bug"),
    ...response("msg-a", usage(1, 10), [{ type: "text", text: "Classified.\n[ai-toolbox] intent=bug_fix" }]),
    ...response("msg-side", usage(999, 999), [{ type: "text", text: "sub-agent work" }], { isSidechain: true }),
    { type: "assistant", sessionId: SESSION, message: { id: "msg-syn", model: "<synthetic>", usage: usage(0, 0), content: [{ type: "text", text: "No response requested." }] } },
  ]);

  const [turn] = parseSessionTranscript(text).turns;

  assert.equal(turn.intent, "bug_fix");
  assert.equal(turn.inputTokens, 1);
  assert.equal(turn.outputTokens, 10);
  assert.equal(turn.apiCalls, 1);
});

test("parseAgentTranscript bills the whole sub-agent run and picks up the marker from its prompt", () => {
  const text = jsonl([
    user("p1", "[ai-toolbox] intent=refactor\nRefactor the parser.", { isSidechain: true, agentId: "a1" }),
    ...response("m1", usage(4, 20, 300, 30), [{ type: "text", text: "on it" }, { type: "tool_use", input: {} }], { isSidechain: true }),
    ...response("m2", usage(1, 5, 330, 0), [{ type: "text", text: "done" }], { isSidechain: true }),
  ]);

  const agent = parseAgentTranscript(text);

  assert.equal(agent.agentId, "a1");
  assert.equal(agent.promptId, "p1");
  assert.equal(agent.intent, "refactor");
  assert.equal(agent.inputTokens, 5);
  assert.equal(agent.outputTokens, 25);
  assert.equal(agent.cacheReadTokens, 630);
  assert.equal(agent.apiCalls, 2);
  assert.equal(agent.toolCalls, 1);
});

function writeSession(dir, { orchestratorMarkerInAgent = false } = {}) {
  const transcriptPath = path.join(dir, `${SESSION}.jsonl`);
  fs.writeFileSync(
    transcriptPath,
    jsonl([
      user("p1", "plan the feature"),
      ...response("msg-a", usage(2, 30, 100, 10), [{ type: "tool_use", input: { prompt: "classify and route" } }]),
      user("p1", [{ type: "tool_result", content: "routed" }]),
      ...response("msg-b", usage(1, 5), [{ type: "text", text: "done" }]),
      user("p2", "aborted before any response"),
    ]),
  );

  const agents = path.join(dir, SESSION, "subagents");
  fs.mkdirSync(agents, { recursive: true });
  fs.writeFileSync(
    path.join(agents, "agent-a1.jsonl"),
    jsonl([
      user("p1", "classify and route", { isSidechain: true, agentId: "a1" }),
      ...response("m1", usage(7, 70, 700, 70), [{ type: "text", text: orchestratorMarkerInAgent ? "[ai-toolbox] intent=new_feature" : "routed" }], { isSidechain: true }),
    ]),
  );
  fs.writeFileSync(path.join(agents, "agent-a1.meta.json"), JSON.stringify({ agentType: "ai-toolbox:orchestrator-agent", description: "Route request" }));
  return transcriptPath;
}

test("collectSession links sub-agents to the turn that spawned them and skips empty turns", () => {
  const dir = tempDir();
  const transcriptPath = writeSession(dir);

  const { sessionId, records } = collectSession({ transcriptPath });

  assert.equal(sessionId, SESSION);
  assert.equal(records.length, 2);
  const [turn, agent] = records;
  assert.equal(turn.runId, turnRunId(SESSION, "p1"));
  assert.equal(turn.project, "my-app");
  assert.equal(turn.agentName, "main");
  assert.equal(turn.outputTokens, 35);
  assert.equal(agent.runId, agentRunId(SESSION, "a1"));
  assert.equal(agent.parentRunId, turn.runId);
  assert.equal(agent.agentName, "ai-toolbox:orchestrator-agent");
  assert.equal(agent.description, "Route request");
  assert.equal(agent.inputTokens, 7);
  assert.equal(agent.outputTokens, 70);
});

test("recordUsage is idempotent, keeps intents, and spreads the orchestrator intent to the turn", () => {
  const dir = tempDir();
  const dbPath = path.join(dir, "analytics.db");
  const transcriptPath = writeSession(dir, { orchestratorMarkerInAgent: true });
  const service = createAnalyticsTraceService({ dbPath });
  const sqlite = createDatabaseConnection(dbPath);

  try {
    const first = collectSession({ transcriptPath });
    assert.deepEqual(service.recordUsage(first.sessionId, first.records), { ok: true, stored: 2 });
    // A later collection of the same session must replace, not add.
    assert.equal(service.recordUsage(first.sessionId, first.records).ok, true);

    const rows = selectTokenUsage(sqlite, { sessionId: SESSION });
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.intent === "new_feature"));

    // A write without an intent never erases one.
    const untagged = first.records.map((record) => ({ ...record, intent: null }));
    service.recordUsage(SESSION, untagged);
    assert.ok(selectTokenUsage(sqlite, { sessionId: SESSION }).every((row) => row.intent === "new_feature"));

    const [summary] = selectSessionUsage(sqlite);
    assert.equal(summary.turns, 1);
    assert.equal(summary.agent_runs, 1);
    assert.equal(summary.input_tokens, 2 + 1 + 7);
    assert.equal(summary.total_input_tokens, 2 + 1 + 7 + 100 + 10 + 700 + 70);
    assert.equal(summary.output_tokens, 35 + 70);
    assert.equal(summary.intents, "new_feature");
  } finally {
    service.close();
    sqlite.close();
  }
});

test("rows with no marker anywhere keep a NULL intent", () => {
  const dir = tempDir();
  const dbPath = path.join(dir, "analytics.db");
  const service = createAnalyticsTraceService({ dbPath });
  const sqlite = createDatabaseConnection(dbPath);

  try {
    const { sessionId, records } = collectSession({ transcriptPath: writeSession(dir) });
    service.recordUsage(sessionId, records);
    assert.ok(selectTokenUsage(sqlite, { sessionId }).every((row) => row.intent === null));
  } finally {
    service.close();
    sqlite.close();
  }
});

test("recordUsage rejects an unknown intent and stores nothing from that batch", () => {
  const dir = tempDir();
  const dbPath = path.join(dir, "analytics.db");
  const service = createAnalyticsTraceService({ dbPath });
  const sqlite = createDatabaseConnection(dbPath);

  try {
    const { sessionId, records } = collectSession({ transcriptPath: writeSession(dir) });
    records[1].intent = "research";
    assert.equal(service.recordUsage(sessionId, records).ok, false);
    assert.equal(selectTokenUsage(sqlite, { sessionId }).length, 0);
  } finally {
    service.close();
    sqlite.close();
  }
});

test("token-collector hook prints nothing, exits 0, and stores the session", async () => {
  const dir = tempDir();
  const transcriptPath = writeSession(dir, { orchestratorMarkerInAgent: true });
  const env = { ...process.env, AI_TOOLBOX_ANALYTICS_HOME_DIR: dir, AI_TOOLBOX_COLLECT_DELAY_MS: "0" };

  const result = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: "Stop", session_id: SESSION, transcript_path: transcriptPath, cwd: "/work/my-app" }),
    env,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");

  // The collector runs detached; wait for it to land.
  const dbPath = path.join(dir, "analytics.db");
  let rows = [];
  for (let attempt = 0; attempt < 50 && rows.length < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!fs.existsSync(dbPath)) {
      continue;
    }
    const sqlite = createDatabaseConnection(dbPath);
    try {
      rows = selectTokenUsage(sqlite, { sessionId: SESSION });
    } catch {
      rows = [];
    } finally {
      sqlite.close();
    }
  }

  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.intent === "new_feature"));
});

test("token-collector hook survives garbage input", () => {
  const result = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8", env: { ...process.env, AI_TOOLBOX_ANALYTICS_HOME_DIR: tempDir() } });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("collectSession keeps turns copied from a resumed session under their original session", () => {
  const dir = tempDir();
  const transcriptPath = path.join(dir, "sess-new.jsonl");
  fs.writeFileSync(
    transcriptPath,
    jsonl([
      user("p0", "earlier work", { sessionId: "sess-old" }),
      ...response("msg-old", usage(1, 10), [{ type: "text", text: "old" }], { sessionId: "sess-old" }),
      user("p1", "continue", { sessionId: "sess-new" }),
      ...response("msg-new", usage(2, 20), [{ type: "text", text: "new" }], { sessionId: "sess-new" }),
    ]),
  );

  const { sessionId, records } = collectSession({ transcriptPath });

  assert.equal(sessionId, "sess-new");
  assert.deepEqual(records.map((record) => record.runId), [turnRunId("sess-old", "p0"), turnRunId("sess-new", "p1")]);
  assert.deepEqual(records.map((record) => record.sessionId), ["sess-old", "sess-new"]);
});
