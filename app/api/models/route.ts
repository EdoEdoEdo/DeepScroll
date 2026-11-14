import { NextResponse } from "next/server";
import { getAvailableModels } from "@/app/utils/llm";

export const dynamic = "force-dynamic";

/**
 * GET /api/models
 *
 * Returns the list of LLM models.
 * Only models with configured API keys are marked as available.
 */
export async function GET() {
  const models = getAvailableModels().map(({ id, label, provider, available }) => ({
    id,
    label,
    provider,
    available,
  }));
  return NextResponse.json({ models });
}
