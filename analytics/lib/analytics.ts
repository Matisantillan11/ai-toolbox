import { desc } from "drizzle-orm"

import { db, dbPath, sqlite } from "@/db/client"
import {
  intents,
  sessionTokenUsage,
  tokenUsage,
  UNTAGGED_INTENT,
  type Intent,
  type SessionTokenUsage,
  type UsageKind,
} from "@/db/schema"

export type UsageRun = {
  id: number
  runId: string
  kind: UsageKind
  client: string
  sessionId: string
  parentRunId: string | null
  project: string
  gitBranch: string | null
  agentName: string
  description: string | null
  intent: Intent | null
  model: string | null
  models: string[]
  inputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalInputTokens: number
  outputTokens: number
  apiCalls: number
  toolCalls: number
  startedAt: string | null
  endedAt: string | null
}

export type SessionUsage = SessionTokenUsage & {
  /** Unique per view row: the view groups by session, client and project. */
  key: string
  intentList: Intent[]
  hasUntaggedRuns: boolean
  runs: UsageRun[]
}

export type AnalyticsSummary = {
  totalInputTokens: number
  inputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  outputTokens: number
  sessions: number
  turns: number
  agentRuns: number
}

export type AnalyticsFilters = {
  projects: string[]
  agentNames: string[]
  intents: string[]
  clients: string[]
}

export type AnalyticsDashboardData = {
  dbPath: string
  sessions: SessionUsage[]
  summary: AnalyticsSummary
  filters: AnalyticsFilters
}

const intentList = intents.map((intent) => `'${intent}'`).join(", ")

let initialized = false

/**
 * Creates the usage table and view when the collector hook has not run yet.
 * The DDL is kept identical to analytics-tool/src/analytics/db.js.
 */
function ensureAnalyticsSchema() {
  if (initialized) {
    return
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      client TEXT NOT NULL DEFAULT 'claude-code',
      session_id TEXT NOT NULL,
      prompt_id TEXT,
      parent_run_id TEXT,
      project TEXT NOT NULL,
      cwd TEXT,
      git_branch TEXT,
      agent_name TEXT NOT NULL,
      description TEXT,
      intent TEXT,
      model TEXT,
      models TEXT NOT NULL DEFAULT '[]',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      api_calls INTEGER NOT NULL DEFAULT 0,
      tool_calls INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      ended_at TEXT,
      client_version TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (kind IN ('turn', 'agent')),
      CHECK (intent IS NULL OR intent IN (${intentList})),
      CHECK (input_tokens >= 0 AND cache_read_tokens >= 0 AND cache_creation_tokens >= 0 AND output_tokens >= 0)
    );
  `)

  sqlite.exec(`
    CREATE VIEW IF NOT EXISTS session_token_usage AS
    SELECT
      session_id,
      client,
      project,
      MIN(started_at) AS started_at,
      MAX(ended_at) AS ended_at,
      SUM(CASE WHEN kind = 'turn' THEN 1 ELSE 0 END) AS turns,
      SUM(CASE WHEN kind = 'agent' THEN 1 ELSE 0 END) AS agent_runs,
      SUM(input_tokens) AS input_tokens,
      SUM(cache_read_tokens) AS cache_read_tokens,
      SUM(cache_creation_tokens) AS cache_creation_tokens,
      SUM(input_tokens + cache_read_tokens + cache_creation_tokens) AS total_input_tokens,
      SUM(output_tokens) AS output_tokens,
      GROUP_CONCAT(DISTINCT intent) AS intents
    FROM token_usage
    GROUP BY session_id, client, project;
  `)

  sqlite.exec("CREATE INDEX IF NOT EXISTS token_usage_session_idx ON token_usage(session_id);")
  sqlite.exec("CREATE INDEX IF NOT EXISTS token_usage_project_idx ON token_usage(project);")
  sqlite.exec("CREATE INDEX IF NOT EXISTS token_usage_intent_idx ON token_usage(intent);")
  sqlite.exec("CREATE INDEX IF NOT EXISTS token_usage_parent_idx ON token_usage(parent_run_id);")

  initialized = true
}

function sessionKey(row: { sessionId: string; client: string; project: string }) {
  return `${row.client}:${row.sessionId}:${row.project}`
}

function parseModels(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []
  } catch {
    return []
  }
}

function isIntent(value: string): value is Intent {
  return (intents as readonly string[]).includes(value)
}

function getUsageRuns(): UsageRun[] {
  return db
    .select()
    .from(tokenUsage)
    .orderBy(tokenUsage.startedAt, tokenUsage.id)
    .all()
    .map((row) => ({
      id: row.id,
      runId: row.runId,
      kind: row.kind,
      client: row.client,
      sessionId: row.sessionId,
      parentRunId: row.parentRunId,
      project: row.project,
      gitBranch: row.gitBranch,
      agentName: row.agentName,
      description: row.description,
      intent: row.intent,
      model: row.model,
      models: parseModels(row.models),
      inputTokens: row.inputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      totalInputTokens: row.inputTokens + row.cacheReadTokens + row.cacheCreationTokens,
      outputTokens: row.outputTokens,
      apiCalls: row.apiCalls,
      toolCalls: row.toolCalls,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
    }))
}

/** Orders a session's runs as each turn followed by the sub-agents it spawned. */
function orderRuns(runs: UsageRun[]): UsageRun[] {
  const turnIds = new Set(runs.filter((run) => run.kind === "turn").map((run) => run.runId))
  const childrenByParent = new Map<string, UsageRun[]>()
  const ordered: UsageRun[] = []

  for (const run of runs) {
    if (run.kind === "agent" && run.parentRunId && turnIds.has(run.parentRunId)) {
      const children = childrenByParent.get(run.parentRunId) ?? []
      children.push(run)
      childrenByParent.set(run.parentRunId, children)
    }
  }

  for (const run of runs) {
    if (run.kind === "turn") {
      ordered.push(run, ...(childrenByParent.get(run.runId) ?? []))
    }
  }

  // Sub-agents whose turn was not collected (yet) go last.
  for (const run of runs) {
    if (run.kind === "agent" && !(run.parentRunId && turnIds.has(run.parentRunId))) {
      ordered.push(run)
    }
  }

  return ordered
}

function getSessions(): SessionUsage[] {
  const runsBySession = new Map<string, UsageRun[]>()

  for (const run of getUsageRuns()) {
    const key = sessionKey(run)
    const runs = runsBySession.get(key) ?? []
    runs.push(run)
    runsBySession.set(key, runs)
  }

  return db
    .select()
    .from(sessionTokenUsage)
    .orderBy(desc(sessionTokenUsage.startedAt))
    .all()
    .map((session) => {
      const key = sessionKey(session)
      const runs = orderRuns(runsBySession.get(key) ?? [])

      return {
        ...session,
        key,
        intentList: (session.intents?.split(",") ?? []).filter(isIntent),
        hasUntaggedRuns: runs.some((run) => run.intent === null),
        runs,
      }
    })
}

function buildSummary(sessions: SessionUsage[]): AnalyticsSummary {
  return sessions.reduce<AnalyticsSummary>(
    (summary, session) => {
      summary.totalInputTokens += session.totalInputTokens
      summary.inputTokens += session.inputTokens
      summary.cacheReadTokens += session.cacheReadTokens
      summary.cacheCreationTokens += session.cacheCreationTokens
      summary.outputTokens += session.outputTokens
      summary.sessions += 1
      summary.turns += session.turns
      summary.agentRuns += session.agentRuns
      return summary
    },
    {
      totalInputTokens: 0,
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 0,
      sessions: 0,
      turns: 0,
      agentRuns: 0,
    }
  )
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort()
}

function buildFilters(sessions: SessionUsage[]): AnalyticsFilters {
  const runs = sessions.flatMap((session) => session.runs)

  return {
    projects: uniqueSorted(sessions.map((session) => session.project)),
    agentNames: uniqueSorted(runs.map((run) => run.agentName)),
    intents: [...intents, UNTAGGED_INTENT],
    clients: uniqueSorted(sessions.map((session) => session.client)),
  }
}

export function getAnalyticsDashboardData(): AnalyticsDashboardData {
  ensureAnalyticsSchema()

  const sessions = getSessions()

  return {
    dbPath,
    sessions,
    summary: buildSummary(sessions),
    filters: buildFilters(sessions),
  }
}
