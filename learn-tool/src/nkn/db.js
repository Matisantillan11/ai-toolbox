import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getNknDbPath } from "./config.js";

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
 * Creates the synchronous SQLite connection used by the learn-tool.
 *
 * @param {string} [dbPath=getNknDbPath()] Database file path.
 * @returns {DatabaseSync} Open SQLite database connection.
 */
export function createDatabaseConnection(dbPath = getNknDbPath()) {
  ensureParentDirectory(dbPath);
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  return sqlite;
}

/**
 * Creates the decisions table, indexes, and FTS table if they do not exist.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @returns {void}
 */
export function initializeDatabase(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT NOT NULL,
      topic TEXT,
      decision TEXT NOT NULL,
      reasoning TEXT,
      stack TEXT,
      tokens_cost INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  sqlite.exec("CREATE INDEX IF NOT EXISTS decisions_project_idx ON decisions(project);");
  sqlite.exec("CREATE INDEX IF NOT EXISTS decisions_topic_idx ON decisions(topic);");

  try {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS decisions_search USING fts5(
        project UNINDEXED,
        topic,
        decision,
        reasoning,
        stack,
        tokenize = 'unicode61'
      );
    `);
  } catch {
    return;
  }

  const rowCount = sqlite.prepare("SELECT COUNT(*) AS count FROM decisions_search").get();
  if (Number(rowCount?.count || 0) === 0) {
    sqlite.exec(`
      INSERT INTO decisions_search(project, topic, decision, reasoning, stack)
      SELECT project, topic, decision, reasoning, stack FROM decisions;
    `);
  }
}

/**
 * Rebuilds the FTS search table from the canonical decisions table.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @returns {void}
 */
export function rebuildSearchIndex(sqlite) {
  try {
    sqlite.exec("DELETE FROM decisions_search;");
    sqlite.exec(`
      INSERT INTO decisions_search(project, topic, decision, reasoning, stack)
      SELECT project, topic, decision, reasoning, stack FROM decisions;
    `);
  } catch {
    return;
  }
}

/**
 * Inserts a search-index record when FTS is available.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {{project: string, topic: string, decision: string, reasoning: string, stack: string}} record Indexed record.
 * @returns {void}
 */
export function insertSearchIndex(sqlite, record) {
  try {
    sqlite
      .prepare(
        `INSERT INTO decisions_search(project, topic, decision, reasoning, stack)
         VALUES (@project, @topic, @decision, @reasoning, @stack)`
      )
      .run(record);
  } catch {
    return;
  }
}

/**
 * Searches the FTS table when full-text search support is available.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {string} term Search term.
 * @param {string | undefined} project Optional project filter.
 * @param {number} limit Maximum number of rows to return.
 * @returns {Array<object> | null} Matched rows, an empty array, or `null` when FTS is unavailable.
 */
export function searchWithFts(sqlite, term, project, limit) {
  try {
    const sql = project
      ? `SELECT rowid FROM decisions_search WHERE decisions_search MATCH ? AND project = ? LIMIT ?`
      : `SELECT rowid FROM decisions_search WHERE decisions_search MATCH ? LIMIT ?`;
    const params = project ? [term, project, limit] : [term, limit];
    const matches = sqlite.prepare(sql).all(...params);

    if (!matches.length) {
      return [];
    }

    const detailStmt = sqlite.prepare(
      `SELECT id, project, topic, decision, reasoning, stack, tokens_cost, timestamp
       FROM decisions
       WHERE id = ?`
    );

    return matches
      .map((match) => detailStmt.get(match.rowid))
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Searches the decisions table using `LIKE` as a fallback when FTS is unavailable.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {string} term Search term.
 * @param {string | undefined} project Optional project filter.
 * @param {number} limit Maximum number of rows to return.
 * @returns {Array<object>} Matched rows from the main decisions table.
 */
export function searchWithLike(sqlite, term, project, limit) {
  const searchTerm = `%${term}%`;
  const sql = project
    ? `SELECT id, project, topic, decision, reasoning, stack, tokens_cost, timestamp
       FROM decisions
       WHERE project = ? AND (decision LIKE ? OR topic LIKE ? OR reasoning LIKE ? OR stack LIKE ?)
       ORDER BY id DESC
       LIMIT ?`
    : `SELECT id, project, topic, decision, reasoning, stack, tokens_cost, timestamp
       FROM decisions
       WHERE decision LIKE ? OR topic LIKE ? OR reasoning LIKE ? OR stack LIKE ?
       ORDER BY id DESC
       LIMIT ?`;
  const params = project
    ? [project, searchTerm, searchTerm, searchTerm, searchTerm, limit]
    : [searchTerm, searchTerm, searchTerm, searchTerm, limit];

  return sqlite.prepare(sql).all(...params);
}

/**
 * Inserts a decision into the main SQLite table.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {{project: string, topic: string, decision: string, reasoning: string, stack: string, tokensCost: number, timestamp: string}} record Decision payload.
 * @returns {number} Inserted row id.
 */
export function insertDecision(sqlite, record) {
  const statement = sqlite.prepare(`
    INSERT INTO decisions (project, topic, decision, reasoning, stack, tokens_cost, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = statement.run(
    record.project,
    record.topic,
    record.decision,
    record.reasoning,
    record.stack,
    record.tokensCost,
    record.timestamp
  );

  return Number(result.lastInsertRowid);
}

/**
 * Selects a single decision row by id.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {number} id Decision id.
 * @returns {object | undefined} Matching decision row if present.
 */
export function selectDecisionById(sqlite, id) {
  return sqlite.prepare(
    `SELECT id, project, topic, decision, reasoning, stack, tokens_cost, timestamp
     FROM decisions
     WHERE id = ?`
  ).get(id);
}

/**
 * Updates a decision row by id.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {{id: number, project: string, topic: string, decision: string, reasoning: string, stack: string, tokensCost: number}} record Full decision payload.
 * @returns {number} Number of affected rows.
 */
export function updateDecision(sqlite, record) {
  const result = sqlite.prepare(`
    UPDATE decisions
    SET project = ?, topic = ?, decision = ?, reasoning = ?, stack = ?, tokens_cost = ?
    WHERE id = ?
  `).run(
    record.project,
    record.topic,
    record.decision,
    record.reasoning,
    record.stack,
    record.tokensCost,
    record.id
  );

  return Number(result.changes);
}

/**
 * Deletes a decision row by id.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {number} id Decision id.
 * @returns {number} Number of affected rows.
 */
export function deleteDecision(sqlite, id) {
  const result = sqlite.prepare("DELETE FROM decisions WHERE id = ?").run(id);
  return Number(result.changes);
}

/**
 * Returns the most recent decisions, optionally scoped to a single project.
 *
 * @param {DatabaseSync} sqlite Open SQLite connection.
 * @param {{project?: string, limit: number}} options Query options.
 * @returns {Array<object>} Latest matching decisions.
 */
export function selectLatest(sqlite, { project, limit }) {
  const sql = project
    ? `SELECT id, project, topic, decision, reasoning, stack, tokens_cost, timestamp
       FROM decisions
       WHERE project = ?
       ORDER BY id DESC
       LIMIT ?`
    : `SELECT id, project, topic, decision, reasoning, stack, tokens_cost, timestamp
       FROM decisions
       ORDER BY id DESC
       LIMIT ?`;
  const params = project ? [project, limit] : [limit];

  return sqlite.prepare(sql).all(...params);
}
