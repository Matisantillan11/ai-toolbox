import os from "node:os";
import path from "node:path";

const DEFAULT_HOME_DIR = path.join(os.homedir(), ".ai-toolbox");

/**
 * Returns the base directory used to store analytics local state.
 *
 * @returns {string} Absolute path to the analytics home directory.
 */
export function getAnalyticsHomeDir() {
  return process.env.AI_TOOLBOX_ANALYTICS_HOME_DIR || process.env.AI_TOOLBOX_HOME_DIR || DEFAULT_HOME_DIR;
}

/**
 * Resolves the SQLite database path for analytics traces.
 *
 * @returns {string} Absolute path to the analytics SQLite database file.
 */
export function getAnalyticsDbPath() {
  return process.env.AI_TOOLBOX_ANALYTICS_DB_PATH || path.join(getAnalyticsHomeDir(), "analytics.db");
}

/**
 * Derives the default project name used when a caller does not provide one explicitly.
 *
 * @returns {string} Project name for analytics records.
 */
export function getDefaultProjectName() {
  return process.env.AI_TOOLBOX_PROJECT || path.basename(process.cwd());
}
