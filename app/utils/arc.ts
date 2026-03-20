import type { ArcTag } from "./types";

/**
 * Narrative arc structure — fixed 5-chapter dramaturgy.
 */
export const ARC_STRUCTURE: Array<{
  index: number;
  tag: ArcTag;
  role: string;
  description: string;
}> = [
  {
    index: 0,
    tag: "Prelude",
    role: "Context before the event",
    description:
      "The world before the crisis. Systemic blindness, ignored warnings, false normalcy.",
  },
  {
    index: 1,
    tag: "Signal",
    role: "First ignored indicator",
    description:
      "The first visible crack. A specific event that marks the beginning in retrospect.",
  },
  {
    index: 2,
    tag: "Crisis",
    role: "The breaking point",
    description:
      "The moment of collapse. Maximum coverage density, maximum impact.",
  },
  {
    index: 3,
    tag: "Response",
    role: "Institutional/human reaction",
    description:
      "How the system responds. Bailouts, political decisions, mobilization.",
  },
  {
    index: 4,
    tag: "Aftermath",
    role: "The bill comes due",
    description:
      "Long-term impact, structural changes, lessons learned or ignored.",
  },
];

/**
 * Fallback interlude quotes — used if LLM doesn't provide dynamic ones.
 */
export const FALLBACK_INTERLUDES = [
  "Every article you are reading is real.",
  "History is not invented — it is excavated.",
] as const;

/**
 * Chapter indices before which an interlude is shown.
 * (Before chapter 3 and chapter 5, i.e. indices 2 and 4)
 */
export const INTERLUDE_BEFORE = [2, 4] as const;

/**
 * System prompt for Groq LLM — generates the narrative arc plan.
 */
export const ORCHESTRATE_SYSTEM_PROMPT = `You are a documentary director. Given a historical query, you generate a 5-chapter narrative arc sourced from The Guardian newspaper archive.

Your role is dramaturgical: you organize real events into a compelling narrative. You do NOT invent facts — you identify the key moments and frame them as a documentary story arc.

The 5 chapters follow a fixed structure:
1. PRELUDE — Context before the event. Systemic blindness, ignored warnings, false normalcy.
2. SIGNAL — The first visible crack. A specific event that marks the beginning in retrospect.
3. CRISIS — The breaking point. Maximum coverage density, maximum impact.
4. RESPONSE — How the system responds. Bailouts, political decisions, mobilization.
5. AFTERMATH — The bill comes due. Long-term impact, structural changes.

For each chapter, provide:
- arcLabel: A SHORT punchy headline (3-6 words max) UNIQUE to this specific historical event. Do NOT use generic labels like "Systemic blindness" or "The breaking point" — instead reference actual people, places, moments, or numbers. Examples: "Lehman, 1:45 AM" for the 2008 crisis, "Forty-one patients in Wuhan" for COVID, "The 52% nobody expected" for Brexit, "Nine minutes and twenty-nine seconds" for George Floyd. Each label must be different and specific.
- dateRange: Human-readable date range (e.g. "2006 – 2007", "September 15, 2008")
- keyword: 2-4 search keywords for The Guardian API (e.g. "lehman brothers bankruptcy", "covid lockdown march 2020")
- dateFrom: ISO date for search start (YYYY-MM-DD)
- dateTo: ISO date for search end (YYYY-MM-DD)
- section: Guardian section filter (use "business", "world", "politics", "uk-news", "science", "environment", "society", or empty string if broad)
- synopsis: A RICH narrative paragraph (3-5 sentences, ~60-80 words). Write it like a documentary voiceover: dramatic, factual, cinematic. Include specific numbers, dates, names where historically accurate. This text will be displayed as the chapter body.
- aiHint: A brief analytical observation (1-2 sentences) about what the Guardian coverage of this period would reveal — e.g. linguistic patterns, coverage density, editorial blind spots, semantic shifts. This will seed the AI analysis block.

Also provide:
- subtitle: A documentary subtitle, poetic and evocative (e.g. "The collapse that reshaped global capitalism")
- interludes: An array of exactly 2 short, powerful statements specific to THIS story. These appear as dramatic red cards between chapters. They should hit hard — use specific numbers, facts, or provocative framings from the event. Examples: "639 billion dollars. One night. One bankruptcy." or "The world stopped in 72 hours." or "52% voted. 100% were affected." Each must be under 15 words.

CRITICAL RULES:
- EVERYTHING must be in English
- Date ranges must be historically accurate and non-overlapping
- The arc is DRAMATURGICAL: "blindness → signal → collapse → response → aftermath"
- synopsis must be substantive (60-80 words each), not one-line summaries
- keyword should be specific enough to find relevant Guardian articles for that exact moment
- interludes must be specific to this event, never generic

Respond with valid JSON only. No markdown fences, no preamble text.`;
