import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAnalyticsTraceService } from "../src/analytics/service.js";
import {
  createDatabaseConnection,
  selectLatest,
  selectLatestExecutions,
} from "../src/analytics/db.js";

function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-analytics-"));
  return path.join(dir, "analytics.db");
}

test("trace persists an analytics record by default", () => {
  const dbPath = createTempDbPath();
  const service = createAnalyticsTraceService({ dbPath });
  const sqlite = createDatabaseConnection(dbPath);

  try {
    const result = service.trace({
      project: "analytics-app",
      area: "Dashboard",
      trace: "Track activation funnel events",
      details: "We need event coverage for signup, onboarding, and first report creation.",
      priority: "high",
    });

    assert.equal(result.ok, true);
    assert.equal(typeof result.record.id, "number");

    const latest = selectLatest(sqlite, { project: "analytics-app", limit: 1 });
    assert.equal(latest.length, 1);
    assert.equal(latest[0].trace, "Track activation funnel events");
    assert.equal(latest[0].priority, "high");
  } finally {
    service.close();
    sqlite.close();
  }
});

test("trace still allows explicit confirmation flag overrides", () => {
  const service = createAnalyticsTraceService({ dbPath: createTempDbPath() });

  try {
    const result = service.trace({
      trace: "Persist this trace even when confirmation is passed explicitly",
      confirmedByUser: false,
    });

    assert.equal(result.ok, true);
    assert.equal(typeof result.record.id, "number");
  } finally {
    service.close();
  }
});

test("trace persists execution analytics for orchestrator and skills", () => {
  const dbPath = createTempDbPath();
  const service = createAnalyticsTraceService({ dbPath });
  const sqlite = createDatabaseConnection(dbPath);

  try {
    const result = service.trace({
      project: "ai-toolbox",
      trace: "Audit orchestrator invoking a review skill",
      callerAgent: "orchestrator-agent",
      invokedName: "code-review",
      invocationType: "skill",
      actionClassification: "qa",
      callCount: 3,
      tokensSpent: 1824,
    });

    assert.equal(result.ok, true);
    assert.equal(typeof result.record.id, "number");
    assert.equal(result.record.callerAgent, "orchestrator-agent");
    assert.equal(result.record.invokedName, "code-review");

    const latest = selectLatestExecutions(sqlite, { project: "ai-toolbox", limit: 1 });
    assert.equal(latest.length, 1);
    assert.equal(latest[0].caller_agent, "orchestrator-agent");
    assert.equal(latest[0].invoked_name, "code-review");
    assert.equal(latest[0].invocation_type, "skill");
    assert.equal(latest[0].action_classification, "qa");
    assert.equal(latest[0].call_count, 3);
    assert.equal(latest[0].tokens_spent, 1824);
  } finally {
    service.close();
    sqlite.close();
  }
});

test("trace updates an existing execution when the same runId is finalized later", () => {
  const dbPath = createTempDbPath();
  const service = createAnalyticsTraceService({ dbPath });
  const sqlite = createDatabaseConnection(dbPath);

  try {
    service.trace({
      project: "ai-toolbox",
      runId: "run-finalize-1",
      callerAgent: "orchestrator-agent",
      invokedName: "implement-task-agent",
      invocationType: "agent",
      actionClassification: "feature",
      callCount: 1,
      tokensSpent: 0,
    });

    const result = service.trace({
      project: "ai-toolbox",
      runId: "run-finalize-1",
      callerAgent: "orchestrator-agent",
      invokedName: "implement-task-agent",
      invocationType: "agent",
      actionClassification: "feature",
      callCount: 1,
      tokensSpent: 2410,
    });

    assert.equal(result.ok, true);

    const latest = selectLatestExecutions(sqlite, { project: "ai-toolbox", limit: 10 });
    assert.equal(latest.length, 1);
    assert.equal(latest[0].run_id, "run-finalize-1");
    assert.equal(latest[0].tokens_spent, 2410);
  } finally {
    service.close();
    sqlite.close();
  }
});
