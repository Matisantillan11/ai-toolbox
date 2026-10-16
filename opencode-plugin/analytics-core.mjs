/**
 * Pure aggregation of OpenCode events into token usage records
 * (see `TokenUsageRecord` in analytics-tool/src/analytics/db.js).
 *
 * Mapping, kept in parity with the Claude Code collector:
 *   - A top-level session (no parentID) is billed per user turn:
 *     `<session>:turn:<userMessageID>`, kind "turn", agentName "main".
 *     An assistant message names the user message it answers in `parentID`,
 *     so every completed assistant message lands in exactly one turn.
 *   - A child session (parentID set, spawned by the task tool) is billed as
 *     one sub-agent run: `<rootSession>:agent:<childSessionID>`, kind "agent",
 *     parentRunId = the run of the parent turn (or parent agent) that spawned it.
 *
 * Every record carries complete totals for its run, so re-sending replaces
 * (upsert semantics) and building twice gives the same rows.
 *
 * `findIntentMarker` is injected rather than imported: this file is copied into
 * the OpenCode plugins directory on install, where the analytics-tool path is
 * only known to the plugin entry (through its repo-root placeholder).
 */

export const CLIENT = "opencode"
export const MAIN_AGENT = "main"

/**
 * Run id of a top-level turn.
 *
 * @param {string} sessionID Root session id.
 * @param {string} turnID User message id the turn answers.
 * @returns {string} Run id.
 */
export function turnRunId(sessionID, turnID) {
  return `${sessionID}:turn:${turnID}`
}

/**
 * Run id of a sub-agent (child session) run.
 *
 * @param {string} rootSessionID Root session id.
 * @param {string} childSessionID Child session id.
 * @returns {string} Run id.
 */
export function agentRunId(rootSessionID, childSessionID) {
  return `${rootSessionID}:agent:${childSessionID}`
}

function num(value) {
  return Number.isFinite(value) ? value : 0
}

function toIso(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null
}

/**
 * Splits OpenCode message tokens into the input / output / cache buckets.
 *
 * @param {{input?: number, output?: number, reasoning?: number, cache?: {read?: number, write?: number}} | undefined} tokens OpenCode `message.tokens`.
 * @returns {{inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheCreationTokens: number}} Split usage.
 */
export function splitTokens(tokens) {
  return {
    inputTokens: num(tokens?.input),
    outputTokens: num(tokens?.output) + num(tokens?.reasoning),
    cacheReadTokens: num(tokens?.cache?.read),
    cacheCreationTokens: num(tokens?.cache?.write),
  }
}

/**
 * @returns {{sessions: Map<string, object>, messages: Map<string, object>, spawnedBy: Map<string, string>}} Empty tracker.
 */
export function createUsageTracker() {
  return {
    sessions: new Map(),
    messages: new Map(),
    // child session id -> message id of the task tool call that spawned it
    spawnedBy: new Map(),
  }
}

function ensureSession(tracker, sessionID) {
  let session = tracker.sessions.get(sessionID)
  if (!session) {
    session = {
      id: sessionID,
      parentID: null,
      title: null,
      // Turn (or run) of the parent session that was active when this child appeared.
      spawnTurnID: null,
      // Latest turn seen in this session, used to place children it spawns.
      currentTurnID: null,
      messageIDs: new Set(),
    }
    tracker.sessions.set(sessionID, session)
  }
  return session
}

function ensureMessage(tracker, messageID, sessionID) {
  let message = tracker.messages.get(messageID)
  if (!message) {
    message = {
      id: messageID,
      sessionID: sessionID ?? null,
      role: null,
      turnID: null,
      agent: null,
      model: null,
      tokens: null,
      createdAt: null,
      completedAt: null,
      completed: false,
      steps: 0,
      stepIDs: new Set(),
      toolCallIDs: new Set(),
      // part id -> intent marker found in that part (last write wins per part)
      partIntents: new Map(),
    }
    tracker.messages.set(messageID, message)
  }
  if (sessionID && !message.sessionID) {
    message.sessionID = sessionID
  }
  if (message.sessionID) {
    ensureSession(tracker, message.sessionID).messageIDs.add(messageID)
  }
  return message
}

/**
 * Records a session's identity and parent link (`session.created` / `session.updated`).
 *
 * @param {object} tracker Usage tracker.
 * @param {{id: string, parentID?: string, title?: string}} info OpenCode session info.
 */
export function registerSession(tracker, info) {
  if (!info?.id) {
    return
  }
  const session = ensureSession(tracker, info.id)
  if (typeof info.title === "string" && info.title) {
    session.title = info.title
  }
  if (info.parentID && !session.parentID) {
    session.parentID = info.parentID
    // Fallback placement: the turn the parent was in when this child appeared.
    session.spawnTurnID ??= tracker.sessions.get(info.parentID)?.currentTurnID ?? null
  }
}

/**
 * Records a message (`message.updated`). Only completed assistant messages are billed;
 * tokens are replaced on every update, never added.
 *
 * @param {object} tracker Usage tracker.
 * @param {object} info OpenCode message info.
 */
export function registerMessage(tracker, info) {
  if (!info?.id) {
    return
  }
  const message = ensureMessage(tracker, info.id, info.sessionID)
  message.role = info.role ?? message.role

  if (info.role !== "assistant") {
    return
  }

  // parentID on an assistant message is the user message it answers.
  message.turnID = info.parentID ?? message.turnID ?? info.id
  message.agent = info.agent ?? info.mode ?? message.agent
  message.model = info.modelID ?? message.model
  message.tokens = info.tokens ?? message.tokens
  message.createdAt = num(info.time?.created) || message.createdAt
  message.completedAt = num(info.time?.completed) || message.completedAt
  message.completed = Boolean(info.time?.completed)

  if (message.sessionID) {
    ensureSession(tracker, message.sessionID).currentTurnID = message.turnID
  }
}

function partText(part) {
  if ((part.type === "text" || part.type === "reasoning") && typeof part.text === "string") {
    return part.text
  }
  if (part.type === "tool") {
    const values = []
    for (const value of Object.values(part.state?.input ?? {})) {
      if (typeof value === "string") {
        values.push(value)
      }
    }
    if (typeof part.state?.output === "string") {
      values.push(part.state.output)
    }
    return values.join("\n")
  }
  return ""
}

/**
 * Records a message part (`message.part.updated`): tool calls, steps, intent markers,
 * and which task call spawned which child session.
 *
 * @param {object} tracker Usage tracker.
 * @param {object} part OpenCode part.
 * @param {(text: string) => string | null} findIntentMarker Marker finder from analytics-tool intents.js.
 */
export function registerPart(tracker, part, findIntentMarker) {
  if (!part?.messageID) {
    return
  }
  const message = ensureMessage(tracker, part.messageID, part.sessionID)

  if (part.type === "tool" && part.callID) {
    message.toolCallIDs.add(part.callID)
    const childSessionID = part.state?.metadata?.sessionId ?? part.state?.metadata?.sessionID
    if (part.tool === "task" && typeof childSessionID === "string") {
      tracker.spawnedBy.set(childSessionID, part.messageID)
    }
  }

  if (part.type === "step-finish" && part.id) {
    message.stepIDs.add(part.id)
    message.steps = message.stepIDs.size
  }

  const key = part.id ?? part.callID ?? `${part.type}:${message.partIntents.size}`
  const intent = findIntentMarker(partText(part))
  if (intent) {
    message.partIntents.set(key, intent)
  } else {
    message.partIntents.delete(key)
  }
}

/**
 * Forgets a deleted session and its messages (`session.deleted`).
 *
 * @param {object} tracker Usage tracker.
 * @param {string} sessionID Deleted session id.
 */
export function forgetSession(tracker, sessionID) {
  const session = tracker.sessions.get(sessionID)
  if (!session) {
    return
  }
  for (const messageID of session.messageIDs) {
    tracker.messages.delete(messageID)
  }
  tracker.sessions.delete(sessionID)
  tracker.spawnedBy.delete(sessionID)
}

function rootOf(tracker, sessionID) {
  let current = sessionID
  const seen = new Set()
  while (true) {
    const parentID = tracker.sessions.get(current)?.parentID
    if (!parentID || seen.has(parentID)) {
      return current
    }
    seen.add(current)
    current = parentID
  }
}

function sortedMessages(tracker, session) {
  return [...session.messageIDs]
    .map((id) => tracker.messages.get(id))
    .filter(Boolean)
    .sort((a, b) => num(a.createdAt) - num(b.createdAt))
}

function createBucket() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    apiCalls: 0,
    toolCalls: 0,
    startedAt: null,
    endedAt: null,
    intent: null,
    agent: null,
    outputByModel: new Map(),
  }
}

function addMessage(bucket, message) {
  const lastIntent = [...message.partIntents.values()].at(-1)
  if (lastIntent) {
    bucket.intent = lastIntent
  }

  if (message.role !== "assistant" || !message.completed) {
    return
  }

  const split = splitTokens(message.tokens)
  bucket.inputTokens += split.inputTokens
  bucket.outputTokens += split.outputTokens
  bucket.cacheReadTokens += split.cacheReadTokens
  bucket.cacheCreationTokens += split.cacheCreationTokens
  bucket.apiCalls += Math.max(1, message.steps)
  bucket.toolCalls += message.toolCallIDs.size
  bucket.agent ??= message.agent

  if (message.model) {
    bucket.outputByModel.set(
      message.model,
      (bucket.outputByModel.get(message.model) ?? 0) + split.outputTokens + 1,
    )
  }

  const started = toIso(message.createdAt)
  const ended = toIso(message.completedAt ?? message.createdAt)
  if (started && (!bucket.startedAt || started < bucket.startedAt)) {
    bucket.startedAt = started
  }
  if (ended && (!bucket.endedAt || ended > bucket.endedAt)) {
    bucket.endedAt = ended
  }
}

function usageFields(bucket) {
  const models = [...bucket.outputByModel.keys()]
  const model = [...bucket.outputByModel.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return {
    intent: bucket.intent,
    model,
    models,
    inputTokens: bucket.inputTokens,
    cacheReadTokens: bucket.cacheReadTokens,
    cacheCreationTokens: bucket.cacheCreationTokens,
    outputTokens: bucket.outputTokens,
    apiCalls: bucket.apiCalls,
    toolCalls: bucket.toolCalls,
    startedAt: bucket.startedAt,
    endedAt: bucket.endedAt,
  }
}

/**
 * Run id of whatever owns a session's turn: a turn of the root session, or the
 * agent run of a child session (which is billed as a single run).
 */
function runIdForSessionTurn(tracker, sessionID, turnID) {
  const rootID = rootOf(tracker, sessionID)
  if (sessionID === rootID) {
    return turnID ? turnRunId(rootID, turnID) : null
  }
  return agentRunId(rootID, sessionID)
}

function parentRunIdOf(tracker, session) {
  const spawnMessage = tracker.messages.get(tracker.spawnedBy.get(session.id))
  if (spawnMessage?.turnID && spawnMessage.sessionID === session.parentID) {
    return runIdForSessionTurn(tracker, session.parentID, spawnMessage.turnID)
  }
  return runIdForSessionTurn(tracker, session.parentID, session.spawnTurnID)
}

/**
 * Builds complete usage records for one OpenCode session.
 *
 * A top-level session yields one "turn" record per user turn that reached the
 * model; a child session yields a single "agent" record. Records use the root
 * session id as `sessionId` so intents reconcile across turns and sub-agents.
 *
 * @param {object} tracker Usage tracker.
 * @param {string} sessionID Session that went idle.
 * @param {{project: string, cwd?: string | null}} context Project context.
 * @returns {{sessionId: string, records: Array<object>}} Root session id and records.
 */
export function buildUsageRecords(tracker, sessionID, { project, cwd = null }) {
  const session = tracker.sessions.get(sessionID)
  const rootID = rootOf(tracker, sessionID)
  if (!session) {
    return { sessionId: rootID, records: [] }
  }

  const messages = sortedMessages(tracker, session)
  const base = { client: CLIENT, sessionId: rootID, project, cwd, gitBranch: null, clientVersion: null }

  if (!session.parentID) {
    const turns = new Map()
    for (const message of messages) {
      // User messages carry no turnID; their own id is the turn they open.
      const turnID = message.role === "assistant" ? message.turnID : message.id
      if (!turnID) {
        continue
      }
      if (!turns.has(turnID)) {
        turns.set(turnID, createBucket())
      }
      addMessage(turns.get(turnID), message)
    }

    const records = []
    for (const [turnID, bucket] of turns) {
      // A turn that never reached the model has nothing to bill.
      if (bucket.apiCalls === 0) {
        continue
      }
      records.push({
        ...base,
        runId: turnRunId(rootID, turnID),
        kind: "turn",
        promptId: turnID,
        parentRunId: null,
        agentName: MAIN_AGENT,
        description: null,
        ...usageFields(bucket),
      })
    }
    return { sessionId: rootID, records }
  }

  const bucket = createBucket()
  for (const message of messages) {
    addMessage(bucket, message)
  }
  if (bucket.apiCalls === 0) {
    return { sessionId: rootID, records: [] }
  }

  const parentRunId = parentRunIdOf(tracker, session)
  const spawnMessage = tracker.messages.get(tracker.spawnedBy.get(session.id))
  return {
    sessionId: rootID,
    records: [
      {
        ...base,
        runId: agentRunId(rootID, session.id),
        kind: "agent",
        promptId: spawnMessage?.turnID ?? session.spawnTurnID ?? null,
        parentRunId,
        agentName: bucket.agent ?? "unknown",
        description: session.title,
        ...usageFields(bucket),
      },
    ],
  }
}
