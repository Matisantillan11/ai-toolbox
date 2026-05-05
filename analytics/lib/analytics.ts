import { desc, eq, sql } from "drizzle-orm"

import { db, dbPath } from "@/db/client"
import {
  actionClassifications,
  analyticsExecutions,
  invocationTypes,
  type ActionClassification,
  type AnalyticsExecution,
  type InvocationType,
} from "@/db/schema"

export type AnalyticsSummary = {
  totalExecutions: number
  totalCalls: number
  totalTokensSpent: number
  uniqueProjects: number
  uniqueTools: number
}

export type AnalyticsFilters = {
  projects: string[]
  callerAgents: string[]
  invokedNames: string[]
  actionClassifications: ActionClassification[]
  invocationTypes: InvocationType[]
}

export type AnalyticsDashboardData = {
  dbPath: string
  executions: AnalyticsExecution[]
  summary: AnalyticsSummary
  filters: AnalyticsFilters
}

type SummaryAccumulator = {
  totalExecutions: number
  totalCalls: number
  totalTokensSpent: number
  uniqueProjects: Set<string>
  uniqueTools: Set<string>
}

let initialized = false

function ensureAnalyticsSchema() {
  if (initialized) {
    return
  }

  db.run(sql`
    CREATE TABLE IF NOT EXISTS analytics_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL UNIQUE,
      project TEXT NOT NULL,
      caller_agent TEXT NOT NULL,
      invoked_name TEXT NOT NULL,
      invocation_type TEXT NOT NULL,
      action_classification TEXT NOT NULL,
      call_count INTEGER NOT NULL DEFAULT 1,
      tokens_spent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  initialized = true
}

function getExecutions() {
  ensureAnalyticsSchema()

  return db
    .select()
    .from(analyticsExecutions)
    .orderBy(desc(analyticsExecutions.createdAt), desc(analyticsExecutions.id))
    .all()
}

function buildSummary(executions: AnalyticsExecution[]): SummaryAccumulator {
  return executions.reduce(
    (summary, execution) => {
      summary.totalExecutions += 1
      summary.totalCalls += execution.callCount
      summary.totalTokensSpent += execution.tokensSpent
      summary.uniqueProjects.add(execution.project)
      summary.uniqueTools.add(execution.invokedName)
      return summary
    },
    {
      totalExecutions: 0,
      totalCalls: 0,
      totalTokensSpent: 0,
      uniqueProjects: new Set<string>(),
      uniqueTools: new Set<string>(),
    } satisfies SummaryAccumulator
  )
}

function buildFilters(executions: AnalyticsExecution[]): AnalyticsFilters {
  return {
    projects: [...new Set(executions.map((execution) => execution.project))].sort(),
    callerAgents: [...new Set(executions.map((execution) => execution.callerAgent))].sort(),
    invokedNames: [...new Set(executions.map((execution) => execution.invokedName))].sort(),
    actionClassifications: [...actionClassifications],
    invocationTypes: [...invocationTypes],
  }
}

export function getAnalyticsDashboardData(): AnalyticsDashboardData {
  const executions = getExecutions()
  const summaryState = buildSummary(executions)

  return {
    dbPath,
    executions,
    summary: {
      totalExecutions: summaryState.totalExecutions,
      totalCalls: summaryState.totalCalls,
      totalTokensSpent: summaryState.totalTokensSpent,
      uniqueProjects: summaryState.uniqueProjects.size,
      uniqueTools: summaryState.uniqueTools.size,
    },
    filters: buildFilters(executions),
  }
}

export function getProjectExecutions(project: string) {
  ensureAnalyticsSchema()

  return db
    .select()
    .from(analyticsExecutions)
    .where(eq(analyticsExecutions.project, project))
    .orderBy(desc(analyticsExecutions.createdAt), desc(analyticsExecutions.id))
    .all()
}
