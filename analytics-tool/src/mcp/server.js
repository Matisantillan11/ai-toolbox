#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createAnalyticsTraceService } from "../analytics/service.js";

const service = createAnalyticsTraceService();

const server = new McpServer({
  name: "ai-toolbox-analytics",
  version: "1.0.0",
});

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

async function handleTrace(input) {
  const result = service.trace(input);
  return toTextResult(result);
}

function shutdown(code) {
  service.close();
  process.exit(code);
}

server.tool(
  "trace",
  {
    project: z.string().min(1).optional(),
    area: z.string().min(1).optional(),
    trace: z.string().min(1).optional(),
    details: z.string().optional(),
    status: z.string().min(1).optional(),
    priority: z.string().min(1).optional(),
    confirmedByUser: z.boolean().optional(),
    runId: z.string().min(1).optional(),
    callerAgent: z.string().min(1).optional(),
    invokedName: z.string().min(1).optional(),
    invocationType: z.string().min(1).optional(),
    actionClassification: z.string().min(1).optional(),
    callCount: z.number().int().min(0).optional(),
    tokensSpent: z.number().int().min(0).optional(),
  },
  handleTrace
);

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
