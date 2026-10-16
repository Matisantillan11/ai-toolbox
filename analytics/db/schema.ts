import { sql } from "drizzle-orm"
import { integer, sqliteTable, sqliteView, text } from "drizzle-orm/sqlite-core"

// Same list and order as analytics-tool/src/analytics/intents.js.
export const intents = [
  "new_feature",
  "quick_task",
  "implementation",
  "refactor",
  "bug_fix",
  "design_system",
  "design_component",
  "code_review",
  "create_pr",
  "knowledge_management",
  "unknown",
] as const

/** Filter value for rows the orchestrator never tagged (intent IS NULL). */
export const UNTAGGED_INTENT = "untagged"

export const usageKinds = ["turn", "agent"] as const

// Mirrors the `token_usage` table created by analytics-tool/src/analytics/db.js.
export const tokenUsage = sqliteTable("token_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull().unique(),
  kind: text("kind", { enum: usageKinds }).notNull(),
  client: text("client").notNull().default("claude-code"),
  sessionId: text("session_id").notNull(),
  promptId: text("prompt_id"),
  parentRunId: text("parent_run_id"),
  project: text("project").notNull(),
  cwd: text("cwd"),
  gitBranch: text("git_branch"),
  agentName: text("agent_name").notNull(),
  description: text("description"),
  intent: text("intent", { enum: intents }),
  model: text("model"),
  models: text("models").notNull().default("[]"),
  inputTokens: integer("input_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  apiCalls: integer("api_calls").notNull().default(0),
  toolCalls: integer("tool_calls").notNull().default(0),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  clientVersion: text("client_version"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
})

// Per-session totals; the view itself is created by the DDL in lib/analytics.ts.
export const sessionTokenUsage = sqliteView("session_token_usage", {
  sessionId: text("session_id").notNull(),
  client: text("client").notNull(),
  project: text("project").notNull(),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  turns: integer("turns").notNull(),
  agentRuns: integer("agent_runs").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull(),
  cacheCreationTokens: integer("cache_creation_tokens").notNull(),
  totalInputTokens: integer("total_input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  intents: text("intents"),
}).existing()

export type TokenUsage = typeof tokenUsage.$inferSelect
export type SessionTokenUsage = typeof sessionTokenUsage.$inferSelect
export type Intent = (typeof intents)[number]
export type UsageKind = (typeof usageKinds)[number]
