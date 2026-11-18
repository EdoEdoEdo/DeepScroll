import { NextRequest, NextResponse } from "next/server";
import {
  buildDocumentary,
  normalizeQuery,
  PipelineError,
  MAX_QUERY_LENGTH,
} from "@/app/utils/documentary";
import { clientIp, rateLimit } from "@/app/utils/rate-limit";
import type { PipelineEvent } from "@/app/utils/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/documentary
 *
 * Body: { query: string, model?: string }
 * Returns: NDJSON stream of PipelineEvent — log / progress / chapter
 * events while the documentary is built, then one "result" (or "error").
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

  const retryAfter = rateLimit(clientIp(request.headers));
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: `Too many documentaries — try again in ${Math.ceil(retryAfter / 60)} min` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PipelineEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Client went away — keep building so the result lands in cache
        }
      };

      try {
        const data = await buildDocumentary(query, model, send);
        send({ type: "result", data });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Pipeline failed";
        const detail = err instanceof PipelineError ? err.detail : undefined;
        console.error("[Documentary]", message, detail ?? "");
        send({ type: "error", message, detail });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
