#!/usr/bin/env node

import { createAnalyticsTraceService } from "../analytics/service.js";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const part = rest[index];
    if (!part.startsWith("--")) {
      continue;
    }

    const key = part.slice(2);
    const next = rest[index + 1];

    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { command, options };
}

const { command, options } = parseArgs(process.argv.slice(2));
const service = createAnalyticsTraceService();

try {
  if (command === "init") {
    console.log(JSON.stringify(service.init()));
    process.exit(0);
  }

  if (command === "trace") {
    const result = service.trace({
      project: options.project,
      area: options.area,
      trace: options.trace,
      details: options.details,
      status: options.status,
      priority: options.priority,
      confirmedByUser: options.confirmed ? options.confirmed === "true" : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  console.error("Usage: ai-toolbox-analytics-needs <init|trace> [options]");
  process.exit(1);
} finally {
  service.close();
}
