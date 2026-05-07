import { randomUUID } from "node:crypto";
import { getDefaultProjectName } from "./config.js";
import {
  createDatabaseConnection,
  initializeDatabase,
  insertTrace,
  upsertExecution,
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

  function isExecutionPayload(input) {
    return Boolean(
      input.runId ||
        input.callerAgent ||
        input.invokedName ||
        input.invocationType ||
        input.actionClassification ||
        typeof input.callCount === "number" ||
        typeof input.tokensSpent === "number"
    );
  }

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
   * @param {{project?: string, area?: string, trace?: string, details?: string, status?: string, priority?: string, confirmedByUser?: boolean, runId?: string, callerAgent?: string, invokedName?: string, invocationType?: string, actionClassification?: string, callCount?: number, tokensSpent?: number}} input Trace payload.
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
    runId,
    callerAgent,
    invokedName,
    invocationType,
    actionClassification,
    callCount,
    tokensSpent,
  }) {
    const executionPayload = {
      runId,
      callerAgent,
      invokedName,
      invocationType,
      actionClassification,
      callCount,
      tokensSpent,
    };
    const shouldTrackExecution = isExecutionPayload(executionPayload);

    if (!trace && !shouldTrackExecution) {
      return {
        ok: false,
        error: "A trace is required.",
      };
    }

    void confirmedByUser;

    const timestamp = new Date().toISOString();

    try {
      if (shouldTrackExecution) {
        if (!callerAgent || !invokedName) {
          return {
            ok: false,
            error: "Execution traces require both callerAgent and invokedName.",
          };
        }

        const executionRunId = runId ?? randomUUID();

        const id = upsertExecution(sqlite, {
          runId: executionRunId,
          project,
          callerAgent,
          invokedName,
          invocationType: invocationType ?? "agent",
          actionClassification: actionClassification ?? "research",
          callCount: callCount ?? 1,
          tokensSpent: tokensSpent ?? 0,
          createdAt: timestamp,
        });

        logInfo("analytics.execution", {
          project,
          callerAgent,
          invokedName,
          invocationType: invocationType ?? "agent",
          actionClassification: actionClassification ?? "research",
          callCount: callCount ?? 1,
          tokensSpent: tokensSpent ?? 0,
          upserted: 1,
        });

        return {
          ok: true,
          record: {
            id,
            runId: executionRunId,
            project,
            callerAgent,
            invokedName,
            invocationType: invocationType ?? "agent",
            actionClassification: actionClassification ?? "research",
            callCount: callCount ?? 1,
            tokensSpent: tokensSpent ?? 0,
            timestamp,
          },
        };
      }

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
