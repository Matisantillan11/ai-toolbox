import fs from "node:fs";
import path from "node:path";
import { parseAgentTranscript, parseSessionTranscript } from "./transcript.js";

/**
 * Builds token usage records for a whole Claude Code session from disk.
 *
 * Layout Claude Code writes:
 *   <project-dir>/<session-id>.jsonl                          main session
 *   <project-dir>/<session-id>/subagents/agent-<id>.jsonl     one per sub-agent
 *   <project-dir>/<session-id>/subagents/agent-<id>.meta.json its agentType and description
 *
 * Everything is re-read on every collection and every record carries complete
 * totals, so running this twice, late, or concurrently gives the same rows.
 */

/**
 * Run id of a main-session turn.
 *
 * @param {string} sessionId Session id.
 * @param {string} promptId Turn prompt id.
 * @returns {string} Run id.
 */
export function turnRunId(sessionId, promptId) {
  return `${sessionId}:turn:${promptId}`;
}

/**
 * Run id of a sub-agent run.
 *
 * @param {string} sessionId Session id.
 * @param {string} agentId Sub-agent id.
 * @returns {string} Run id.
 */
export function agentRunId(sessionId, agentId) {
  return `${sessionId}:agent:${agentId}`;
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function usageFields(usage) {
  return {
    model: usage.model,
    models: usage.models,
    inputTokens: usage.inputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheCreationTokens: usage.cacheCreationTokens,
    outputTokens: usage.outputTokens,
    apiCalls: usage.apiCalls,
    toolCalls: usage.toolCalls,
    startedAt: usage.startedAt,
    endedAt: usage.endedAt,
    intent: usage.intent,
  };
}

/**
 * Collects every turn and sub-agent run of a session.
 *
 * @param {{transcriptPath: string, cwd?: string, sessionId?: string}} input Hook context.
 * @returns {{sessionId: string, records: Array<import("../analytics/db.js").TokenUsageRecord>}} Records to store.
 */
export function collectSession({ transcriptPath, cwd, sessionId: hintedSessionId }) {
  const session = parseSessionTranscript(readText(transcriptPath));
  // The file is named after the session it belongs to; that also locates its sub-agents.
  const sessionId = hintedSessionId ?? path.basename(transcriptPath, ".jsonl");
  const fallbackCwd = cwd ?? null;
  const records = [];
  const turnsByPrompt = new Map();

  for (const turn of session.turns) {
    // A turn that never reached the model (interrupted before the first response) has nothing to bill.
    if (turn.apiCalls === 0) {
      continue;
    }
    const turnCwd = turn.cwd ?? fallbackCwd;
    const turnSessionId = turn.sessionId ?? sessionId;
    turnsByPrompt.set(turn.promptId, { ...turn, sessionId: turnSessionId });
    records.push({
      runId: turnRunId(turnSessionId, turn.promptId),
      kind: "turn",
      sessionId: turnSessionId,
      promptId: turn.promptId,
      project: turnCwd ? path.basename(turnCwd) : "unknown",
      cwd: turnCwd,
      gitBranch: turn.gitBranch,
      agentName: "main",
      clientVersion: turn.clientVersion,
      ...usageFields(turn),
    });
  }

  const agentsDir = path.join(path.dirname(transcriptPath), sessionId, "subagents");
  let agentFiles = [];
  try {
    agentFiles = fs.readdirSync(agentsDir).filter((name) => /^agent-.+\.jsonl$/.test(name));
  } catch {
    // No sub-agents ran in this session.
  }

  for (const name of agentFiles) {
    const file = path.join(agentsDir, name);
    const agent = parseAgentTranscript(readText(file));
    if (agent.apiCalls === 0) {
      continue;
    }

    const agentId = agent.agentId ?? name.replace(/^agent-/, "").replace(/\.jsonl$/, "");
    const meta = readJson(file.replace(/\.jsonl$/, ".meta.json")) ?? {};
    const parent = agent.promptId ? turnsByPrompt.get(agent.promptId) : undefined;
    const agentCwd = parent?.cwd ?? fallbackCwd;

    records.push({
      runId: agentRunId(sessionId, agentId),
      kind: "agent",
      sessionId,
      promptId: agent.promptId,
      parentRunId: agent.promptId ? turnRunId(parent?.sessionId ?? sessionId, agent.promptId) : null,
      project: agentCwd ? path.basename(agentCwd) : "unknown",
      cwd: agentCwd,
      gitBranch: parent?.gitBranch ?? null,
      agentName: typeof meta.agentType === "string" ? meta.agentType : "unknown",
      description: typeof meta.description === "string" ? meta.description : null,
      clientVersion: parent?.clientVersion ?? null,
      ...usageFields(agent),
    });
  }

  return { sessionId, records };
}
