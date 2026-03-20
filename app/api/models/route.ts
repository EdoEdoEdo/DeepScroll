import { NextResponse } from "next/server";
import { getAvailableModels } from "@/app/utils/models";

/**
 * GET /api/models
 *
 * Returns list of available LLM models.
 * Only models with configured API keys are marked as available.
 */
export async function GET() {
  const models = getAvailableModels();
  return NextResponse.json({ models });
}
