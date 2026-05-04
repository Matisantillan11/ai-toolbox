import os from "os";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

const DEFAULT_DB_PATH = path.join(os.homedir(), ".ai-toolbox", "nkn.db");

export interface Decision {
  id: number;
  project: string;
  topic: string;
  decision: string;
  reasoning: string;
  stack: string;
  tokensCost: number;
  timestamp: string;
}

export interface GraphNode {
  id: string;
  type: "topic" | "decision";
  label: string;
  data: Decision;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

export function getDbPath(): string {
  return process.env.AI_TOOLBOX_NKN_DB_PATH || DEFAULT_DB_PATH;
}

function getLearnToolCliPath(): string {
  const basePath = process.env.AI_TOOLBOX_LEARN_TOOL_PATH || 
    path.join(os.homedir(), "Desktop", "Projects", "ai-toolbox", "learn-tool", "src", "cli", "nkn.js");
  return basePath;
}

export async function getAllDecisions(): Promise<Decision[]> {
  const cliPath = getLearnToolCliPath();
  const dbPath = getDbPath();

  try {
    if (!cliPath || !fs.existsSync(cliPath)) {
      console.error("CLI not found:", cliPath);
      return [];
    }
    
    const result = execSync(`node "${cliPath}" query --term " " --limit 100 2>/dev/null`, {
      encoding: "utf8",
      timeout: 10000,
      env: { 
        ...process.env, 
        AI_TOOLBOX_NKN_DB_PATH: dbPath,
        NODE_ENV: "production"
      },
    });

    const parsed = JSON.parse(result);
    const results = parsed.results || [];
    
    const decisions: Decision[] = results.map((r: any, idx: number) => ({
      id: r.id ?? idx + 1,
      project: r.project || "",
      topic: r.topic || "General",
      decision: r.decision || "",
      reasoning: r.reasoning || "",
      stack: r.stack || "",
      tokensCost: r.tokensCost || 0,
      timestamp: r.timestamp || "",
    }));
    
    return decisions;
  } catch (error) {
    console.error("getAllDecisions error:", error);
    return [];
  }
}

export async function buildKnowledgeGraph(): Promise<KnowledgeGraph> {
  const decisions = await getAllDecisions();
  
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  
  const topicNodes = new Map<string, string>();
  
  for (const decision of decisions) {
    const topicKey = decision.topic || "General";
    
    if (!topicNodes.has(topicKey)) {
      const topicId = `topic-${topicKey}`;
      topicNodes.set(topicKey, topicId);
      nodes.push({
        id: topicId,
        type: "topic",
        label: topicKey,
        data: decision,
      });
    }
    
    const topicId = topicNodes.get(topicKey)!;
    const decisionId = `decision-${decision.id}`;
    
    nodes.push({
      id: decisionId,
      type: "decision",
      label: decision.decision.substring(0, 50) + (decision.decision.length > 50 ? "..." : ""),
      data: decision,
    });
    
    links.push({
      source: decisionId,
      target: topicId,
    });
    
    for (const other of decisions) {
      if (other.id !== decision.id && other.topic === decision.topic) {
        const otherId = `decision-${other.id}`;
        const exists = links.some(
          l => (l.source === decisionId && l.target === otherId) ||
               (l.source === otherId && l.target === decisionId)
        );
        if (!exists) {
          links.push({
            source: decisionId,
            target: otherId,
          });
        }
      }
    }
  }
  
  return { nodes, links };
}