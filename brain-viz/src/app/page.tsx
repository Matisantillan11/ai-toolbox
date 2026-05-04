"use client";

import { useEffect, useMemo, useState } from "react";
import { hierarchy, pack } from "d3";

interface KnowledgeNode {
  id: string;
  name: string;
  type: "root" | "topic" | "stack" | "project" | "decision";
  count: number;
  timestamp?: string;
  decision?: string;
  reasoning?: string;
  tokensCost?: number;
  project?: string;
  _children?: KnowledgeNode[];
}

interface PackedNode {
  x: number;
  y: number;
  r: number;
  depth: number;
  index: number;
  data: KnowledgeNode;
}

const TYPE_STYLES: Record<KnowledgeNode["type"], { dot: string; label: string; palette: string[] }> = {
  root: { dot: "#f97316", label: "Brain", palette: ["#fb923c", "#f97316", "#ea580c", "#fdba74"] },
  topic: { dot: "#3b82f6", label: "Topic", palette: ["#60a5fa", "#3b82f6", "#2563eb", "#93c5fd"] },
  stack: { dot: "#10b981", label: "Stack", palette: ["#34d399", "#10b981", "#059669", "#6ee7b7"] },
  project: { dot: "#8b5cf6", label: "Project", palette: ["#a78bfa", "#8b5cf6", "#7c3aed", "#c4b5fd"] },
  decision: { dot: "#ec4899", label: "Decision", palette: ["#f472b6", "#ec4899", "#db2777", "#f9a8d4"] },
};

function buildHierarchy(decisions: any[]): KnowledgeNode {
  const topicMap = new Map<string, KnowledgeNode>();
  const stackMap = new Map<string, KnowledgeNode>();
  const projectMap = new Map<string, KnowledgeNode>();

  const root: KnowledgeNode = {
    id: "root",
    name: "My Brain",
    type: "root",
    count: decisions.length,
    _children: [],
  };

  for (const decision of decisions) {
    const topic = decision.topic || "General";
    const stack = decision.stack || "Unknown";
    const project = decision.project || "Unknown";

    if (!topicMap.has(topic)) {
      const topicNode: KnowledgeNode = {
        id: `topic-${topic}`,
        name: topic,
        type: "topic",
        count: 0,
        _children: [],
      };
      topicMap.set(topic, topicNode);
      root._children!.push(topicNode);
    }

    const topicNode = topicMap.get(topic)!;
    const stackKey = `${topic}|${stack}`;

    if (!stackMap.has(stackKey)) {
      const stackNode: KnowledgeNode = {
        id: `stack-${stackKey}`,
        name: stack,
        type: "stack",
        count: 0,
        _children: [],
      };
      stackMap.set(stackKey, stackNode);
      topicNode._children!.push(stackNode);
    }

    const stackNode = stackMap.get(stackKey)!;
    const projectKey = `${stackKey}|${project}`;

    if (!projectMap.has(projectKey)) {
      const projectNode: KnowledgeNode = {
        id: `project-${projectKey}`,
        name: project,
        type: "project",
        count: 0,
        _children: [],
      };
      projectMap.set(projectKey, projectNode);
      stackNode._children!.push(projectNode);
    }

    const projectNode = projectMap.get(projectKey)!;

    projectNode._children!.push({
      id: `decision-${decision.id}`,
      name: decision.decision?.substring(0, 48) || "Decision",
      type: "decision",
      count: 1,
      timestamp: decision.timestamp,
      decision: decision.decision,
      reasoning: decision.reasoning,
      tokensCost: decision.tokensCost,
      project: decision.project,
    });

    projectNode.count += 1;
    stackNode.count += 1;
    topicNode.count += 1;
  }

  return root;
}

function truncateLabel(label: string, radius: number) {
  const maxChars = Math.max(6, Math.floor(radius / 4.5));
  return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
}

function getPackedNodes(rootNode: KnowledgeNode, width: number, height: number): PackedNode[] {
  const margin = 56;
  const bubbleRoot: KnowledgeNode = {
    id: `${rootNode.id}-visible`,
    name: rootNode.name,
    type: rootNode.type,
    count: rootNode.count,
    _children: rootNode._children || [],
  };

  const layout = pack<KnowledgeNode>()
    .size([Math.max(width - margin * 2, 240), Math.max(height - margin * 2, 240)])
    .padding(18);

  const root = hierarchy(bubbleRoot, (node) => node._children)
    .sum((node) => Math.max(node.count, 1))
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  const packedRoot = layout(root);

  return packedRoot.descendants().map((node, index) => ({
    x: node.x + margin,
    y: node.y + margin,
    r: node.r,
    depth: node.depth,
    index,
    data: node.data,
  }));
}

export default function BrainViz() {
  const [data, setData] = useState<KnowledgeNode | null>(null);
  const [currentRoot, setCurrentRoot] = useState<KnowledgeNode | null>(null);
  const [path, setPath] = useState<KnowledgeNode[]>([]);
  const [focusedNode, setFocusedNode] = useState<KnowledgeNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1280, height: 800 });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/knowledge-graph", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        const graph = await res.json();
        const decisions = graph.nodes
          .filter((node: any) => node.type === "decision")
          .map((node: any) => node.data);
        const nextData = buildHierarchy(decisions);
        setData(nextData);
        setCurrentRoot(nextData);
      } catch (error) {
        console.error("Failed to load knowledge graph", error);
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    function updateSize() {
      setDimensions({
        width: window.innerWidth || 1280,
        height: window.innerHeight || 800,
      });
    }

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const nodes = useMemo(() => {
    if (!currentRoot || !currentRoot._children?.length) {
      return [];
    }
    return getPackedNodes(currentRoot, dimensions.width, dimensions.height).filter((node) => node.depth === 1);
  }, [currentRoot, dimensions]);

  function handleBubbleClick(node: KnowledgeNode) {
    if (node.type === "decision") {
      setFocusedNode(node);
      return;
    }

    if (!node._children?.length) {
      return;
    }

    if (currentRoot) {
      setPath((prev) => [...prev, currentRoot]);
    }
    setCurrentRoot(node);
  }

  function handleBack() {
    if (!path.length) {
      return;
    }

    const nextPath = [...path];
    const previousRoot = nextPath.pop() || data;
    setPath(nextPath);
    setCurrentRoot(previousRoot || null);
  }

  function getBubbleFill(node: PackedNode) {
    const palette = TYPE_STYLES[node.data.type].palette;
    return palette[node.index % palette.length];
  }

  function getBubbleText(node: PackedNode) {
    if (node.data.type === "decision") {
      return truncateLabel(node.data.name, node.r);
    }

    return node.data.name;
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#f5f7fb] text-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.10),transparent_24%)]" />
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="bubble-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="12" stdDeviation="18" floodColor="rgba(15,23,42,0.16)" />
          </filter>
        </defs>

        {nodes.map((node) => {
          const showCount = node.r > 48;
          const fontSize = Math.max(11, Math.min(26, node.r / 4.3));
          const canDrill = Boolean(node.data._children?.length) && node.data.type !== "decision";

          return (
            <g key={node.data.id} transform={`translate(${node.x}, ${node.y})`}>
              <circle
                r={node.r}
                fill={getBubbleFill(node)}
                stroke="rgba(255,255,255,0.95)"
                strokeWidth="3"
                filter="url(#bubble-shadow)"
                style={{ cursor: "pointer", transition: "all 220ms ease" }}
                onClick={() => handleBubbleClick(node.data)}
              />
              <circle r={node.r * 0.78} fill="rgba(255,255,255,0.08)" pointerEvents="none" />
              <text
                textAnchor="middle"
                fill="#ffffff"
                fontSize={fontSize}
                fontWeight={700}
                pointerEvents="none"
                dy={showCount ? -6 : 4}
              >
                {truncateLabel(getBubbleText(node), node.r)}
              </text>
              {showCount ? (
                <text
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.9)"
                  fontSize={Math.max(10, fontSize * 0.72)}
                  pointerEvents="none"
                  dy={fontSize + 10}
                >
                  {node.data.count} {node.data.count === 1 ? "item" : "items"}
                </text>
              ) : null}
              {canDrill && node.r > 60 ? (
                <text
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.78)"
                  fontSize={Math.max(10, fontSize * 0.58)}
                  pointerEvents="none"
                  dy={node.r - 14}
                >
                  Click to dive
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/70 to-transparent" />

      <div className="absolute left-6 top-6 z-10 max-w-md rounded-3xl border border-slate-200/80 bg-white/78 px-5 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-md">
        <p className="text-xs uppercase tracking-[0.24em] text-sky-600">Knowledge Atlas</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-900">My Brain</h1>
        <p className="mt-2 text-sm text-slate-600">
          A Tableau-style bubble chart. Each bubble is a group you can click to keep drilling deeper into the knowledge structure.
        </p>
        <p className="mt-3 text-sm text-slate-500">{data?.count || 0} knowledge entries loaded</p>
        {currentRoot ? (
          <p className="mt-2 text-sm font-medium text-slate-700">
            Current level: <span className="text-slate-950">{currentRoot.name}</span>
          </p>
        ) : null}
      </div>

      {path.length > 0 ? (
        <button
          onClick={handleBack}
          className="absolute right-6 top-6 z-10 rounded-full border border-slate-200 bg-white/82 px-4 py-2 text-sm font-medium text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-md transition hover:bg-white"
        >
          Back
        </button>
      ) : null}

      <div className="absolute bottom-6 left-6 z-10 flex flex-wrap gap-3 rounded-3xl border border-slate-200/80 bg-white/78 px-4 py-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-md">
        {Object.entries(TYPE_STYLES).map(([type, style]) => (
          <div key={type} className="flex items-center gap-2 text-sm text-slate-700">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: style.dot }} />
            <span>{style.label}</span>
          </div>
        ))}
      </div>

      {focusedNode ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/72 p-4" onClick={() => setFocusedNode(null)}>
          <div
            className="w-full max-w-2xl rounded-3xl border border-white/10 bg-zinc-950/95 p-6 text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-pink-300">Decision</p>
                <h2 className="mt-2 text-2xl font-semibold leading-tight">{focusedNode.decision || focusedNode.name}</h2>
              </div>
              <button className="text-2xl text-zinc-400 transition hover:text-white" onClick={() => setFocusedNode(null)}>
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Project</p>
                <p className="mt-2 text-base text-white">{focusedNode.project || "Unknown"}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Created</p>
                <p className="mt-2 text-base text-white">
                  {focusedNode.timestamp ? new Date(focusedNode.timestamp).toLocaleString() : "Unknown"}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/8 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Reasoning</p>
              <p className="mt-2 whitespace-pre-wrap text-zinc-200">{focusedNode.reasoning || "No reasoning recorded."}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
