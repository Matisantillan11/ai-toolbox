import { getDefaultProjectName } from "./config.js";
import {
  createDatabaseConnection,
  initializeDatabase,
  insertTrace,
} from "./db.js";
import { logError, logInfo } from "./logger.js";

/**
 * Creates the reusable analytics trace service used by both the MCP server and the local CLI.
 *
 * @param {{dbPath?: string}} [options={}] Service configuration.
 * @returns {{close: () => void, init: () => {ok: boolean}, trace: Function}} Analytics service API.
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
   * @returns {{ok: boolean, record?: {id: number, project: string, area: string, timestamp: string}, error?: string}} Trace result.
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

  return {
    close,
    init,
    trace,
  };
}
