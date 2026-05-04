import { NextResponse } from "next/server";
import { buildKnowledgeGraph } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const graph = await buildKnowledgeGraph();
  return NextResponse.json(graph);
}