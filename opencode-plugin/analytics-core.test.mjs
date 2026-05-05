import assert from "node:assert/strict"
import test from "node:test"

import {
  buildExecutionRecords,
  createSessionState,
  getTokensSpent,
  registerAssistantMessage,
  registerSkillCall,
} from "./analytics-core.mjs"

test("getTokensSpent prefers total and falls back to summed parts", () => {
  assert.equal(getTokensSpent({ total: 42, input: 10, output: 10, reasoning: 10, cache: { read: 1, write: 1 } }), 42)
  assert.equal(getTokensSpent({ input: 10, output: 8, reasoning: 4, cache: { read: 2, write: 1 } }), 25)
  assert.equal(getTokensSpent(undefined), 0)
})

test("buildExecutionRecords aggregates agent and skill calls with token attribution", () => {
  const state = createSessionState("parent-session")

  registerSkillCall(state, {
    type: "tool",
    tool: "skill",
    callID: "call-1",
    messageID: "msg-1",
    state: { input: { name: "code-review" } },
  })
  registerSkillCall(state, {
    type: "tool",
    tool: "skill",
    callID: "call-2",
    messageID: "msg-1",
    state: { input: { name: "create-pr" } },
  })
  registerAssistantMessage(state, {
    id: "msg-1",
    role: "assistant",
    agent: "implement-task-agent",
    time: { completed: Date.now() },
    tokens: { total: 30, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  })

  registerAssistantMessage(state, {
    id: "msg-2",
    role: "assistant",
    agent: "orchestrator-agent",
    time: { completed: Date.now() },
    tokens: { total: 12, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  })

  const records = buildExecutionRecords("session-1", state)

  assert.deepEqual(records, [
    {
      runId: "session-1:agent:orchestrator-agent:implement-task-agent",
      trace: "agent:implement-task-agent",
      callerAgent: "orchestrator-agent",
      invokedName: "implement-task-agent",
      invocationType: "agent",
      actionClassification: "feature",
      callCount: 1,
      tokensSpent: 30,
    },
    {
      runId: "session-1:agent:orchestrator-agent:orchestrator-agent",
      trace: "agent:orchestrator-agent",
      callerAgent: "orchestrator-agent",
      invokedName: "orchestrator-agent",
      invocationType: "agent",
      actionClassification: "research",
      callCount: 1,
      tokensSpent: 12,
    },
    {
      runId: "session-1:skill:implement-task-agent:code-review",
      trace: "skill:code-review",
      callerAgent: "implement-task-agent",
      invokedName: "code-review",
      invocationType: "skill",
      actionClassification: "qa",
      callCount: 1,
      tokensSpent: 15,
    },
    {
      runId: "session-1:skill:implement-task-agent:create-pr",
      trace: "skill:create-pr",
      callerAgent: "implement-task-agent",
      invokedName: "create-pr",
      invocationType: "skill",
      actionClassification: "feature",
      callCount: 1,
      tokensSpent: 15,
    },
  ])
})
