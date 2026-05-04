import os from "os";
import path from "path";
import fs from "fs";
import { NextResponse } from "next/server";

const DEFAULT_DB_PATH = path.join(os.homedir(), ".ai-toolbox", "nkn.db");

export const dynamic = "force-dynamic";

export async function GET() {
  const cliPath = path.join(os.homedir(), "Desktop", "Projects", "ai-toolbox", "learn-tool", "src", "cli", "nkn.js");
  const dbPath = process.env.AI_TOOLBOX_NKN_DB_PATH || DEFAULT_DB_PATH;

  const debug: any = {
    cliPath,
    cliExists: fs.existsSync(cliPath),
    dbPath,
    dbExists: fs.existsSync(dbPath),
    homeDir: os.homedir(),
  };

  try {
    const result = fs.existsSync(cliPath) 
      ? require("child_process").execSync(`node "${cliPath}" query --term " " --limit 100 2>&1`, {
          encoding: "utf8",
          timeout: 10000,
          env: { ...process.env, AI_TOOLBOX_NKN_DB_PATH: dbPath },
        })
      : "CLI not found";
    
    debug.cliOutput = result.substring(0, 500);
    debug.cliOutputLength = result.length;
  } catch (error: any) {
    debug.error = error.message;
  }

  return NextResponse.json(debug);
}