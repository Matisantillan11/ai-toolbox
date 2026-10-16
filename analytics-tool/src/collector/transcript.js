import { findIntentMarker } from "../analytics/intents.js";

/**
 * Pure parsing of Claude Code JSONL transcripts into token usage.
 *
 * Two facts about the transcript shape drive everything here:
 *
 * 1. One API response is written as several `assistant` lines — one per
 *    content block (thinking, text, each tool_use) — and every one of those
 *    lines repeats the same `message.id` and the same `usage` block. Summing
 *    lines counts the same response two or three times, so usage is keyed by
 *    `message.id` and each response is counted once.
 * 2. Every `user` record (the prompt and every tool_result) carries the
 *    `promptId` of the turn it belongs to; `assistant` records do not. A
 *    response therefore belongs to the turn of the last user record before it.
 */

/**
 * @typedef {object} Usage
 * @property {number} inputTokens Uncached input tokens.
 * @property {number} cacheReadTokens Input tokens served from the prompt cache.
 * @property {number} cacheCreationTokens Input tokens written to the prompt cache.
 * @property {number} outputTokens Generated tokens, thinking included.
 * @property {number} apiCalls Distinct API responses.
 * @property {number} toolCalls tool_use blocks the model emitted.
 * @property {string | null} model Model that generated the most output.
 * @property {string[]} models Every model seen.
 */

/**
 * @typedef {Usage & {promptId: string, sessionId: string | null, startedAt: string | null, endedAt: string | null, intent: string | null, cwd: string | null, gitBranch: string | null, clientVersion: string | null}} TurnUsage
 */

/**
 * @typedef {Usage & {promptId: string | null, startedAt: string | null, endedAt: string | null, intent: string | null}} AgentUsage
 */

const SYNTHETIC_MODEL = "<synthetic>";

function num(value) {
  return Number.isFinite(value) ? value : 0;
}

function parseLines(text) {
  const records = [];
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      records.push(JSON.parse(line));
    } catch {
      // A partially flushed last line; the next collection picks it up.
    }
  }
  return records;
}

/**
 * Collects every piece of text in a record that may carry an intent marker:
 * assistant text, tool_use inputs (Agent prompts, Workflow args), tool_result
 * output (a sub-agent's final answer), and plain user content (a sub-agent's prompt).
 */
function textOf(record) {
  const content = record.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  const parts = [];
  for (const block of content) {
    if (!block) {
      continue;
    }
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    } else if (block.type === "tool_use" && block.input) {
      for (const value of Object.values(block.input)) {
        if (typeof value === "string") {
          parts.push(value);
        }
      }
    } else if (block.type === "tool_result") {
      if (typeof block.content === "string") {
        parts.push(block.content);
      } else if (Array.isArray(block.content)) {
        for (const inner of block.content) {
          if (inner?.type === "text" && typeof inner.text === "string") {
            parts.push(inner.text);
          }
        }
      }
    }
  }
  return parts.join("\n");
}

function createBucket() {
  return {
    responses: new Map(),
    toolCalls: 0,
    startedAt: null,
    endedAt: null,
    intent: null,
  };
}

function touch(bucket, record) {
  const at = record.timestamp;
  if (typeof at !== "string") {
    return;
  }
  if (!bucket.startedAt || at < bucket.startedAt) {
    bucket.startedAt = at;
  }
  if (!bucket.endedAt || at > bucket.endedAt) {
    bucket.endedAt = at;
  }
}

function addRecord(bucket, record) {
  touch(bucket, record);

  const intent = findIntentMarker(textOf(record));
  if (intent) {
    bucket.intent = intent;
  }

  if (record.type !== "assistant") {
    return;
  }

  const message = record.message || {};
  if (Array.isArray(message.content)) {
    bucket.toolCalls += message.content.filter((block) => block?.type === "tool_use").length;
  }

  if (!message.usage || message.model === SYNTHETIC_MODEL) {
    return;
  }

  // Later lines of the same response repeat the usage; the last one wins.
  const key = message.id || record.requestId || record.uuid;
  bucket.responses.set(key, { model: message.model || null, usage: message.usage });
}

function summarize(bucket) {
  const totals = {
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    outputTokens: 0,
    apiCalls: bucket.responses.size,
    toolCalls: bucket.toolCalls,
    model: null,
    models: [],
  };
  const outputByModel = new Map();

  for (const { model, usage } of bucket.responses.values()) {
    totals.inputTokens += num(usage.input_tokens);
    totals.cacheReadTokens += num(usage.cache_read_input_tokens);
    totals.cacheCreationTokens += num(usage.cache_creation_input_tokens);
    totals.outputTokens += num(usage.output_tokens);
    if (model) {
      outputByModel.set(model, (outputByModel.get(model) ?? 0) + num(usage.output_tokens) + 1);
    }
  }

  totals.models = [...outputByModel.keys()];
  totals.model = [...outputByModel.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return totals;
}

/**
 * Splits a session transcript into turns and bills each one.
 *
 * Sub-agent (sidechain) records are skipped: each sub-agent is billed from its
 * own transcript, so counting them here would double them.
 *
 * @param {string} text Raw JSONL contents of the session transcript.
 * @returns {{sessionId: string | null, turns: TurnUsage[]}} Turns in transcript order; `sessionId` is the first one seen.
 */
export function parseSessionTranscript(text) {
  const turns = new Map();
  let sessionId = null;
  let current = null;

  for (const record of parseLines(text)) {
    if (record.isSidechain) {
      continue;
    }
    if (record.type !== "user" && record.type !== "assistant") {
      continue;
    }

    sessionId ??= record.sessionId ?? record.session_id ?? null;

    if (record.type === "user" && typeof record.promptId === "string") {
      if (!turns.has(record.promptId)) {
        turns.set(record.promptId, {
          ...createBucket(),
          // Per turn, not per file: a resumed session can start with records
          // copied from the session it resumed, and those belong to that one.
          sessionId: record.sessionId ?? record.session_id ?? null,
          cwd: record.cwd ?? null,
          gitBranch: record.gitBranch ?? null,
          clientVersion: null,
        });
      }
      current = record.promptId;
    }

    // Anything before the first prompt (resumed-session preamble) has no turn.
    if (!current) {
      continue;
    }

    const turn = turns.get(current);
    addRecord(turn, record);
    if (record.version) {
      turn.clientVersion = record.version;
    }
  }

  return {
    sessionId,
    turns: [...turns.entries()].map(([promptId, bucket]) => ({
      promptId,
      sessionId: bucket.sessionId,
      startedAt: bucket.startedAt,
      endedAt: bucket.endedAt,
      intent: bucket.intent,
      cwd: bucket.cwd,
      gitBranch: bucket.gitBranch,
      clientVersion: bucket.clientVersion,
      ...summarize(bucket),
    })),
  };
}

/**
 * Bills a whole sub-agent transcript as one run.
 *
 * @param {string} text Raw JSONL contents of `subagents/agent-<id>.jsonl`.
 * @returns {AgentUsage & {agentId: string | null, sessionId: string | null}} Agent run usage.
 */
export function parseAgentTranscript(text) {
  const bucket = createBucket();
  let agentId = null;
  let sessionId = null;
  let promptId = null;

  for (const record of parseLines(text)) {
    if (record.type !== "user" && record.type !== "assistant") {
      continue;
    }
    agentId ??= record.agentId ?? null;
    sessionId ??= record.sessionId ?? null;
    promptId ??= typeof record.promptId === "string" ? record.promptId : null;
    addRecord(bucket, record);
  }

  return {
    agentId,
    sessionId,
    promptId,
    startedAt: bucket.startedAt,
    endedAt: bucket.endedAt,
    intent: bucket.intent,
    ...summarize(bucket),
  };
}
