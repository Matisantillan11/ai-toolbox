#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createNknService } from "../nkn/service.js";
import { createAnalyticsTraceService } from "../../../analytics-tool/src/analytics/service.js";

const nknService = createNknService();
const analyticsService = createAnalyticsTraceService();

const server = new McpServer({
  name: "ai-toolbox",
  version: "1.0.0",
});

/**
 * Formats a tool result payload as MCP text content.
 *
 * @param {unknown} result Result payload returned by a backing service.
 * @returns {{content: Array<{type: string, text: string}>}} MCP-compatible text response.
 */
function toTextResult(result) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Handles the MCP `nkn_recall` tool by querying the NKN service.
 *
 * @param {{term: string, project?: string, limit?: number}} input Recall input.
 * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP tool response.
 */
async function handleNknRecall(input) {
  const result = nknService.recall(input);
  return toTextResult(result);
}

/**
 * Handles the MCP `nkn_learn` tool by persisting a confirmed learning.
 *
 * @param {{project?: string, topic?: string, decision: string, reasoning?: string, stack?: string, tokensCost?: number, confirmedByUser?: boolean}} input Learn input.
 * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP tool response.
 */
async function handleNknLearn(input) {
  const result = nknService.learn(input);
  return toTextResult(result);
}

/**
 * Handles the MCP `nkn_update` tool by mutating an existing learning.
 *
 * @param {{id: number, project?: string, topic?: string, decision?: string, reasoning?: string, stack?: string, tokensCost?: number}} input Update input.
 * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP tool response.
 */
async function handleNknUpdate(input) {
  const result = nknService.update(input);
  return toTextResult(result);
}

/**
 * Handles the MCP `nkn_delete` tool by removing an existing learning.
 *
 * @param {{id: number}} input Delete input.
 * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP tool response.
 */
async function handleNknDelete(input) {
  const result = nknService.delete(input);
  return toTextResult(result);
}

/**
 * Handles the MCP `analytics_trace` tool by persisting analytics information.
 *
 * @param {{project?: string, area?: string, trace: string, details?: string, status?: string, priority?: string, confirmedByUser?: boolean}} input Trace input.
 * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP tool response.
 */
async function handleAnalyticsTrace(input) {
  const result = analyticsService.trace(input);
  return toTextResult(result);
}

/**
 * Closes the SQLite connection and exits the process.
 *
 * @param {number} code Process exit code.
 * @returns {void}
 */
function shutdown(code) {
  nknService.close();
  analyticsService.close();
  process.exit(code);
}

server.tool(
  "nkn_recall",
  {
    term: z.string().min(1),
    project: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(25).optional(),
  },
  handleNknRecall
);

server.tool(
  "nkn_learn",
  {
    project: z.string().min(1).optional(),
    topic: z.string().min(1).optional(),
    decision: z.string().min(1),
    reasoning: z.string().optional(),
    stack: z.string().optional(),
    tokensCost: z.number().int().min(0).optional(),
    confirmedByUser: z.boolean().optional(),
  },
  handleNknLearn
);

server.tool(
  "nkn_update",
  {
    id: z.number().int().min(1),
    project: z.string().min(1).optional(),
    topic: z.string().min(1).optional(),
    decision: z.string().min(1).optional(),
    reasoning: z.string().optional(),
    stack: z.string().optional(),
    tokensCost: z.number().int().min(0).optional(),
  },
  handleNknUpdate
);

server.tool(
  "nkn_delete",
  {
    id: z.number().int().min(1),
  },
  handleNknDelete
);

server.tool(
  "analytics_trace",
  {
    project: z.string().min(1).optional(),
    area: z.string().min(1).optional(),
    trace: z.string().min(1),
    details: z.string().optional(),
    status: z.string().min(1).optional(),
    priority: z.string().min(1).optional(),
    confirmedByUser: z.boolean().optional(),
  },
  handleAnalyticsTrace
);

/**
 * Connects the NKN MCP server to stdio transport.
 *
 * @returns {Promise<void>} Connection lifecycle promise.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Unknown MCP error"}\n`);
  shutdown(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}
