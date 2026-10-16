/**
 * Intents the orchestrator-agent classifies a request into (orchestrator step 2).
 *
 * Token usage is tagged with one of these only when the orchestrator says so by
 * emitting an intent marker line. Nothing ever infers an intent from agent or
 * skill names: an untagged row stays NULL.
 */
export const INTENTS = Object.freeze([
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
]);

const INTENT_SET = new Set(INTENTS);

// A whole line, so prose that merely mentions the format does not count.
const MARKER_PATTERN = /^[ \t]*\[ai-toolbox\] intent=([a-z_]+)[ \t]*$/gm;

/**
 * Returns whether a value is a known orchestrator intent.
 *
 * @param {unknown} value Candidate intent.
 * @returns {boolean} True when the value is one of {@link INTENTS}.
 */
export function isIntent(value) {
  return typeof value === "string" && INTENT_SET.has(value);
}

/**
 * Formats the marker line the orchestrator emits to tag a turn with its intent.
 *
 * @param {string} intent Orchestrator intent.
 * @returns {string} Marker line, e.g. `[ai-toolbox] intent=bug_fix`.
 */
export function formatIntentMarker(intent) {
  return `[ai-toolbox] intent=${intent}`;
}

/**
 * Finds the last valid intent marker in a block of text.
 *
 * The last one wins so a re-classification later in the same turn replaces
 * the first guess.
 *
 * @param {string} text Text to scan.
 * @returns {string | null} Intent, or null when no valid marker is present.
 */
export function findIntentMarker(text) {
  if (typeof text !== "string" || !text.includes("[ai-toolbox]")) {
    return null;
  }

  let found = null;
  for (const match of text.matchAll(MARKER_PATTERN)) {
    if (isIntent(match[1])) {
      found = match[1];
    }
  }
  return found;
}
