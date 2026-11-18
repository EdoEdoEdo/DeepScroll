/**
 * Prompts and JSON Schemas for the LLM calls — server only.
 *
 * 1. Arc — same approach as v1: the model receives only the query and
 *    returns the whole arc (search parameters, narration, interludes)
 *    from its own knowledge.
 * 2. Fact-check — after the Guardian search, the model rereads its own
 *    texts next to the articles found and corrects what they contradict.
 *    The search windows are never touched: dates and context stay v1's.
 *
 * The schema is strict-mode compatible (every property required,
 * additionalProperties: false) and deliberately has no enums: on Groq,
 * gpt-oss sometimes produces values outside an enum and the request
 * fails with HTTP 400. Values are validated in code instead.
 */

/** Bump when the prompt changes — part of the LLM cache key */
export const PROMPT_VERSION = "p8";

/** Bump when the fact-check prompt changes — part of its cache key */
export const CHECK_VERSION = "c2";

/** Accepted Guardian section ids (anything else is dropped in code) */
export const GUARDIAN_SECTIONS = [
  "world",
  "uk-news",
  "us-news",
  "politics",
  "business",
  "money",
  "science",
  "technology",
  "environment",
  "society",
  "global-development",
  "media",
  "law",
  "education",
  "culture",
  "sport",
] as const;

export const ORCHESTRATE_SYSTEM = `You are a documentary director. Given a historical query, you generate a 5-chapter narrative arc sourced from The Guardian newspaper archive.

Your role is dramaturgical: you organize real events into a compelling narrative. You do NOT invent facts — you identify the key moments and frame them as a documentary story arc.

The 5 chapters follow a fixed structure:
1. PRELUDE — Context before the event. Systemic blindness, ignored warnings, false normalcy.
2. SIGNAL — The first visible crack. A specific event that marks the beginning in retrospect: the first moment that made the news, not a founding date or a launch nobody reported at the time.
3. CRISIS — The breaking point. Maximum coverage density, maximum impact.
4. RESPONSE — How the system responds. Bailouts, political decisions, mobilization.
5. AFTERMATH — The bill comes due. Long-term impact, structural changes.

For each chapter, provide:
- arcLabel: A SHORT punchy headline (3-6 words max) UNIQUE to this specific historical event. Do NOT use generic labels like "Systemic blindness" or "The breaking point" — instead reference actual people, places, moments, or numbers. Examples: "Lehman, 1:45 AM" for the 2008 crisis, "Forty-one patients in Wuhan" for COVID, "The 52% nobody expected" for Brexit, "Nine minutes and twenty-nine seconds" for George Floyd. Each label must be different and specific.
- dateRange: Human-readable date range (e.g. "2006 – 2007", "September 15, 2008")
- keyword: 2-4 search keywords for The Guardian API that ALWAYS include the main subject's name (e.g. "lehman brothers bankruptcy", "covid lockdown", "wikileaks afghan war logs"). For the PRELUDE, when the subject had no name yet, use the concrete people, places and institutions of that context instead (e.g. "minneapolis police complaints", "subprime mortgages"). Avoid abstract words like "legacy", "reckoning", "reform" alone.
- dateFrom: ISO date for search start (YYYY-MM-DD)
- dateTo: ISO date for search end (YYYY-MM-DD)
- focusDate: ISO date of the single most significant day inside that window (YYYY-MM-DD)
- section: Guardian section filter (use "business", "world", "politics", "uk-news", "us-news", "science", "environment", "society", or empty string if broad)
- synopsis: A RICH narrative paragraph (3-5 sentences, ~60-80 words). Write it like a documentary voiceover: dramatic, factual, cinematic. Include specific numbers, dates, names where historically accurate. This text will be displayed as the chapter body.
- aiHint: A brief analytical observation (1-2 sentences) about what the Guardian coverage of this period would reveal — e.g. linguistic patterns, coverage density, editorial blind spots, semantic shifts.

Also provide:
- subtitle: A documentary subtitle, poetic and evocative (e.g. "The collapse that reshaped global capitalism")
- interludes: An array of exactly 2 short, powerful statements specific to THIS story. These appear as dramatic red cards between chapters. They should hit hard and be concrete: name a person, a place, an object or a moment of this story — NEVER numbers, figures, statistics or dates (no digits, no counts written in words). Examples: "Lehman fell. Wall Street followed." or "A Wuhan market, then the whole world." or "Westminster voted. Brussels waited." Each must be under 15 words.

CRITICAL RULES:
- EVERYTHING must be in English
- Date ranges must be historically accurate, chronological and non-overlapping
- The arc covers the WHOLE story, from its origins to its consequences — not only its latest developments
- Windows must be wide enough to contain articles: at least a few days for single events, months for context chapters
- Every window must fall in a period when newspapers were already covering the subject (for the PRELUDE: its direct context — the people, institutions or tensions that led to it). Never build a chapter on a moment the press did not report at the time
- The Guardian archive starts in 1999; no window may end after today's date
- The arc is DRAMATURGICAL: "blindness → signal → collapse → response → aftermath"
- synopsis must be substantive (60-80 words each), not one-line summaries
- Only use numbers, names and dates you are certain of: no number is better than an approximate or inflated one. Never state that a law passed, a person was convicted or an event happened unless it did
- keyword should be specific enough to find relevant Guardian articles for that exact moment
- interludes must be specific to this event, never generic, and contain no numbers

Respond with valid JSON only. No markdown fences, no preamble text.`;

export function buildOrchestratePrompt(query: string, today: string): string {
  return `Generate a 5-chapter narrative arc for the following historical query:

"${query}"

Today is ${today}.

Respond with a JSON object containing:
- "subtitle": string (English, poetic)
- "interludes": array of 2 short punchy statements specific to this event (English, under 15 words each, no numbers)
- "chapters": array of 5 objects, each with: arcLabel, dateRange, keyword, dateFrom, dateTo, focusDate, section, synopsis (60-80 words, dramatic English), aiHint (1-2 sentences about Guardian coverage patterns)`;
}

export const ORCHESTRATE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    subtitle: { type: "string" },
    interludes: { type: "array", items: { type: "string" } },
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          arcLabel: { type: "string" },
          dateRange: { type: "string" },
          keyword: { type: "string" },
          dateFrom: { type: "string" },
          dateTo: { type: "string" },
          focusDate: { type: "string" },
          section: { type: "string" },
          synopsis: { type: "string" },
          aiHint: { type: "string" },
        },
        required: [
          "arcLabel",
          "dateRange",
          "keyword",
          "dateFrom",
          "dateTo",
          "focusDate",
          "section",
          "synopsis",
          "aiHint",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["subtitle", "interludes", "chapters"],
  additionalProperties: false,
};

// ── Fact-check (second, lighter call) ───────────────────

export const CHECK_SYSTEM = `You are the fact-checker of a short documentary narrated by an AI. You receive the draft texts of its 5 chapters and, for each chapter, the real Guardian articles found for that period (date, headline and, for the main one, its summary and opening lines).

Make every text accurate while changing as little as possible:
- Correct any statement the articles contradict: dates, counts, names, outcomes, who did what, which court or body decided what, and in which order.
- Also correct statements you know to be false, even if the articles do not cover them.
- A number, date or detail that the articles do not confirm and you are not certain of must go: remove it or make it general ("thousands", "that summer"). Never replace a guess with another guess.
- The first article listed for a chapter (the one with a summary) is its main source. If it reports the key event of that period and the synopsis does not mention it, add one sentence about it, using only what that article says, and shorten the rest to stay within the length.
- Do not add any other fact that is not in the articles. Never mention the Guardian, the articles or "sources" in the texts.
- Keep the documentary voice, English, and the length: synopsis 60-80 words, aiHint 1-2 sentences.
- arcLabel: keep it unless it states something false or uncertain; then write a new 3-6 word label in the same spirit.
- aiHint describes what the coverage of that period reveals: keep it consistent with the headlines listed for that chapter.
- interludes: 2 statements under 15 words with NO numbers, figures or dates; keep them when they already comply and are true.

Return all 5 chapters in order and both interludes, including the texts you did not change. Respond with valid JSON only.`;

export interface CheckArticle {
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** Standfirst + opening lines — main article only */
  summary?: string;
}

export interface CheckChapterInput {
  arcTag: string;
  dateRange: string;
  arcLabel: string;
  synopsis: string;
  aiHint: string;
  articles: CheckArticle[];
}

export function buildCheckPrompt(
  query: string,
  today: string,
  chapters: CheckChapterInput[],
  interludes: [string, string]
): string {
  const blocks = chapters.map((ch, i) => {
    const articles =
      ch.articles.length > 0
        ? ch.articles
            .map((a) => `- ${a.date} · ${a.title}${a.summary ? `\n  Summary: ${a.summary}` : ""}`)
            .join("\n")
        : "- (no articles found for this period)";
    return `CHAPTER ${i + 1} · ${ch.arcTag.toUpperCase()} · ${ch.dateRange}
arcLabel: ${ch.arcLabel}
synopsis: ${ch.synopsis}
aiHint: ${ch.aiHint}
Guardian articles for this chapter:
${articles}`;
  });

  return `Documentary: "${query}"
Today is ${today}.

${blocks.join("\n\n")}

INTERLUDES
1. ${interludes[0]}
2. ${interludes[1]}

Respond with a JSON object: "chapters" (5 objects with arcLabel, synopsis, aiHint) and "interludes" (2 strings).`;
}

export const CHECK_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          arcLabel: { type: "string" },
          synopsis: { type: "string" },
          aiHint: { type: "string" },
        },
        required: ["arcLabel", "synopsis", "aiHint"],
        additionalProperties: false,
      },
    },
    interludes: { type: "array", items: { type: "string" } },
  },
  required: ["chapters", "interludes"],
  additionalProperties: false,
};
