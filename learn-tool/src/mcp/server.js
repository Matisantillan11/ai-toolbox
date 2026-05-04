#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createNknService } from "../nkn/service.js";

const service = createNknService();

const server = new McpServer({
  name: "ai-toolbox-nkn",
  version: "1.0.0",
});

/**
 * Formats a learn-tool result payload as MCP text content.
 *
 * @param {unknown} result Result payload returned by the NKN service.
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
 * Handles the MCP `recall` tool by querying the shared NKN service.
 *
 * @param {{term: string, project?: string, limit?: number}} input Recall input.
 * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP tool response.
 */
async function handleRecall(input) {
  const result = service.recall(input);
  return toTextResult(result);
}

/**
 * Handles the MCP `learn` tool by persisting a confirmed learning.
 *
 * @param {{project?: string, topic?: string, decision: string, reasoning?: string, stack?: string, tokensCost?: number, confirmedByUser?: boolean}} input Learn input.
 * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP tool response.
 */
async function handleLearn(input) {
  const result = service.learn(input);
  return toTextResult(result);
}

/**
 * Handles the MCP `update` tool by mutating an existing learning.
 *
 * @param {{id: number, project?: string, topic?: string, decision?: string, reasoning?: string, stack?: string, tokensCost?: number}} input Update input.
 * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP tool response.
 */
async function handleUpdate(input) {
  const result = service.update(input);
  return toTextResult(result);
}

/**
 * Handles the MCP `delete` tool by removing an existing learning.
 *
 * @param {{id: number}} input Delete input.
 * @returns {Promise<{content: Array<{type: string, text: string}>}>} MCP tool response.
 */
async function handleDelete(input) {
  const result = service.delete(input);
  return toTextResult(result);
}

/**
 * Closes the SQLite connection and exits the process.
 *
 * @param {number} code Process exit code.
 * @returns {void}
 */
function shutdown(code) {
  service.close();
  process.exit(code);
}

server.tool(
  "recall",
  {
    term: z.string().min(1),
    project: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(25).optional(),
  },
  handleRecall
);

server.tool(
  "learn",
  {
    project: z.string().min(1).optional(),
    topic: z.string().min(1).optional(),
    decision: z.string().min(1),
    reasoning: z.string().optional(),
    stack: z.string().optional(),
    tokensCost: z.number().int().min(0).optional(),
    confirmedByUser: z.boolean().optional(),
  },
  handleLearn
);

server.tool(
  "update",
  {
    id: z.number().int().min(1),
    project: z.string().min(1).optional(),
    topic: z.string().min(1).optional(),
    decision: z.string().min(1).optional(),
    reasoning: z.string().optional(),
    stack: z.string().optional(),
    tokensCost: z.number().int().min(0).optional(),
  },
  handleUpdate
);

server.tool(
  "delete",
  {
    id: z.number().int().min(1),
  },
  handleDelete
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
