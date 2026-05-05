import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

import {
  buildExecutionRecords,
  createSessionState,
  registerAssistantMessage,
  registerSkillCall,
} from "./analytics-core.mjs"

const AI_TOOLBOX_REPO_ROOT = "__AI_TOOLBOX_REPO_ROOT__"
const ANALYTICS_SERVICE_URL = pathToFileURL(
  path.join(AI_TOOLBOX_REPO_ROOT, "analytics-tool/src/analytics/service.js"),
)

async function resolveProjectName(project, worktree) {
  if (project.name) {
    return project.name
  }

  try {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(worktree, "package.json"), "utf-8"),
    )
    if (typeof packageJson.name === "string" && packageJson.name.trim()) {
      return packageJson.name.trim()
    }
  } catch {
    // Fall back to the worktree directory name when package.json is absent.
  }

  return path.basename(worktree)
}

export const AiToolboxAnalyticsPlugin = async ({ client, project, worktree }) => {
  const { createAnalyticsTraceService } = await import(ANALYTICS_SERVICE_URL.href)
  const analytics = createAnalyticsTraceService()
  const projectName = await resolveProjectName(project, worktree)
  const sessions = new Map()

  function ensureSession(sessionID) {
    const existing = sessions.get(sessionID)
    if (existing) {
      return existing
    }

    const created = createSessionState()
    sessions.set(sessionID, created)
    return created
  }

  async function logFailure(message, extra) {
    await client.app.log({
      body: {
        service: "ai-toolbox-analytics-plugin",
        level: "warn",
        message,
        extra,
      },
    })
  }

  return {
    event: async ({ event }) => {
      if (event.type === "session.created" || event.type === "session.updated") {
        ensureSession(event.properties.sessionID).parentID = event.properties.info.parentID ?? null
        return
      }

      if (event.type === "message.part.updated") {
        registerSkillCall(ensureSession(event.properties.sessionID), event.properties.part)
        return
      }

      if (event.type === "message.updated") {
        registerAssistantMessage(ensureSession(event.properties.sessionID), event.properties.info)
        return
      }

      if (event.type !== "session.idle") {
        return
      }

      const session = sessions.get(event.properties.sessionID)
      if (!session) {
        return
      }

      const records = buildExecutionRecords(event.properties.sessionID, session)
      for (const record of records) {
        const result = analytics.trace({
          project: projectName,
          trace: record.trace,
          runId: record.runId,
          callerAgent: record.callerAgent,
          invokedName: record.invokedName,
          invocationType: record.invocationType,
          actionClassification: record.actionClassification,
          callCount: record.callCount,
          tokensSpent: record.tokensSpent,
          confirmedByUser: false,
        })

        if (!result.ok) {
          await logFailure("Failed to persist analytics execution", {
            sessionID: event.properties.sessionID,
            record,
            error: result.error,
          })
        }
      }

      sessions.set(event.properties.sessionID, createSessionState(session.parentID))
    },
  }
}

export default AiToolboxAnalyticsPlugin
