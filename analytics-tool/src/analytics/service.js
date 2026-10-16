import { getDefaultProjectName } from "./config.js";
import {
  createDatabaseConnection,
  initializeDatabase,
  insertTrace,
  reconcileIntents,
  upsertTokenUsage,
} from "./db.js";
import { logError, logInfo } from "./logger.js";

/**
 * Creates the reusable analytics service used by the CLI, the token collector, and the OpenCode plugin.
 *
 * @param {{dbPath?: string}} [options={}] Service configuration.
 * @returns {{close: () => void, init: () => {ok: boolean}, recordUsage: Function, trace: Function}} Analytics service API.
 */
export function createAnalyticsTraceService({ dbPath } = {}) {
  const sqlite = createDatabaseConnection(dbPath);
  initializeDatabase(sqlite);

  function close() {
    sqlite.close();
  }

  function init() {
    initializeDatabase(sqlite);
    logInfo("analytics.init", { hasCustomDbPath: Boolean(dbPath) });
    return { ok: true };
  }

  /**
   * Persists a tracked analytics trace.
   *
   * @param {{project?: string, area?: string, trace?: string, details?: string, status?: string, priority?: string, confirmedByUser?: boolean}} input Trace payload.
   * @returns {{ok: boolean, record?: object, error?: string}} Trace result.
   */
  function trace({
    project = getDefaultProjectName(),
    area = "General",
    trace,
    details = "",
    status = "open",
    priority = "medium",
    confirmedByUser = true,
  }) {
    if (!trace) {
      return {
        ok: false,
        error: "A trace is required.",
      };
    }

    void confirmedByUser;

    const timestamp = new Date().toISOString();

    try {
      const id = insertTrace(sqlite, {
        project,
        area,
        trace,
        details,
        status,
        priority,
        timestamp,
      });

      logInfo("analytics.trace", { project, area, status, priority, inserted: 1 });

      return {
        ok: true,
        record: {
          id,
          project,
          area,
          timestamp,
        },
      };
    } catch (error) {
      logError("analytics.trace_failed", {
        project,
        area,
        error: error instanceof Error ? error.message : "unknown",
      });
      return {
        ok: false,
        error: "Failed to persist analytics trace.",
      };
    }
  }

  /**
   * Stores the usage of every turn and agent run collected for one session, then
   * spreads orchestrator intents across them, all in one transaction.
   *
   * @param {string} sessionId Session that was collected (for logging; records carry their own).
   * @param {Array<import("./db.js").TokenUsageRecord>} records Usage records.
   * @returns {{ok: boolean, stored?: number, error?: string}} Result.
   */
  function recordUsage(sessionId, records) {
    try {
      sqlite.exec("BEGIN IMMEDIATE");
      for (const record of records) {
        upsertTokenUsage(sqlite, record);
      }
      for (const id of new Set(records.map((record) => record.sessionId))) {
        reconcileIntents(sqlite, id);
      }
      sqlite.exec("COMMIT");
      return { ok: true, stored: records.length };
    } catch (error) {
      try {
        sqlite.exec("ROLLBACK");
      } catch {
        // Nothing was opened.
      }
      logError("analytics.usage_failed", {
        sessionId,
        error: error instanceof Error ? error.message : "unknown",
      });
      return { ok: false, error: "Failed to persist token usage." };
    }
  }

  return {
    close,
    init,
    recordUsage,
    trace,
  };
}
