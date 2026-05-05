import { defineConfig } from "drizzle-kit"
import os from "node:os"
import path from "node:path"

const defaultDbPath = path.join(os.homedir(), ".ai-toolbox", "analytics.db")

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.AI_TOOLBOX_ANALYTICS_DB_PATH || defaultDbPath,
  },
})
