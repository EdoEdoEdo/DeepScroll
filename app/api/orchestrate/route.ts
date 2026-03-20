import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { ORCHESTRATE_SYSTEM_PROMPT, FALLBACK_INTERLUDES } from "@/app/utils/arc";
import { getModel, MODEL_OPTIONS } from "@/app/utils/models";
import type { ArcPlan, ArcTag } from "@/app/utils/types";

const ARC_TAGS_VALID: ArcTag[] = [
  "Prelude",
  "Signal",
  "Crisis",
  "Response",
  "Aftermath",
];

/**
 * POST /api/orchestrate
 *
 * Takes a historical query + optional model ID,
 * returns a 5-chapter arc plan with dynamic interludes.
 *
 * Body: { query: string, model?: string }
 * Returns: ArcPlan
 */
export async function POST(request: NextRequest) {
  let body: { query?: string; model?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json(
      { error: "Missing required field: query" },
      { status: 400 }
    );
  }

  // Default to first available model
  const modelId = body.model || MODEL_OPTIONS[0].id;

  let model;
  try {
    model = getModel(modelId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Model not available" },
      { status: 500 }
    );
  }

  try {
    const { text } = await generateText({
      model,
      system: ORCHESTRATE_SYSTEM_PROMPT,
      prompt: `Generate a 5-chapter narrative arc for the following historical query:\n\n"${query}"\n\nRespond with a JSON object containing:\n- "subtitle": string (English, poetic)\n- "interludes": array of 2 short punchy statements specific to this event (English, under 15 words each)\n- "chapters": array of 5 objects, each with: arcLabel, dateRange, keyword, dateFrom, dateTo, section, synopsis (60-80 words, dramatic English), aiHint (1-2 sentences about Guardian coverage patterns)`,
      temperature: 0.7,
      maxTokens: 3000,
    });

    const parsed = parseArcResponse(text, query);

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Orchestrate]", message);

    return NextResponse.json(
      { error: "LLM orchestration failed", detail: message },
      { status: 502 }
    );
  }
}

/**
 * Parse and validate the LLM JSON output into a clean ArcPlan.
 */
function parseArcResponse(raw: string, query: string): ArcPlan {
  let cleaned = raw.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
  }

  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart > 0 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${cleaned.slice(0, 200)}`);
  }

  const subtitle =
    typeof data.subtitle === "string" ? data.subtitle : "A historical documentary";

  let interludes: [string, string] = [
    FALLBACK_INTERLUDES[0],
    FALLBACK_INTERLUDES[1],
  ];
  if (Array.isArray(data.interludes) && data.interludes.length >= 2) {
    interludes = [
      typeof data.interludes[0] === "string" ? data.interludes[0] : FALLBACK_INTERLUDES[0],
      typeof data.interludes[1] === "string" ? data.interludes[1] : FALLBACK_INTERLUDES[1],
    ];
  }

  if (!Array.isArray(data.chapters) || data.chapters.length < 5) {
    throw new Error(
      `Expected 5 chapters, got ${Array.isArray(data.chapters) ? data.chapters.length : 0}`
    );
  }

  const chapters = data.chapters.slice(0, 5).map(
    (ch: Record<string, unknown>, i: number) => ({
      index: i,
      arcTag: ARC_TAGS_VALID[i],
      arcLabel: typeof ch.arcLabel === "string" ? ch.arcLabel : `Chapter ${i + 1}`,
      dateRange: typeof ch.dateRange === "string" ? ch.dateRange : "",
      keyword: typeof ch.keyword === "string" ? ch.keyword : query,
      dateFrom: typeof ch.dateFrom === "string" ? ch.dateFrom : "2000-01-01",
      dateTo: typeof ch.dateTo === "string" ? ch.dateTo : "2025-12-31",
      section: typeof ch.section === "string" && ch.section.length > 0 ? ch.section : undefined,
      synopsis: typeof ch.synopsis === "string" ? ch.synopsis : "",
      aiHint: typeof ch.aiHint === "string" ? ch.aiHint : "",
    })
  );

  return { query, subtitle, chapters, interludes };
}
