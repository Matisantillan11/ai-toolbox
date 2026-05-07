import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getAnalyticsDbPath } from "./config.js";

const executionInvocationTypes = new Set(["agent", "skill"]);
const executionActionClassifications = new Set([
  "feature",
  "planning",
  "bug",
  "qa",
  "design",
  "refactor",
  "research",
]);

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
    CREATE TABLE IF NOT EXISTS analytics_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL UNIQUE,
      project TEXT NOT NULL,
      caller_agent TEXT NOT NULL,
      invoked_name TEXT NOT NULL,
      invocation_type TEXT NOT NULL,
      action_classification TEXT NOT NULL,
      call_count INTEGER NOT NULL DEFAULT 1,
      tokens_spent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (invocation_type IN ('agent', 'skill')),
      CHECK (action_classification IN ('feature', 'planning', 'bug', 'qa', 'design', 'refactor', 'research')),
      CHECK (call_count >= 0),
      CHECK (tokens_spent >= 0)
    );
  `);

  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_traces_project_idx ON analytics_traces(project);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_traces_area_idx ON analytics_traces(area);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_traces_status_idx ON analytics_traces(status);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_traces_priority_idx ON analytics_traces(priority);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_executions_project_idx ON analytics_executions(project);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_executions_caller_agent_idx ON analytics_executions(caller_agent);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_executions_invoked_name_idx ON analytics_executions(invoked_name);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_executions_invocation_type_idx ON analytics_executions(invocation_type);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_executions_action_classification_idx ON analytics_executions(action_classification);");

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
 * Inserts an execution audit record into the analytics executions table.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {{runId: string, project: string, callerAgent: string, invokedName: string, invocationType: string, actionClassification: string, callCount: number, tokensSpent: number, createdAt: string}} record Execution payload.
 * @returns {number} Inserted row id.
 */
export function insertExecution(sqlite, record) {
  if (!executionInvocationTypes.has(record.invocationType)) {
    throw new Error(`Invalid invocation type: ${record.invocationType}`);
  }

  if (!executionActionClassifications.has(record.actionClassification)) {
    throw new Error(`Invalid action classification: ${record.actionClassification}`);
  }

  const statement = sqlite.prepare(`
    INSERT INTO analytics_executions (
      run_id,
      project,
      caller_agent,
      invoked_name,
      invocation_type,
      action_classification,
      call_count,
      tokens_spent,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = statement.run(
    record.runId,
    record.project,
    record.callerAgent,
    record.invokedName,
    record.invocationType,
    record.actionClassification,
    record.callCount,
    record.tokensSpent,
    record.createdAt
  );

  return Number(result.lastInsertRowid);
}

/**
 * Inserts or updates an execution audit record keyed by run id.
 *
 * This lets an agent persist a placeholder execution early and enrich it later
 * with a better token count during closeout without creating duplicate rows.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {{runId: string, project: string, callerAgent: string, invokedName: string, invocationType: string, actionClassification: string, callCount: number, tokensSpent: number, createdAt: string}} record Execution payload.
 * @returns {number} Row id for the inserted or updated execution.
 */
export function upsertExecution(sqlite, record) {
  if (!executionInvocationTypes.has(record.invocationType)) {
    throw new Error(`Invalid invocation type: ${record.invocationType}`);
  }

  if (!executionActionClassifications.has(record.actionClassification)) {
    throw new Error(`Invalid action classification: ${record.actionClassification}`);
  }

  const statement = sqlite.prepare(`
    INSERT INTO analytics_executions (
      run_id,
      project,
      caller_agent,
      invoked_name,
      invocation_type,
      action_classification,
      call_count,
      tokens_spent,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id) DO UPDATE SET
      project = excluded.project,
      caller_agent = excluded.caller_agent,
      invoked_name = excluded.invoked_name,
      invocation_type = excluded.invocation_type,
      action_classification = excluded.action_classification,
      call_count = MAX(analytics_executions.call_count, excluded.call_count),
      tokens_spent = CASE
        WHEN excluded.tokens_spent > 0 OR analytics_executions.tokens_spent = 0 THEN excluded.tokens_spent
        ELSE analytics_executions.tokens_spent
      END
  `);
  statement.run(
    record.runId,
    record.project,
    record.callerAgent,
    record.invokedName,
    record.invocationType,
    record.actionClassification,
    record.callCount,
    record.tokensSpent,
    record.createdAt
  );

  const row = sqlite
    .prepare("SELECT id FROM analytics_executions WHERE run_id = ?")
    .get(record.runId);

  return Number(row.id);
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
 * Returns the most recent execution audit records, optionally scoped to a single project.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {{project?: string, limit: number}} options Query options.
 * @returns {Array<object>} Latest matching execution records.
 */
export function selectLatestExecutions(sqlite, { project, limit }) {
  const sql = project
    ? `SELECT id, run_id, project, caller_agent, invoked_name, invocation_type, action_classification, call_count, tokens_spent, created_at
       FROM analytics_executions
       WHERE project = ?
       ORDER BY id DESC
       LIMIT ?`
    : `SELECT id, run_id, project, caller_agent, invoked_name, invocation_type, action_classification, call_count, tokens_spent, created_at
       FROM analytics_executions
       ORDER BY id DESC
       LIMIT ?`;
  const params = project ? [project, limit] : [limit];

  return sqlite.prepare(sql).all(...params);
}
