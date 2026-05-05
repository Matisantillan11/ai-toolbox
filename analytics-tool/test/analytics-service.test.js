import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAnalyticsTraceService } from "../src/analytics/service.js";
import { createDatabaseConnection, selectLatest } from "../src/analytics/db.js";

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
