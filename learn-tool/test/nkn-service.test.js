import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createNknService } from "../src/nkn/service.js";

/**
 * Creates an isolated temporary SQLite database path for tests.
 *
 * @returns {string} Temporary database file path.
 */
function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-nkn-"));
  return path.join(dir, "nkn.db");
}

test("learn persists a record by default", () => {
  const service = createNknService({ dbPath: createTempDbPath() });

  try {
    const result = service.learn({
      project: "ai-toolbox",
      topic: "Architecture",
      decision: "Use a Node.js MCP for NKN access",
      reasoning: "Centralizes agent integration",
      stack: "Node.js, SQLite",
    });

    assert.equal(result.ok, true);
    assert.equal(typeof result.record.id, "number");

    const latest = service.latest({ project: "ai-toolbox", limit: 1 });
    assert.equal(latest.length, 1);
    assert.equal(latest[0].decision, "Use a Node.js MCP for NKN access");
  } finally {
    service.close();
  }
});

test("learn still allows explicit confirmation flag overrides", () => {
  const service = createNknService({ dbPath: createTempDbPath() });

  try {
    const result = service.learn({
      decision: "Persist this even when confirmation is passed explicitly",
      confirmedByUser: false,
    });

    assert.equal(result.ok, true);
    assert.equal(typeof result.record.id, "number");
  } finally {
    service.close();
  }
});

test("recall returns no_results when nothing matches", () => {
  const service = createNknService({ dbPath: createTempDbPath() });

  try {
    const result = service.recall({ term: "missing-term" });

    assert.equal(result.ok, true);
    assert.equal(result.status, "no_results");
    assert.deepEqual(result.results, []);
  } finally {
    service.close();
  }
});

test("recall can filter by project", () => {
  const service = createNknService({ dbPath: createTempDbPath() });

  try {
    service.learn({
      project: "project-a",
      topic: "Auth",
      decision: "Use passkeys",
    });
    service.learn({
      project: "project-b",
      topic: "Auth",
      decision: "Use magic links",
    });

    const result = service.recall({ term: "Use", project: "project-b" });

    assert.equal(result.ok, true);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].project, "project-b");
    assert.equal(result.results[0].decision, "Use magic links");
  } finally {
    service.close();
  }
});

test("update modifies an existing learning", () => {
  const service = createNknService({ dbPath: createTempDbPath() });

  try {
    const created = service.learn({
      project: "ai-toolbox",
      topic: "Architecture",
      decision: "Use initial memory strategy",
    });

    const result = service.update({
      id: created.record.id,
      decision: "Use updated memory strategy",
      reasoning: "Replaced with improved approach",
    });

    assert.equal(result.ok, true);
    assert.equal(result.record.decision, "Use updated memory strategy");
    assert.equal(result.record.reasoning, "Replaced with improved approach");
  } finally {
    service.close();
  }
});

test("delete removes an existing learning", () => {
  const service = createNknService({ dbPath: createTempDbPath() });

  try {
    const created = service.learn({
      project: "ai-toolbox",
      topic: "Architecture",
      decision: "Delete this learning",
    });

    const result = service.delete({ id: created.record.id });

    assert.equal(result.ok, true);
    assert.equal(result.deletedId, created.record.id);

    const latest = service.latest({ project: "ai-toolbox" });
    assert.equal(latest.length, 0);
  } finally {
    service.close();
  }
});
