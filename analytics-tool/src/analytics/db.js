import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getAnalyticsDbPath } from "./config.js";
import { INTENTS, isIntent } from "./intents.js";

const usageKinds = new Set(["turn", "agent"]);
const intentList = INTENTS.map((intent) => `'${intent}'`).join(", ");

/**
 * Ensures the parent directory exists before SQLite opens the database file.
 *
 * @param {string} filePath Absolute path to the database file.
 * @returns {void}
 */
function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * Creates the synchronous SQLite connection used by the analytics trace tool.
 *
 * @param {string} [dbPath=getAnalyticsDbPath()] Database file path.
 * @returns {DatabaseSync} Open SQLite database connection.
 */
export function createDatabaseConnection(dbPath = getAnalyticsDbPath()) {
  ensureParentDirectory(dbPath);
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  // Several detached collectors can finish at once (Stop right after SubagentStop).
  sqlite.exec("PRAGMA busy_timeout = 5000;");
  return sqlite;
}

/**
 * Migrates older analytics records into the current traces table.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @returns {void}
 */
function migrateLegacyNeedsTable(sqlite) {
  const hasLegacyTable = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'analytics_needs'")
    .get();

  if (!hasLegacyTable) {
    return;
  }

  sqlite.exec(`
    INSERT INTO analytics_traces (id, project, area, trace, details, status, priority, timestamp)
    SELECT id, project, area, need, details, status, priority, timestamp
    FROM analytics_needs
    WHERE id NOT IN (SELECT id FROM analytics_traces);
  `);
}

/**
 * Creates the analytics traces table and indexes if they do not exist.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @returns {void}
 */
export function initializeDatabase(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS analytics_traces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT NOT NULL,
      area TEXT,
      trace TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium',
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

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
  `);

  // What was asked (all input, cached or not) vs. what was generated, per session.
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
  `);

  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_traces_project_idx ON analytics_traces(project);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_traces_area_idx ON analytics_traces(area);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_traces_status_idx ON analytics_traces(status);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_traces_priority_idx ON analytics_traces(priority);");

  sqlite.exec("CREATE INDEX IF NOT EXISTS token_usage_session_idx ON token_usage(session_id);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS token_usage_project_idx ON token_usage(project);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS token_usage_intent_idx ON token_usage(intent);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS token_usage_parent_idx ON token_usage(parent_run_id);");

  migrateLegacyNeedsTable(sqlite);
}

/**
 * Inserts a trace into the main SQLite table.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {{project: string, area: string, trace: string, details: string, status: string, priority: string, timestamp: string}} record Trace payload.
 * @returns {number} Inserted row id.
 */
export function insertTrace(sqlite, record) {
  const statement = sqlite.prepare(`
    INSERT INTO analytics_traces (project, area, trace, details, status, priority, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = statement.run(
    record.project,
    record.area,
    record.trace,
    record.details,
    record.status,
    record.priority,
    record.timestamp
  );

  return Number(result.lastInsertRowid);
}

/**
 * @typedef {object} TokenUsageRecord
 * @property {string} runId Stable id: `<session>:turn:<promptId>` or `<session>:agent:<agentId>`.
 * @property {"turn" | "agent"} kind Main-session turn or sub-agent run.
 * @property {string} [client="claude-code"] Host the usage came from.
 * @property {string} sessionId Session the usage belongs to.
 * @property {string | null} [promptId] Turn prompt id.
 * @property {string | null} [parentRunId] For an agent, the run id of the turn that spawned it.
 * @property {string} project Project name.
 * @property {string | null} [cwd] Working directory.
 * @property {string | null} [gitBranch] Branch at the time of the turn.
 * @property {string} agentName `main` for a turn, the agent type for a sub-agent.
 * @property {string | null} [description] Short task description of a sub-agent run.
 * @property {string | null} [intent] Orchestrator intent, only when a marker said so.
 * @property {string | null} [model] Model that generated the most output.
 * @property {string[]} [models] Every model used.
 * @property {number} inputTokens Uncached input tokens.
 * @property {number} cacheReadTokens Input tokens read from the prompt cache.
 * @property {number} cacheCreationTokens Input tokens written to the prompt cache.
 * @property {number} outputTokens Generated tokens.
 * @property {number} [apiCalls] Distinct API responses.
 * @property {number} [toolCalls] Tool calls the model made.
 * @property {string | null} [startedAt] First record timestamp.
 * @property {string | null} [endedAt] Last record timestamp.
 * @property {string | null} [clientVersion] Host version.
 */

/**
 * Inserts or replaces the usage of one turn or agent run, keyed by run id.
 *
 * Collection re-reads whole transcripts, so a later write always carries the
 * complete totals and simply replaces the earlier ones. The intent is the
 * exception: a write without one never erases one already stored.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {TokenUsageRecord} record Usage payload.
 * @returns {number} Row id.
 */
export function upsertTokenUsage(sqlite, record) {
  if (!usageKinds.has(record.kind)) {
    throw new Error(`Invalid usage kind: ${record.kind}`);
  }

  const intent = record.intent ?? null;
  if (intent !== null && !isIntent(intent)) {
    throw new Error(`Invalid intent: ${intent}`);
  }

  sqlite
    .prepare(`
      INSERT INTO token_usage (
        run_id, kind, client, session_id, prompt_id, parent_run_id, project, cwd, git_branch,
        agent_name, description, intent, model, models,
        input_tokens, cache_read_tokens, cache_creation_tokens, output_tokens,
        api_calls, tool_calls, started_at, ended_at, client_version, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        parent_run_id = COALESCE(excluded.parent_run_id, token_usage.parent_run_id),
        description = COALESCE(excluded.description, token_usage.description),
        intent = COALESCE(excluded.intent, token_usage.intent),
        model = excluded.model,
        models = excluded.models,
        input_tokens = excluded.input_tokens,
        cache_read_tokens = excluded.cache_read_tokens,
        cache_creation_tokens = excluded.cache_creation_tokens,
        output_tokens = excluded.output_tokens,
        api_calls = excluded.api_calls,
        tool_calls = excluded.tool_calls,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        client_version = COALESCE(excluded.client_version, token_usage.client_version),
        updated_at = excluded.updated_at
    `)
    .run(
      record.runId,
      record.kind,
      record.client ?? "claude-code",
      record.sessionId,
      record.promptId ?? null,
      record.parentRunId ?? null,
      record.project,
      record.cwd ?? null,
      record.gitBranch ?? null,
      record.agentName,
      record.description ?? null,
      intent,
      record.model ?? null,
      JSON.stringify(record.models ?? []),
      record.inputTokens,
      record.cacheReadTokens,
      record.cacheCreationTokens,
      record.outputTokens,
      record.apiCalls ?? 0,
      record.toolCalls ?? 0,
      record.startedAt ?? null,
      record.endedAt ?? null,
      record.clientVersion ?? null,
      new Date().toISOString()
    );

  return Number(sqlite.prepare("SELECT id FROM token_usage WHERE run_id = ?").get(record.runId).id);
}

/**
 * Spreads orchestrator intents across a session's turns and their sub-agents.
 *
 * The marker can land on either side: in the main transcript when the session
 * itself orchestrates, or only inside the orchestrator sub-agent's transcript.
 * A turn without a marker takes the intent of its earliest tagged sub-agent,
 * then every untagged sub-agent takes its turn's intent. Rows with no tagged
 * relative stay NULL — nothing is guessed.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {string} sessionId Session to reconcile.
 * @returns {void}
 */
export function reconcileIntents(sqlite, sessionId) {
  sqlite
    .prepare(`
      UPDATE token_usage
      SET intent = (
        SELECT child.intent FROM token_usage child
        WHERE child.parent_run_id = token_usage.run_id AND child.intent IS NOT NULL
        ORDER BY child.started_at
        LIMIT 1
      )
      WHERE session_id = ? AND kind = 'turn' AND intent IS NULL
    `)
    .run(sessionId);

  sqlite
    .prepare(`
      UPDATE token_usage
      SET intent = (
        SELECT parent.intent FROM token_usage parent WHERE parent.run_id = token_usage.parent_run_id
      )
      WHERE session_id = ? AND kind = 'agent' AND intent IS NULL
    `)
    .run(sessionId);
}

/**
 * Returns the most recent traces, optionally scoped to a single project.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {{project?: string, limit: number}} options Query options.
 * @returns {Array<object>} Latest matching traces.
 */
export function selectLatest(sqlite, { project, limit }) {
  const sql = project
    ? `SELECT id, project, area, trace, details, status, priority, timestamp
       FROM analytics_traces
       WHERE project = ?
       ORDER BY id DESC
       LIMIT ?`
    : `SELECT id, project, area, trace, details, status, priority, timestamp
       FROM analytics_traces
       ORDER BY id DESC
       LIMIT ?`;
  const params = project ? [project, limit] : [limit];

  return sqlite.prepare(sql).all(...params);
}

/**
 * Returns the most recent usage rows, optionally scoped to one session or project.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {{sessionId?: string, project?: string, limit?: number}} [options={}] Query options.
 * @returns {Array<object>} Usage rows, newest first.
 */
export function selectTokenUsage(sqlite, { sessionId, project, limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (sessionId) {
    where.push("session_id = ?");
    params.push(sessionId);
  }
  if (project) {
    where.push("project = ?");
    params.push(project);
  }

  return sqlite
    .prepare(`
      SELECT * FROM token_usage
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY started_at DESC, id DESC
      LIMIT ?
    `)
    .all(...params, limit);
}

/**
 * Returns per-session input/output totals, newest first.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {{limit?: number}} [options={}] Query options.
 * @returns {Array<object>} Rows of the `session_token_usage` view.
 */
export function selectSessionUsage(sqlite, { limit = 100 } = {}) {
  return sqlite
    .prepare("SELECT * FROM session_token_usage ORDER BY started_at DESC LIMIT ?")
    .all(limit);
}
