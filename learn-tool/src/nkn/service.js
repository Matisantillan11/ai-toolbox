import { getDefaultProjectName } from "./config.js";
import {
  createDatabaseConnection,
  deleteDecision,
  initializeDatabase,
  insertSearchIndex,
  insertDecision,
  rebuildSearchIndex,
  selectDecisionById,
  searchWithFts,
  searchWithLike,
  selectLatest,
  updateDecision,
} from "./db.js";
import { logError, logInfo } from "./logger.js";

/**
 * Normalizes raw SQLite rows into the public result shape returned by the service.
 *
 * @param {Record<string, unknown>} record Raw SQLite row.
 * @returns {{id: unknown, project: unknown, topic: string, decision: unknown, reasoning: string, stack: string, tokensCost: number, timestamp: unknown}} Normalized record.
 */
function normalizeRecord(record) {
  return {
    id: record.id,
    project: record.project,
    topic: record.topic || "General",
    decision: record.decision,
    reasoning: record.reasoning || "",
    stack: record.stack || "",
    tokensCost: record.tokens_cost ?? record.tokensCost ?? 0,
    timestamp: record.timestamp,
  };
}

/**
 * Creates the reusable NKN service used by both the MCP server and the local CLI.
 *
 * @param {{dbPath?: string}} [options={}] Service configuration.
 * @returns {{close: () => void, init: () => {ok: boolean}, learn: Function, latest: Function, recall: Function}} NKN service API.
 */
export function createNknService({ dbPath } = {}) {
  const sqlite = createDatabaseConnection(dbPath);
  initializeDatabase(sqlite);

  /**
   * Closes the underlying SQLite connection.
   *
   * @returns {void}
   */
  function close() {
    sqlite.close();
  }

  /**
   * Ensures the database schema exists and returns a simple success response.
   *
   * @returns {{ok: boolean}} Initialization status.
   */
  function init() {
    initializeDatabase(sqlite);
    logInfo("nkn.init", { hasCustomDbPath: Boolean(dbPath) });
    return { ok: true };
  }

  /**
   * Persists a learning into the NKN store.
   *
   * @param {{project?: string, topic?: string, decision?: string, reasoning?: string, stack?: string, tokensCost?: number, confirmedByUser?: boolean}} input Learn payload.
   * @returns {{ok: boolean, record?: {id: number, project: string, topic: string, timestamp: string}, error?: string}} Learn result.
   */
  function learn({
    project = getDefaultProjectName(),
    topic = "General",
    decision,
    reasoning = "",
    stack = "",
    tokensCost = 0,
    confirmedByUser = true,
  }) {
    if (!decision) {
      return {
        ok: false,
        error: "A decision is required.",
      };
    }

    void confirmedByUser;

    const timestamp = new Date().toISOString();

    try {
      const id = insertDecision(sqlite, {
        project,
        topic,
        decision,
        reasoning,
        stack,
        tokensCost,
        timestamp,
      });

      insertSearchIndex(sqlite, {
        project,
        topic,
        decision,
        reasoning,
        stack,
      });

      logInfo("nkn.learn", { project, topic, inserted: 1 });

      return {
        ok: true,
        record: {
          id,
          project,
          topic,
          timestamp,
        },
      };
    } catch (error) {
      logError("nkn.learn_failed", { project, topic, error: error instanceof Error ? error.message : "unknown" });
      return {
        ok: false,
        error: "Failed to persist learning.",
      };
    }
  }

  /**
   * Searches the NKN store for relevant prior decisions.
   *
   * @param {{term?: string, project?: string, limit?: number}} input Recall query.
   * @returns {{ok: boolean, status?: "success" | "no_results", results?: Array<object>, error?: string}} Recall result.
   */
  function recall({ term, project, limit = 10 }) {
    if (!term) {
      return {
        ok: false,
        error: "A recall term is required.",
      };
    }

    try {
      const ftsResults = searchWithFts(sqlite, term, project, limit);
      const records = (ftsResults ?? searchWithLike(sqlite, term, project, limit)).map(normalizeRecord);
      logInfo("nkn.recall", { project: project || "all", limit, results: records.length });

      return {
        ok: true,
        status: records.length ? "success" : "no_results",
        results: records,
      };
    } catch (error) {
      logError("nkn.recall_failed", { project: project || "all", error: error instanceof Error ? error.message : "unknown" });
      return {
        ok: false,
        error: "Failed to query NKN.",
      };
    }
  }

  /**
   * Returns the latest stored decisions for diagnostics and tests.
   *
   * @param {{project?: string, limit?: number}} input Latest-query options.
   * @returns {Array<object>} Latest normalized decisions.
   */
  function latest({ project, limit = 10 }) {
    return selectLatest(sqlite, { project, limit }).map(normalizeRecord);
  }

  /**
   * Updates an existing learning entry and refreshes the search index.
   *
   * @param {{id?: number, project?: string, topic?: string, decision?: string, reasoning?: string, stack?: string, tokensCost?: number}} input Update payload.
   * @returns {{ok: boolean, record?: object, error?: string}} Update result.
   */
  function update({ id, project, topic, decision, reasoning, stack, tokensCost }) {
    if (!Number.isInteger(id) || id <= 0) {
      return {
        ok: false,
        error: "A valid learning id is required.",
      };
    }

    const existing = selectDecisionById(sqlite, id);
    if (!existing) {
      return {
        ok: false,
        error: "Learning not found.",
      };
    }

    const nextRecord = {
      id,
      project: project ?? existing.project,
      topic: topic ?? existing.topic ?? "General",
      decision: decision ?? existing.decision,
      reasoning: reasoning ?? existing.reasoning ?? "",
      stack: stack ?? existing.stack ?? "",
      tokensCost: tokensCost ?? existing.tokens_cost ?? 0,
    };

    if (!nextRecord.decision) {
      return {
        ok: false,
        error: "A decision is required.",
      };
    }

    try {
      const changes = updateDecision(sqlite, nextRecord);
      rebuildSearchIndex(sqlite);
      logInfo("nkn.update", { id, changes });

      return {
        ok: true,
        record: normalizeRecord(selectDecisionById(sqlite, id)),
      };
    } catch (error) {
      logError("nkn.update_failed", { id, error: error instanceof Error ? error.message : "unknown" });
      return {
        ok: false,
        error: "Failed to update learning.",
      };
    }
  }

  /**
   * Deletes an existing learning entry and refreshes the search index.
   *
   * @param {{id?: number}} input Delete payload.
   * @returns {{ok: boolean, deletedId?: number, error?: string}} Delete result.
   */
  function remove({ id }) {
    if (!Number.isInteger(id) || id <= 0) {
      return {
        ok: false,
        error: "A valid learning id is required.",
      };
    }

    const existing = selectDecisionById(sqlite, id);
    if (!existing) {
      return {
        ok: false,
        error: "Learning not found.",
      };
    }

    try {
      const changes = deleteDecision(sqlite, id);
      rebuildSearchIndex(sqlite);
      logInfo("nkn.delete", { id, changes });

      return {
        ok: true,
        deletedId: id,
      };
    } catch (error) {
      logError("nkn.delete_failed", { id, error: error instanceof Error ? error.message : "unknown" });
      return {
        ok: false,
        error: "Failed to delete learning.",
      };
    }
  }

  return {
    close,
    delete: remove,
    init,
    learn,
    latest,
    recall,
    update,
  };
}
