const REDACTED = "[redacted]";

/**
 * Removes sensitive values from log metadata before it is written to stderr.
 *
 * @param {Record<string, unknown>} [meta={}] Raw log metadata.
 * @returns {Record<string, unknown>} Sanitized metadata safe to log.
 */
function sanitizeMeta(meta = {}) {
  const sanitized = {};

  for (const [key, value] of Object.entries(meta)) {
    if (["trace", "need", "details", "term", "content", "payload"].includes(key)) {
      sanitized[key] = REDACTED;
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Emits a structured log line unless logging is silenced for the current process.
 *
 * @param {"info" | "error"} level Log severity.
 * @param {string} event Event name.
 * @param {Record<string, unknown>} [meta={}] Additional non-sensitive metadata.
 * @returns {void}
 */
export function logEvent(level, event, meta = {}) {
  if (process.env.AI_TOOLBOX_ANALYTICS_SILENT === "1") {
    return;
  }

  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitizeMeta(meta),
  };

  process.stderr.write(`${JSON.stringify(entry)}\n`);
}

/**
 * Writes an informational analytics log event.
 *
 * @param {string} event Event name.
 * @param {Record<string, unknown>} [meta] Additional log metadata.
 * @returns {void}
 */
export function logInfo(event, meta) {
  logEvent("info", event, meta);
}

/**
 * Writes an error analytics log event.
 *
 * @param {string} event Event name.
 * @param {Record<string, unknown>} [meta] Additional log metadata.
 * @returns {void}
 */
export function logError(event, meta) {
  logEvent("error", event, meta);
}
