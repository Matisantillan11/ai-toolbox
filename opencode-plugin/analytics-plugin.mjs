import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

import {
  buildUsageRecords,
  createUsageTracker,
  forgetSession,
  registerMessage,
  registerPart,
  registerSession,
} from "./analytics-core.mjs"

const AI_TOOLBOX_REPO_ROOT = "__AI_TOOLBOX_REPO_ROOT__"
const ANALYTICS_SERVICE_URL = pathToFileURL(
  path.join(AI_TOOLBOX_REPO_ROOT, "analytics-tool/src/analytics/service.js"),
)
const ANALYTICS_INTENTS_URL = pathToFileURL(
  path.join(AI_TOOLBOX_REPO_ROOT, "analytics-tool/src/analytics/intents.js"),
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
  const { findIntentMarker } = await import(ANALYTICS_INTENTS_URL.href)
  const analytics = createAnalyticsTraceService()
  const projectName = await resolveProjectName(project, worktree)
  const tracker = createUsageTracker()

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
      const properties = event.properties ?? {}

      if (event.type === "session.created" || event.type === "session.updated") {
        registerSession(tracker, properties.info)
        return
      }

      if (event.type === "session.deleted") {
        forgetSession(tracker, properties.info?.id ?? properties.sessionID)
        return
      }

      if (event.type === "message.updated") {
        registerMessage(tracker, properties.info)
        return
      }

      if (event.type === "message.part.updated") {
        registerPart(tracker, properties.part, findIntentMarker)
        return
      }

      if (event.type !== "session.idle") {
        return
      }

      const sessionID = properties.sessionID
      const { sessionId, records } = buildUsageRecords(tracker, sessionID, {
        project: projectName,
        cwd: worktree ?? null,
      })
      if (records.length === 0) {
        return
      }

      const result = analytics.recordUsage(sessionId, records)
      if (!result.ok) {
        await logFailure("Failed to persist analytics token usage", {
          sessionID,
          rootSessionID: sessionId,
          runIds: records.map((record) => record.runId),
          error: result.error,
        })
      }
    },
  }
}

export default AiToolboxAnalyticsPlugin
