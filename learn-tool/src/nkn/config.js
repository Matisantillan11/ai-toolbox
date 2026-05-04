import os from "node:os";
import path from "node:path";

const DEFAULT_HOME_DIR = path.join(os.homedir(), ".ai-toolbox");

/**
 * Returns the base directory used to store the NKN SQLite database and related local state.
 *
 * @returns {string} Absolute path to the NKN home directory.
 */
export function getNknHomeDir() {
  return process.env.AI_TOOLBOX_HOME_DIR || DEFAULT_HOME_DIR;
}

/**
 * Resolves the SQLite database path for the NKN store.
 *
 * @returns {string} Absolute path to the SQLite database file.
 */
export function getNknDbPath() {
  return process.env.AI_TOOLBOX_NKN_DB_PATH || path.join(getNknHomeDir(), "nkn.db");
}

/**
 * Derives the default project name used when a caller does not provide one explicitly.
 *
 * @returns {string} Project name for NKN records.
 */
export function getDefaultProjectName() {
  return process.env.AI_TOOLBOX_PROJECT || path.basename(process.cwd());
}
