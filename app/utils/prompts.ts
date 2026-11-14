/**
 * Prompts and JSON Schemas for the two LLM passes — server only.
 *
 *   Pass 1 (plan)  — reads real Guardian headlines, returns search
 *                    parameters for 5 acts. No narration.
 *   Pass 2 (write) — reads the articles actually retrieved, writes the
 *                    narration using only facts found in them.
 *
 * Schemas are strict-mode compatible (Groq/Mistral): every property is
 * required and every object sets additionalProperties: false. Counts
 * (5 chapters, 2 interludes) are validated in code, not in the schema.
 */

/** Bump when prompts change — part of the LLM cache key */
export const PROMPT_VERSION = "p2";

export const GUARDIAN_SECTIONS = [
  "",
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

// ── Pass 1: plan ────────────────────────────────────────

export const PLAN_SYSTEM = `You are the research director of a documentary series built entirely from The Guardian's archive (1999 to today).
Given a topic, you design the search plan for a fixed 5-act arc. You do NOT write narration: you choose the moments, and the search parameters that will retrieve real articles about them.

The 5 acts, in chronological order:
1. PRELUDE: the context before. The situation, the warnings, the normality that preceded the event.
2. SIGNAL: the first visible crack. A specific early event that, in hindsight, marks the beginning.
3. CRISIS: the breaking point. The moment of maximum impact and maximum coverage.
4. RESPONSE: how institutions and people reacted.
5. AFTERMATH: the consequences. What changed, what didn't.

You receive ARCHIVE EVIDENCE: real Guardian headlines with their publication dates. Anchor your dates to it. If the topic is more recent than your training data, trust the evidence, not your memory.

For each act return:
- arcLabel: working title, 2-5 words, neutral. No numbers you cannot see in the evidence.
- dateRange: human readable, e.g. "Jun 2016", "Sep 15 – 20, 2008", "2006 – 2007".
- dateFrom, dateTo: ISO dates (YYYY-MM-DD), the search window. Chronological and non-overlapping across acts. Tight for single events (days to weeks), wider for context acts (months).
- focusDate: ISO date inside the window: the single most significant day.
- keyword: 2-4 search terms for the Guardian search engine. Concrete nouns: people, places, institutions. No years, no dates, no quotes, no boolean operators.
- section: a Guardian section id from the allowed list, or "" when the topic spans sections. When unsure, use "".

Respond with JSON only.`;

export function buildPlanPrompt(query: string, evidence: string[], today: string): string {
  const evidenceBlock =
    evidence.length > 0
      ? `ARCHIVE EVIDENCE (${evidence.length} relevant Guardian articles, oldest first — date | section | headline):\n${evidence.join("\n")}`
      : "ARCHIVE EVIDENCE: none found. Use your own knowledge and keep the windows wide.";

  return `TOPIC: "${query}"
TODAY: ${today} (no window may end after this date)

${evidenceBlock}

Return {"chapters": [...]} with exactly 5 acts, in order: Prelude, Signal, Crisis, Response, Aftermath.`;
}

export const PLAN_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          arcLabel: { type: "string" },
          dateRange: { type: "string" },
          dateFrom: { type: "string" },
          dateTo: { type: "string" },
          focusDate: { type: "string" },
          keyword: { type: "string" },
          section: { type: "string", enum: [...GUARDIAN_SECTIONS] },
        },
        required: ["arcLabel", "dateRange", "dateFrom", "dateTo", "focusDate", "keyword", "section"],
        additionalProperties: false,
      },
    },
  },
  required: ["chapters"],
  additionalProperties: false,
};

// ── Pass 2: write ───────────────────────────────────────

export const WRITE_SYSTEM = `You are the editor of a documentary built entirely from The Guardian's archive. For each of 5 acts you receive the real articles retrieved for it. You write the narration on top of that material.

HARD RULES
- Every factual detail you write (names, numbers, dates, places, quotes) must appear in the material of that act. Do not use outside knowledge for facts. If the material has no number, write no number.
- If an act's material is thin, write less. If an act has NO material, return "" for its synopsis and insight, and an arcLabel like "Silence in the archive".
- English only. Plain text, no markdown.

FIELDS
- subtitle: one evocative line for the whole documentary, max 12 words, no facts beyond the material.
- interludes: exactly 2 statements, max 14 words each, shown as red cards: the first before act 3, the second before act 5. Punchy, built from facts in the material of act 3 and act 5 respectively.
- chapters: exactly 5, in order. For each:
  - arcLabel: 2-6 words specific to this act's material (a person, a place, a moment). Never generic, like "The breaking point".
  - synopsis: 50-80 words of documentary voiceover, present tense. Start from the HERO article, then use the other headlines.
  - insight: 1-2 sentences on how the Guardian covered this window, based only on the headlines listed: what they foreground, recurring words, whose voice appears. No statistics beyond those provided.

Respond with JSON only.`;

export interface WriteMaterial {
  arcTag: string;
  dateRange: string;
  keyword: string;
  matches: number;
  hero: {
    date: string;
    section: string;
    byline: string;
    headline: string;
    standfirst: string;
    excerpt: string;
  } | null;
  others: Array<{ date: string; title: string }>;
}

export function buildWritePrompt(query: string, acts: WriteMaterial[]): string {
  const blocks = acts.map((act, i) => {
    const head = `ACT ${i + 1}: ${act.arcTag.toUpperCase()} · ${act.dateRange} · search "${act.keyword}" · ${act.matches} archive matches`;
    if (!act.hero) return `${head}\n(no material)`;

    const hero = act.hero;
    const lines = [
      head,
      `HERO (${hero.date}, ${hero.section}${hero.byline ? `, by ${hero.byline}` : ""}): ${hero.headline}`,
    ];
    if (hero.standfirst) lines.push(`Standfirst: ${hero.standfirst}`);
    if (hero.excerpt) lines.push(`Excerpt: ${hero.excerpt}`);
    if (act.others.length > 0) {
      lines.push("OTHER HEADLINES:");
      for (const o of act.others) lines.push(`- ${o.date} · ${o.title}`);
    }
    return lines.join("\n");
  });

  return `TOPIC: "${query}"\n\n${blocks.join("\n\n")}\n\nReturn {"subtitle", "interludes", "chapters"} with exactly 2 interludes and 5 chapters.`;
}

export const WRITE_SCHEMA: Record<string, unknown> = {
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
          synopsis: { type: "string" },
          insight: { type: "string" },
        },
        required: ["arcLabel", "synopsis", "insight"],
        additionalProperties: false,
      },
    },
  },
  required: ["subtitle", "interludes", "chapters"],
  additionalProperties: false,
};
