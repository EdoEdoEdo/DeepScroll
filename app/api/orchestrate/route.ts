import { NextRequest, NextResponse } from "next/server";
import { normalizeQuery, planArc, MAX_QUERY_LENGTH } from "@/app/utils/documentary";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/orchestrate — diagnostic endpoint used by /dev.
 *
 * Runs only the LLM call (5-act arc). The full documentary is built by
 * POST /api/documentary.
 *
 * Body: { query: string, model?: string }
 * Returns: ArcPlan
 */
export async function POST(request: NextRequest) {
  let body: { query?: unknown; model?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = normalizeQuery(body.query);
  if (!query) {
    return NextResponse.json(
      { error: `Query must be between 2 and ${MAX_QUERY_LENGTH} characters` },
      { status: 400 }
    );
  }
  const model = typeof body.model === "string" && body.model ? body.model : undefined;

  try {
    const plan = await planArc(query, model);
    return NextResponse.json(plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Orchestrate]", message);
    return NextResponse.json({ error: "Orchestration failed", detail: message }, { status: 502 });
  }
}
