import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getAnalyticsDbPath } from "./config.js";

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

  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_traces_project_idx ON analytics_traces(project);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_traces_area_idx ON analytics_traces(area);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_traces_status_idx ON analytics_traces(status);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS analytics_traces_priority_idx ON analytics_traces(priority);");

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
