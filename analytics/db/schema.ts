import { sql } from "drizzle-orm"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const actionClassifications = [
  "feature",
  "planning",
  "bug",
  "qa",
  "design",
  "refactor",
  "research",
] as const

export const invocationTypes = ["agent", "skill"] as const

export const analyticsExecutions = sqliteTable("analytics_executions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull().unique(),
  project: text("project").notNull(),
  callerAgent: text("caller_agent").notNull(),
  invokedName: text("invoked_name").notNull(),
  invocationType: text("invocation_type", { enum: invocationTypes }).notNull(),
  actionClassification: text("action_classification", {
    enum: actionClassifications,
  }).notNull(),
  callCount: integer("call_count").notNull().default(1),
  tokensSpent: integer("tokens_spent").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
})

export type AnalyticsExecution = typeof analyticsExecutions.$inferSelect
export type ActionClassification = (typeof actionClassifications)[number]
export type InvocationType = (typeof invocationTypes)[number]
