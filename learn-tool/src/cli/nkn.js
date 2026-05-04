#!/usr/bin/env node

import { createNknService } from "../nkn/service.js";

/**
 * Parses a simple `--key value` argument list for the local NKN CLI.
 *
 * @param {string[]} argv Raw CLI arguments excluding `node` and script name.
 * @returns {{command: string | undefined, options: Record<string, string | boolean>}} Parsed command and options.
 */
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
const service = createNknService();

try {
  if (command === "init") {
    console.log(JSON.stringify(service.init()));
    process.exit(0);
  }

  if (command === "query") {
    const result = service.recall({
      term: options.term,
      project: options.project,
      limit: options.limit ? Number(options.limit) : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "log") {
    const result = service.learn({
      project: options.project,
      topic: options.topic,
      decision: options.decision,
      reasoning: options.reasoning,
      stack: options.stack,
      tokensCost: options["tokens-cost"] ? Number(options["tokens-cost"]) : undefined,
      confirmedByUser: options.confirmed ? options.confirmed === "true" : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "update") {
    const result = service.update({
      id: options.id ? Number(options.id) : undefined,
      project: options.project,
      topic: options.topic,
      decision: options.decision,
      reasoning: options.reasoning,
      stack: options.stack,
      tokensCost: options["tokens-cost"] ? Number(options["tokens-cost"]) : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "delete") {
    const result = service.delete({
      id: options.id ? Number(options.id) : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  console.error("Usage: ai-toolbox-nkn <init|query|log|update|delete> [options]");
  process.exit(1);
} finally {
  service.close();
}
