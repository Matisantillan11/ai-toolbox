import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"

import * as schema from "@/db/schema"

const defaultDbPath = path.join(os.homedir(), ".ai-toolbox", "analytics.db")

declare global {
  var analyticsDbSingleton:
    | { db: ReturnType<typeof drizzle>; sqlite: Database.Database; path: string }
    | undefined
}

function resolveDbPath() {
  return process.env.AI_TOOLBOX_ANALYTICS_DB_PATH || defaultDbPath
}

function createDb() {
  const dbPath = resolveDbPath()

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const sqlite = new Database(dbPath)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")

  const db = drizzle(sqlite, { schema })

  return { db, sqlite, path: dbPath }
}

const database = globalThis.analyticsDbSingleton ?? createDb()

if (!globalThis.analyticsDbSingleton) {
  globalThis.analyticsDbSingleton = database
}

export const db = database.db
export const sqlite = database.sqlite
export const dbPath = database.path
