import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { createAnalyticsTraceService } from "../analytics-tool/src/analytics/service.js"
import { createDatabaseConnection, selectTokenUsage } from "../analytics-tool/src/analytics/db.js"
import { findIntentMarker } from "../analytics-tool/src/analytics/intents.js"

import {
  agentRunId,
  buildUsageRecords,
  createUsageTracker,
  registerMessage,
  registerPart,
  registerSession,
  splitTokens,
  turnRunId,
} from "./analytics-core.mjs"

const ROOT = "ses_root"
const CHILD = "ses_child"
const T0 = Date.UTC(2026, 9, 16, 10, 0, 0)
const CONTEXT = { project: "my-app", cwd: "/work/my-app" }

function tokens(input, output, reasoning = 0, read = 0, write = 0) {
  return { input, output, reasoning, cache: { read, write } }
}

function userMessage(tracker, sessionID, id, at) {
  registerMessage(tracker, { id, sessionID, role: "user", time: { created: at } })
}

function assistantMessage(tracker, sessionID, id, parentID, tok, { at = T0, done = true, agent = "build", modelID = "claude-sonnet-4-5" } = {}) {
  registerMessage(tracker, {
    id,
    sessionID,
    role: "assistant",
    parentID,
    agent,
    modelID,
    providerID: "anthropic",
    tokens: tok,
    time: done ? { created: at, completed: at + 1000 } : { created: at },
  })
}

function textPart(tracker, sessionID, messageID, id, text) {
  registerPart(tracker, { id, sessionID, messageID, type: "text", text }, findIntentMarker)
}

function toolPart(tracker, sessionID, messageID, callID, tool, state = {}) {
  registerPart(tracker, { id: `prt_${callID}`, sessionID, messageID, type: "tool", tool, callID, state }, findIntentMarker)
}

test("splitTokens separates input from output and folds reasoning into output", () => {
  assert.deepEqual(splitTokens(tokens(100, 20, 5, 300, 40)), {
    inputTokens: 100,
    outputTokens: 25,
    cacheReadTokens: 300,
    cacheCreationTokens: 40,
  })
  assert.deepEqual(splitTokens(undefined), {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  })
})

test("top-level session bills one turn per user message with input/output split", () => {
  const tracker = createUsageTracker()
  registerSession(tracker, { id: ROOT, title: "Root" })

  userMessage(tracker, ROOT, "msg_u1", T0)
  assistantMessage(tracker, ROOT, "msg_a1", "msg_u1", tokens(100, 10, 5, 1000, 50), { at: T0 + 1000 })
  toolPart(tracker, ROOT, "msg_a1", "call_1", "read")
  toolPart(tracker, ROOT, "msg_a1", "call_1", "read") // repeated update of the same call
  assistantMessage(tracker, ROOT, "msg_a2", "msg_u1", tokens(20, 30, 0, 1100, 0), { at: T0 + 3000, modelID: "claude-haiku-4-5" })

  userMessage(tracker, ROOT, "msg_u2", T0 + 10000)
  assistantMessage(tracker, ROOT, "msg_a3", "msg_u2", tokens(7, 3), { at: T0 + 11000 })
  // Still streaming: not billed yet.
  assistantMessage(tracker, ROOT, "msg_a4", "msg_u2", tokens(999, 999), { at: T0 + 13000, done: false })

  // A user message that never got an answer has nothing to bill.
  userMessage(tracker, ROOT, "msg_u3", T0 + 20000)

  const { sessionId, records } = buildUsageRecords(tracker, ROOT, CONTEXT)
  assert.equal(sessionId, ROOT)
  assert.deepEqual(records, [
    {
      client: "opencode",
      sessionId: ROOT,
      project: "my-app",
      cwd: "/work/my-app",
      gitBranch: null,
      clientVersion: null,
      runId: turnRunId(ROOT, "msg_u1"),
      kind: "turn",
      promptId: "msg_u1",
      parentRunId: null,
      agentName: "main",
      description: null,
      intent: null,
      model: "claude-haiku-4-5",
      models: ["claude-sonnet-4-5", "claude-haiku-4-5"],
      inputTokens: 120,
      cacheReadTokens: 2100,
      cacheCreationTokens: 50,
      outputTokens: 45,
      apiCalls: 2,
      toolCalls: 1,
      startedAt: new Date(T0 + 1000).toISOString(),
      endedAt: new Date(T0 + 4000).toISOString(),
    },
    {
      client: "opencode",
      sessionId: ROOT,
      project: "my-app",
      cwd: "/work/my-app",
      gitBranch: null,
      clientVersion: null,
      runId: turnRunId(ROOT, "msg_u2"),
      kind: "turn",
      promptId: "msg_u2",
      parentRunId: null,
      agentName: "main",
      description: null,
      intent: null,
      model: "claude-sonnet-4-5",
      models: ["claude-sonnet-4-5"],
      inputTokens: 7,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 3,
      apiCalls: 1,
      toolCalls: 0,
      startedAt: new Date(T0 + 11000).toISOString(),
      endedAt: new Date(T0 + 12000).toISOString(),
    },
  ])
})

test("an orchestrator marker tags the turn with its intent; no marker leaves it null", () => {
  const tracker = createUsageTracker()
  registerSession(tracker, { id: ROOT })

  userMessage(tracker, ROOT, "msg_u1", T0)
  assistantMessage(tracker, ROOT, "msg_a1", "msg_u1", tokens(1, 1), { at: T0 + 1000 })
  // Streaming updates of one part: only the final text counts.
  textPart(tracker, ROOT, "msg_a1", "prt_1", "Classifying...\n[ai-toolbox] intent=bug_")
  textPart(tracker, ROOT, "msg_a1", "prt_1", "Classifying...\n[ai-toolbox] intent=bug_fix\nRouting to bug-fix.")

  userMessage(tracker, ROOT, "msg_u2", T0 + 5000)
  assistantMessage(tracker, ROOT, "msg_a2", "msg_u2", tokens(1, 1), { at: T0 + 6000, agent: "refactor-agent" })
  // Prose that mentions the format and an unknown intent do not count; names are never used.
  textPart(tracker, ROOT, "msg_a2", "prt_2", "The marker looks like `[ai-toolbox] intent=refactor` inline.\n[ai-toolbox] intent=made_up")

  const { records } = buildUsageRecords(tracker, ROOT, CONTEXT)
  assert.equal(records.find((r) => r.promptId === "msg_u1").intent, "bug_fix")
  assert.equal(records.find((r) => r.promptId === "msg_u2").intent, null)
})

test("child session is billed as one agent run under the turn that spawned it", () => {
  const tracker = createUsageTracker()
  registerSession(tracker, { id: ROOT })
  userMessage(tracker, ROOT, "msg_u1", T0)
  assistantMessage(tracker, ROOT, "msg_a1", "msg_u1", tokens(10, 10), { at: T0 + 1000 })

  registerSession(tracker, { id: CHILD, parentID: ROOT, title: "Fix login (@implement-task-agent subagent)" })
  userMessage(tracker, CHILD, "msg_c_u1", T0 + 2000)
  assistantMessage(tracker, CHILD, "msg_c_a1", "msg_c_u1", tokens(50, 5, 5, 200, 20), { at: T0 + 2500, agent: "implement-task-agent" })
  registerPart(tracker, { id: "prt_s1", sessionID: CHILD, messageID: "msg_c_a1", type: "step-finish" }, findIntentMarker)
  registerPart(tracker, { id: "prt_s2", sessionID: CHILD, messageID: "msg_c_a1", type: "step-finish" }, findIntentMarker)
  toolPart(tracker, CHILD, "msg_c_a1", "call_e", "edit")
  textPart(tracker, CHILD, "msg_c_a1", "prt_t", "[ai-toolbox] intent=implementation")

  // Parent's task call reports the child session id in its metadata.
  toolPart(tracker, ROOT, "msg_a1", "call_task", "task", { input: { subagent_type: "implement-task-agent" }, metadata: { sessionId: CHILD } })

  const { sessionId, records } = buildUsageRecords(tracker, CHILD, CONTEXT)
  assert.equal(sessionId, ROOT, "child usage is stored under the root session")
  assert.deepEqual(records, [
    {
      client: "opencode",
      sessionId: ROOT,
      project: "my-app",
      cwd: "/work/my-app",
      gitBranch: null,
      clientVersion: null,
      runId: agentRunId(ROOT, CHILD),
      kind: "agent",
      promptId: "msg_u1",
      parentRunId: turnRunId(ROOT, "msg_u1"),
      agentName: "implement-task-agent",
      description: "Fix login (@implement-task-agent subagent)",
      intent: "implementation",
      model: "claude-sonnet-4-5",
      models: ["claude-sonnet-4-5"],
      inputTokens: 50,
      cacheReadTokens: 200,
      cacheCreationTokens: 20,
      outputTokens: 10,
      apiCalls: 2,
      toolCalls: 1,
      startedAt: new Date(T0 + 2500).toISOString(),
      endedAt: new Date(T0 + 3500).toISOString(),
    },
  ])

  // The parent turn keeps its own usage only; the child is not double counted.
  const parent = buildUsageRecords(tracker, ROOT, CONTEXT).records
  assert.equal(parent.length, 1)
  assert.equal(parent[0].inputTokens, 10)
  assert.equal(parent[0].toolCalls, 1)
})

test("child session without task metadata falls back to the parent's active turn; grandchildren chain to the agent run", () => {
  const tracker = createUsageTracker()
  registerSession(tracker, { id: ROOT })
  userMessage(tracker, ROOT, "msg_u1", T0)
  assistantMessage(tracker, ROOT, "msg_a1", "msg_u1", tokens(1, 1), { at: T0 + 1000, done: false })

  registerSession(tracker, { id: CHILD, parentID: ROOT })
  assistantMessage(tracker, CHILD, "msg_c_a1", "msg_c_u1", tokens(2, 2), { at: T0 + 2000, agent: "plan-expert-agent", done: false })
  registerSession(tracker, { id: "ses_grand", parentID: CHILD })
  assistantMessage(tracker, "ses_grand", "msg_g_a1", "msg_g_u1", tokens(3, 3), { at: T0 + 3000, agent: "explore" })

  const child = buildUsageRecords(tracker, CHILD, CONTEXT).records
  assert.equal(child.length, 0, "nothing completed yet in the child")

  const grand = buildUsageRecords(tracker, "ses_grand", CONTEXT)
  assert.equal(grand.sessionId, ROOT)
  assert.equal(grand.records[0].runId, agentRunId(ROOT, "ses_grand"))
  assert.equal(grand.records[0].parentRunId, agentRunId(ROOT, CHILD))
  assert.equal(grand.records[0].agentName, "explore")

  assistantMessage(tracker, CHILD, "msg_c_a1", "msg_c_u1", tokens(2, 2), { at: T0 + 2000, agent: "plan-expert-agent" })
  const [childRecord] = buildUsageRecords(tracker, CHILD, CONTEXT).records
  assert.equal(childRecord.parentRunId, turnRunId(ROOT, "msg_u1"))
})

test("records carry complete totals: rebuilding and re-sending replaces rather than adds", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-opencode-"))
  const dbPath = path.join(dir, "analytics.db")
  const service = createAnalyticsTraceService({ dbPath })
  const tracker = createUsageTracker()

  try {
    registerSession(tracker, { id: ROOT })
    userMessage(tracker, ROOT, "msg_u1", T0)
    assistantMessage(tracker, ROOT, "msg_a1", "msg_u1", tokens(100, 10), { at: T0 + 1000 })
    textPart(tracker, ROOT, "msg_a1", "prt_1", "[ai-toolbox] intent=refactor")

    registerSession(tracker, { id: CHILD, parentID: ROOT })
    toolPart(tracker, ROOT, "msg_a1", "call_task", "task", { metadata: { sessionId: CHILD } })
    assistantMessage(tracker, CHILD, "msg_c_a1", "msg_c_u1", tokens(40, 4), { at: T0 + 2000, agent: "general" })

    // Child idles first, then the root, then the root again (a second idle of the same turn).
    const child = buildUsageRecords(tracker, CHILD, CONTEXT)
    assert.deepEqual(service.recordUsage(child.sessionId, child.records), { ok: true, stored: 1 })
    const first = buildUsageRecords(tracker, ROOT, CONTEXT)
    assert.deepEqual(service.recordUsage(first.sessionId, first.records), { ok: true, stored: 1 })

    // The same message gets a final token update, plus a second completed message in the turn.
    assistantMessage(tracker, ROOT, "msg_a1", "msg_u1", tokens(120, 12), { at: T0 + 1000 })
    assistantMessage(tracker, ROOT, "msg_a2", "msg_u1", tokens(5, 5), { at: T0 + 5000 })
    const second = buildUsageRecords(tracker, ROOT, CONTEXT)
    assert.equal(service.recordUsage(second.sessionId, second.records).ok, true)
    assert.equal(service.recordUsage(second.sessionId, second.records).ok, true)

    const sqlite = createDatabaseConnection(dbPath)
    try {
      const rows = selectTokenUsage(sqlite, { sessionId: ROOT })
      assert.equal(rows.length, 2)
      const turn = rows.find((row) => row.kind === "turn")
      const agent = rows.find((row) => row.kind === "agent")
      assert.equal(turn.client, "opencode")
      assert.equal(turn.input_tokens, 125)
      assert.equal(turn.output_tokens, 17)
      assert.equal(turn.api_calls, 2)
      assert.equal(turn.intent, "refactor")
      assert.equal(agent.input_tokens, 40)
      assert.equal(agent.output_tokens, 4)
      assert.equal(agent.parent_run_id, turnRunId(ROOT, "msg_u1"))
      assert.equal(agent.intent, "refactor", "agent inherits the turn's intent on reconciliation")
    } finally {
      sqlite.close()
    }
  } finally {
    service.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
