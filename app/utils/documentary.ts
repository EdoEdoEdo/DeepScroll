/**
 * Documentary pipeline — server only.
 *
 *   query
 *     → LLM call 1: 5-act arc (search windows + narration + interludes),
 *       from the model's own knowledge — same approach as v1
 *     → Guardian search per act (throttled, cached)
 *     → scorer v3 → hero per act, never the same article twice
 *     → LLM call 2 (best effort, ~3k tokens): the narration is reread next
 *       to the articles found and corrected where they contradict it
 *     → DocumentaryData
 *
 * Progress is reported through `emit` (streamed to the browser as NDJSON).
 * The LLM call and the Guardian searches are cached, so a repeated query
 * costs no tokens and no API calls.
 */
import { unstable_cache } from "next/cache";
import type {
  ArcPlan,
  ChapterData,
  DocumentaryData,
  PipelineEvent,
  PlanChapter,
  ScoredArticle,
  SourceRef,
} from "./types";
import { ARC_STRUCTURE, DOC_VERSION, FALLBACK_INTERLUDES } from "./arc";
import { searchGuardian } from "./guardian-client";
import { namesTopic, scoreArticles, SCORER_LABEL } from "./scorer";
import { generateJson, HttpError, LlmError, toModelRef } from "./llm";
import {
  CHECK_SCHEMA,
  CHECK_SYSTEM,
  CHECK_VERSION,
  GUARDIAN_SECTIONS,
  ORCHESTRATE_SCHEMA,
  ORCHESTRATE_SYSTEM,
  PROMPT_VERSION,
  buildCheckPrompt,
  buildOrchestratePrompt,
  type CheckArticle,
} from "./prompts";
import { extractBestImage, firstWords, formatGuardianDate, stripHtml, truncate } from "./text";

const LLM_CACHE_SECONDS = 60 * 60 * 24 * 30;
export const MAX_QUERY_LENGTH = 120;

/** Minimum search window per act, in days — keeps chapters from coming back empty */
const MIN_WINDOW_DAYS = [30, 7, 7, 7, 30];

/** Event acts: coverage follows the event, so short windows extend forward */
const FORWARD_WINDOW = [false, true, true, false, false];

export type Emit = (event: PipelineEvent) => void;

/** Pipeline failure with a readable message and the technical detail apart */
export class PipelineError extends Error {
  constructor(message: string, public detail?: string) {
    super(message);
    this.name = "PipelineError";
  }
}

// ── Helpers ─────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** "2016-06-23" (also accepts full ISO timestamps) or null */
function isoOrNull(value: unknown): string | null {
  const s = str(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return Number.isNaN(Date.parse(s)) ? null : s;
}

function log(emit: Emit, text: string, status: "active" | "ok" | "pending" | "error" = "active") {
  emit({ type: "log", text, status });
}

function progress(emit: Emit, value: number) {
  emit({ type: "progress", value });
}

/** Trim, collapse spaces, enforce length — null if unusable */
export function normalizeQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.replace(/\s+/g, " ").trim();
  if (q.length < 2 || q.length > MAX_QUERY_LENGTH) return null;
  return q;
}

// ── Step 1: arc (single LLM call) ───────────────────────

/**
 * Clean dates: swap reversed windows, clamp to today, widen windows that
 * are too narrow to contain articles, keep the focal day inside.
 */
function normalizeWindow(
  index: number,
  rawFrom: unknown,
  rawTo: unknown,
  rawFocus: unknown,
  today: string
): { dateFrom: string; dateTo: string; focusDate: string } {
  let from = isoOrNull(rawFrom);
  let to = isoOrNull(rawTo);
  if (!from || !to) {
    // Salvage the chapter from its focal day (widened below) rather than discard the answer
    const focusOnly = isoOrNull(rawFocus);
    if (!focusOnly) throw new Error(`Chapter ${index + 1}: invalid dates`);
    from = from ?? focusOnly;
    to = to ?? focusOnly;
  }
  if (from > to) [from, to] = [to, from];
  if (to > today) to = today;
  if (from > to) from = to;

  let focus = isoOrNull(rawFocus);
  if (!focus || focus < from || focus > to) {
    focus = toIso((Date.parse(from) + Date.parse(to)) / 2);
  }

  // Widen around the focal day if the window is narrower than the minimum
  const minDays = MIN_WINDOW_DAYS[index] ?? 3;
  const span = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  if (span < minDays) {
    const focusMs = Date.parse(focus);
    if (FORWARD_WINDOW[index]) {
      // From the day before the event to the following week, when the coverage lands
      from = toIso(focusMs - DAY_MS);
      to = toIso(Math.min(focusMs + (minDays - 1) * DAY_MS, Date.parse(today)));
    } else {
      const half = (minDays * DAY_MS) / 2;
      from = toIso(focusMs - half);
      to = toIso(Math.min(focusMs + half, Date.parse(today)));
    }
  }

  return { dateFrom: from, dateTo: to, focusDate: focus };
}

function validateArc(
  raw: unknown,
  query: string,
  today: string
): Omit<ArcPlan, "query" | "model"> {
  const obj = asRecord(raw);
  const list = obj?.chapters;
  if (!Array.isArray(list) || list.length < 5) {
    throw new Error(`Expected 5 chapters, got ${Array.isArray(list) ? list.length : 0}`);
  }

  const chapters = list.slice(0, 5).map((item, i): PlanChapter => {
    const ch = asRecord(item) ?? {};
    const win = normalizeWindow(i, ch.dateFrom, ch.dateTo, ch.focusDate, today);

    const keyword =
      str(ch.keyword)
        .replace(/["'()]/g, " ")
        .replace(/\b(AND|OR|NOT)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim() || query;

    const sectionRaw = str(ch.section).toLowerCase();
    const section = (GUARDIAN_SECTIONS as readonly string[]).includes(sectionRaw)
      ? sectionRaw
      : undefined;

    return {
      index: i,
      arcTag: ARC_STRUCTURE[i].tag,
      arcLabel: str(ch.arcLabel) || ARC_STRUCTURE[i].role,
      dateRange: str(ch.dateRange) || `${win.dateFrom} – ${win.dateTo}`,
      ...win,
      keyword,
      section,
      synopsis: str(ch.synopsis),
      aiHint: str(ch.aiHint),
    };
  });

  const interludes = Array.isArray(obj?.interludes)
    ? (obj.interludes as unknown[]).map(str).filter((s) => s.length > 0)
    : [];

  return {
    subtitle: str(obj?.subtitle),
    interludes: [interludes[0] ?? FALLBACK_INTERLUDES[0], interludes[1] ?? FALLBACK_INTERLUDES[1]],
    chapters,
  };
}

/** Readable log line for a failed attempt */
function attemptMessage(label: string, err: Error): string {
  if (err instanceof HttpError && err.status === 429) {
    return `⚠ ${label}: free-tier limit reached, waiting and retrying...`;
  }
  if (err instanceof HttpError && err.status === 400) {
    return `⚠ ${label}: response did not match the schema, retrying in JSON mode`;
  }
  return `⚠ ${label}: ${truncate(err.message, 90)}`;
}

export async function planArc(
  query: string,
  preferredModel?: string,
  emit?: Emit
): Promise<ArcPlan> {
  const today = todayIso();

  const run = () =>
    generateJson({
      name: "documentary_arc",
      system: ORCHESTRATE_SYSTEM,
      prompt: buildOrchestratePrompt(query, today),
      schema: ORCHESTRATE_SCHEMA,
      validate: (raw) => validateArc(raw, query, today),
      // Medium reasoning: better dates and keywords, ~1-2k tokens more (fine for a demo)
      maxTokens: 8000,
      reasoningEffort: "medium",
      timeoutMs: 60_000,
      // v1 value: 0.3 made the arc timid (generic labels, chapters on
      // uncovered "origins"); accuracy is the fact-check's job now
      temperature: 0.7,
      preferredModel,
      onAttemptError: (model, err) => emit && log(emit, attemptMessage(model.label, err), "error"),
    });

  const cached = unstable_cache(
    run,
    ["llm-arc", PROMPT_VERSION, query.toLowerCase(), preferredModel ?? "auto"],
    { revalidate: LLM_CACHE_SECONDS }
  );

  const { data, model } = await cached();
  return { query, ...data, model: toModelRef(model) };
}

// ── Step 2: retrieve + rank per chapter ─────────────────

// ── Topic anchoring ─────────────────────────────────────

const STOPWORDS = new Set([
  "the", "and", "for", "from", "with", "into", "over", "after", "before", "during",
  "fall", "rise", "end", "war", "crisis", "story", "history", "of", "in", "on", "a", "an",
]);

/**
 * The 1–2 most distinctive words of the query ("Fall of Afghanistan" →
 * ["afghanistan"], "George Floyd" → ["george", "floyd"]). Used to keep every
 * chapter search on topic, and to boost articles that name the topic.
 */
export function topicTerms(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9\-]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  const unique = [...new Set(words)];
  if (unique.length <= 2) return unique;
  return unique.sort((a, b) => b.length - a.length).slice(0, 2);
}

/** Words never worth requiring in a Guardian AND query */
const QUERY_FILLERS = new Set(["of", "the", "and", "in", "on", "a", "an", "to", "for", "at", "by"]);

/** Guardian query requiring the topic AND every keyword word */
function anchoredQuery(keyword: string, terms: string[]): string {
  const words = keyword
    .split(/\s+/)
    .filter((w) => w && !terms.includes(w.toLowerCase()) && !QUERY_FILLERS.has(w.toLowerCase()));
  const parts = [...terms, ...words].map((w) => (/[\s-]/.test(w) ? `"${w}"` : w));
  return parts.join(" AND ");
}

/** Keyword words worth matching (lower case, no fillers, no topic words) */
function keywordWordsOf(keyword: string, terms: string[]): string[] {
  return [
    ...new Set(
      keyword
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !QUERY_FILLERS.has(w) && !STOPWORDS.has(w) && !terms.includes(w))
    ),
  ];
}

/**
 * The 2 most distinctive keyword words — the longest, as in topicTerms
 * ("wikileaks julian assange launch" → ["wikileaks", "assange"]): first
 * names and generic verbs are short, so they never carry a search alone.
 */
function distinctiveWords(words: string[]): string[] {
  return [...words].sort((a, b) => b.length - a.length).slice(0, 2);
}

/**
 * Topic-only query for the Prelude: the exact phrase when the query reads
 * that way ("george floyd" — not "george AND floyd", which also finds
 * Pink Floyd pieces mentioning a George), else every topic word.
 */
function topicOnlyQuery(query: string, terms: string[], index: number): string {
  const phrase = terms.join(" ");
  if (index === 0 && terms.length > 1 && query.toLowerCase().includes(phrase)) return `"${phrase}"`;
  return anchoredQuery("", terms);
}

interface ChapterHarvest {
  plan: PlanChapter;
  total: number;
  scored: ScoredArticle[];
  hero: ScoredArticle | null;
  secondary: ScoredArticle[];
}

async function harvestChapter(
  input: PlanChapter,
  query: string,
  usedHeroIds: Set<string>,
  emit: Emit,
  /** Re-centring may only land between the neighbouring chapters */
  bounds: { from: string; to: string }
): Promise<ChapterHarvest> {
  let plan = input;
  const terms = topicTerms(query);
  const currentWindow = () => ({
    fromDate: plan.dateFrom,
    toDate: plan.dateTo,
    orderBy: "relevance" as const,
    pageSize: 20,
    withBody: true,
  });

  // 1. Topic AND keyword, inside the window chosen by the AI
  let res = { results: [] as Awaited<ReturnType<typeof searchGuardian>>["results"], total: 0 };
  if (terms.length > 0) {
    const anchored = anchoredQuery(plan.keyword, terms);
    res = await searchGuardian({ q: anchored, ...currentWindow() });

    // 2. Empty window: the AI may have the date wrong — find when the Guardian covered it.
    //    Not for the Prelude: it is *before* the event, the topic may not exist yet.
    if (res.results.length === 0 && plan.index > 0) {
      const undated = await searchGuardian({ q: anchored, orderBy: "relevance", pageSize: 20 });
      // Closest coverage to the AI's date, within the neighbouring chapters —
      // never the "most relevant" article from years later
      const aiFocus = Date.parse(plan.focusDate);
      const candidates = undated.results
        .map((r) => ({ r, day: r.webPublicationDate.slice(0, 10) }))
        .filter(({ day }) => day >= bounds.from && day <= bounds.to)
        .sort((a, b) => Math.abs(Date.parse(a.day) - aiFocus) - Math.abs(Date.parse(b.day) - aiFocus));
      const best = candidates[0];
      if (best) {
        const span = Math.max(
          Date.parse(plan.dateTo) - Date.parse(plan.dateFrom),
          (MIN_WINDOW_DAYS[plan.index] ?? 7) * DAY_MS
        );
        const focusMs = Date.parse(best.day);
        const today = Date.parse(todayIso());
        const forward = FORWARD_WINDOW[plan.index];
        const dateFrom = toIso(forward ? focusMs - DAY_MS : focusMs - span / 2);
        const dateTo = toIso(Math.min(forward ? focusMs + span - DAY_MS : focusMs + span / 2, today));
        plan = {
          ...plan,
          focusDate: best.day,
          dateFrom,
          dateTo,
          dateRange: `${formatGuardianDate(dateFrom)} – ${formatGuardianDate(dateTo)}`,
        };
        log(emit, `→ no coverage in the planned window: re-centred on ${plan.dateFrom} → ${plan.dateTo}`, "pending");
        res = await searchGuardian({ q: anchored, ...currentWindow() });
      }
    }
  }

  const searchWindow = currentWindow();

  // 3. Topic only, inside the window (e.g. "george AND floyd" in 2021–2023).
  //    Prelude too: the subject often exists before its big moment (WikiLeaks
  //    in 2007); when it doesn't, the search is simply empty and we move on.
  if (res.results.length === 0 && terms.length > 0) {
    log(emit, `→ widening to every article on "${terms.join(" ")}" in the window`, "pending");
    res = await searchGuardian({ q: topicOnlyQuery(query, terms, plan.index), ...searchWindow });
  }

  // 4. Keyword with ALL its words required (Guardian treats plain words as OR)
  const strictKeyword = anchoredQuery(plan.keyword, []);
  if (res.results.length === 0 && strictKeyword.includes(" AND ")) {
    res = await searchGuardian({ q: strictKeyword, ...searchWindow, section: plan.section });
    if (res.results.length === 0 && plan.section) {
      res = await searchGuardian({ q: strictKeyword, ...searchWindow });
    }
  }

  // 4b. Only the 2 most distinctive keyword words, both required — before
  //     the loose search, where a lone first name ("julian") is enough
  const keywordWords = keywordWordsOf(plan.keyword, terms);
  const distinctive = distinctiveWords(keywordWordsOf(plan.keyword, []));
  if (res.results.length === 0 && distinctive.length === 2) {
    const relaxed = anchoredQuery(distinctive.join(" "), []);
    if (relaxed !== strictKeyword) {
      log(emit, `→ relaxing the search to "${distinctive.join(" ")}"`, "pending");
      res = await searchGuardian({ q: relaxed, ...searchWindow });
    }
  }

  // 5. Loose fallbacks: plain keyword (with section, then without), then the topic.
  //    Guardian reads plain words as OR: what comes back is filtered below.
  const foundBeforeLoose = res.results.length > 0;
  if (res.results.length === 0) {
    res = await searchGuardian({ q: plan.keyword, ...searchWindow, section: plan.section });
  }

  if (res.results.length === 0 && plan.section) {
    log(emit, `→ nothing in section "${plan.section}", widening to all sections`, "pending");
    res = await searchGuardian({ q: plan.keyword, ...searchWindow });
  }
  if (res.results.length === 0 && plan.keyword.toLowerCase() !== query.toLowerCase()) {
    log(emit, `→ retrying with "${query}" in the same window`, "pending");
    res = await searchGuardian({ q: query, ...searchWindow });
  }

  // Prelude: the topic may have no name yet → reward the keyword's own words
  // instead, as long as the most distinctive one is among them
  // ("assange" — never "julian" + "launch" alone)
  const scored = scoreArticles(res.results, {
    dateFrom: plan.dateFrom,
    dateTo: plan.dateTo,
    focusDate: plan.focusDate,
    topicTerms: terms,
    ...(plan.index === 0
      ? {
          keywordTerms: {
            terms: keywordWords,
            min: Math.min(2, keywordWords.length),
            anyOf: distinctiveWords(keywordWords).slice(0, 1),
          },
        }
      : {}),
  });

  // Loose results count only if they name the topic ("Introduction",
  // "Recipe for activism"): a wrong hero is worse than an honest silence
  let ranked = scored;
  let total = res.total;
  if (!foundBeforeLoose && scored.length > 0 && terms.length > 0) {
    ranked = scored.filter((s) => namesTopic(s.article, terms));
    total = ranked.length;
    if (ranked.length < scored.length) {
      log(
        emit,
        `→ loose search: kept ${ranked.length} of ${scored.length} articles naming "${terms.join(" ")}"`,
        "pending"
      );
    }
  }

  // The same article never leads two chapters
  const hero = ranked.find((s) => !usedHeroIds.has(s.article.id)) ?? null;
  if (hero) usedHeroIds.add(hero.article.id);
  const secondary = ranked
    .filter((s) => s !== hero && !usedHeroIds.has(s.article.id))
    .slice(0, 8);

  return { plan, total, scored: ranked, hero, secondary };
}

// ── Step 3: fact-check (best effort) ────────────────────

/** /api/documentary may run 60 s: the optional check must end before that */
const TIME_BUDGET_MS = 55_000;
/** Skip the check when less time than this is left */
const CHECK_MIN_MS = 12_000;
const CHECK_TIMEOUT_MS = 25_000;

interface NarrationTexts {
  chapters: Array<{ arcLabel: string; synopsis: string; aiHint: string }>;
  interludes: [string, string];
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Field by field: a revision that is empty or out of shape keeps the draft */
function validateCheck(raw: unknown, draft: NarrationTexts): NarrationTexts {
  const obj = asRecord(raw);
  const list = obj?.chapters;
  if (!Array.isArray(list) || list.length < 5) {
    throw new Error(`Expected 5 chapters, got ${Array.isArray(list) ? list.length : 0}`);
  }

  const chapters = draft.chapters.map((orig, i) => {
    const ch = asRecord(list[i]) ?? {};
    const synopsis = str(ch.synopsis);
    const arcLabel = str(ch.arcLabel);
    const aiHint = str(ch.aiHint);
    const synopsisWords = wordCount(synopsis);
    return {
      // No draft = Guardian standfirst fallback: the check never writes one from scratch
      synopsis: orig.synopsis && synopsisWords >= 25 && synopsisWords <= 140 ? synopsis : orig.synopsis,
      arcLabel: arcLabel && wordCount(arcLabel) <= 8 ? arcLabel : orig.arcLabel,
      aiHint: aiHint && wordCount(aiHint) <= 70 ? aiHint : orig.aiHint,
    };
  });

  const revised = Array.isArray(obj?.interludes) ? (obj.interludes as unknown[]).map(str) : [];
  const interludes = draft.interludes.map((orig, i) => {
    const text = revised[i] ?? "";
    if (!text || wordCount(text) > 20) return orig;
    // Interludes carry no figures: never trade a clean draft for one with digits
    return /\d/.test(text) && !/\d/.test(orig) ? orig : text;
  }) as [string, string];

  return { chapters, interludes };
}

/** What the checker sees: the hero (summary + opening) and the other headlines */
function evidenceFor(h: ChapterHarvest): CheckArticle[] {
  const list: CheckArticle[] = [];
  if (h.hero) {
    const a = h.hero.article;
    const f = a.fields ?? {};
    const lead = stripHtml(f.standfirst) || stripHtml(f.trailText);
    const opening = firstWords(f.bodyText, 45);
    list.push({
      date: a.webPublicationDate.slice(0, 10),
      title: a.webTitle,
      summary: truncate([lead, opening].filter(Boolean).join(" — "), 500),
    });
  }
  for (const s of h.secondary.slice(0, 4)) {
    list.push({ date: s.article.webPublicationDate.slice(0, 10), title: s.article.webTitle });
  }
  return list;
}

function changedFields(draft: NarrationTexts, revised: NarrationTexts): number {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  let count = 0;
  draft.chapters.forEach((d, i) => {
    const r = revised.chapters[i];
    if (norm(d.synopsis) !== norm(r.synopsis)) count++;
    if (norm(d.arcLabel) !== norm(r.arcLabel)) count++;
    if (norm(d.aiHint) !== norm(r.aiHint)) count++;
  });
  draft.interludes.forEach((d, i) => {
    if (norm(d) !== norm(revised.interludes[i])) count++;
  });
  return count;
}

/**
 * Second LLM call: the model rereads its narration next to the articles
 * actually found and fixes what they contradict. Search windows, heroes
 * and structure are untouched. Any failure keeps the draft narration.
 */
async function checkNarration(
  plan: ArcPlan,
  harvests: ChapterHarvest[],
  preferredModel: string | undefined,
  emit: Emit,
  startedAt: number
): Promise<NarrationTexts | null> {
  if (harvests.every((h) => !h.plan.synopsis)) return null;

  const deadline = startedAt + TIME_BUDGET_MS;
  if (deadline - Date.now() < CHECK_MIN_MS) {
    log(emit, "→ fact-check skipped: not enough time left, keeping the draft narration", "pending");
    return null;
  }

  log(emit, "Fact-checking the narration against the articles found...");
  const draft: NarrationTexts = {
    chapters: harvests.map(({ plan: p }) => ({
      arcLabel: p.arcLabel,
      synopsis: p.synopsis,
      aiHint: p.aiHint,
    })),
    interludes: plan.interludes,
  };

  const run = () =>
    generateJson({
      name: "documentary_check",
      system: CHECK_SYSTEM,
      prompt: buildCheckPrompt(
        plan.query,
        todayIso(),
        harvests.map((h, i) => ({
          arcTag: h.plan.arcTag,
          dateRange: h.plan.dateRange,
          ...draft.chapters[i],
          articles: evidenceFor(h),
        })),
        draft.interludes
      ),
      schema: CHECK_SCHEMA,
      validate: (raw) => validateCheck(raw, draft),
      maxTokens: 4000,
      reasoningEffort: "low",
      temperature: 0.2,
      timeoutMs: CHECK_TIMEOUT_MS,
      deadline,
      // The model that wrote the draft checks it (if Groq was busy, Mistral)
      preferredModel: plan.model.id,
      onAttemptError: (model, err) => log(emit, attemptMessage(model.label, err), "error"),
    });

  // Same arc + same heroes → same check: a repeated query costs no tokens
  const heroIds = harvests.map((h) => h.hero?.article.id ?? "-").join("|");
  const cached = unstable_cache(
    run,
    [
      "llm-check",
      CHECK_VERSION,
      PROMPT_VERSION,
      plan.query.toLowerCase(),
      preferredModel ?? "auto",
      plan.model.id,
      heroIds,
    ],
    { revalidate: LLM_CACHE_SECONDS }
  );

  try {
    const { data, model } = await cached();
    const changes = changedFields(draft, data);
    log(
      emit,
      changes > 0
        ? `→ ${changes} passage${changes === 1 ? "" : "s"} corrected by ${model.label}`
        : `→ narration confirmed by ${model.label}`,
      "ok"
    );
    return data;
  } catch (err) {
    log(emit, `→ fact-check unavailable, keeping the draft narration`, "pending");
    console.warn("[Documentary] fact-check failed:", message(err));
    return null;
  }
}

// ── Step 4: assemble ────────────────────────────────────

function toSource(s: ScoredArticle): SourceRef {
  return {
    id: s.article.id,
    title: s.article.webTitle,
    date: s.article.webPublicationDate,
    section: s.article.sectionName,
    url: s.article.webUrl,
    byline: s.article.fields?.byline ?? "",
  };
}

function assembleChapter(h: ChapterHarvest, checked: boolean): ChapterData {
  const hero = h.hero?.article ?? null;
  const f = hero?.fields ?? {};
  const secondary = h.secondary.map(toSource);
  const noiseTitles = secondary.map((s) => s.title.toUpperCase());
  const fallbackBody = stripHtml(f.standfirst) || stripHtml(f.trailText);
  const aiNarration = Boolean(h.plan.synopsis);

  return {
    index: h.plan.index,
    arcTag: h.plan.arcTag,
    arcLabel: h.plan.arcLabel,
    dateRange: h.plan.dateRange,
    keyword: h.plan.keyword,
    headline: hero?.webTitle ?? "Silence in the archive",
    body: aiNarration ? h.plan.synopsis : fallbackBody,
    aiNarration,
    narrationChecked: aiNarration && checked,
    insight: h.plan.aiHint,
    guardian: {
      excerpt: firstWords(f.bodyText, 90) || stripHtml(f.trailText) || stripHtml(f.standfirst),
      date: hero ? formatGuardianDate(hero.webPublicationDate) : h.plan.dateRange,
      section: hero?.sectionName ?? h.plan.section ?? "World",
      url: hero?.webUrl ?? "",
      byline: f.byline ?? "",
      articleId: hero?.id ?? "",
    },
    score: h.hero?.score ?? 0,
    wordcount: h.hero?.wordcount ?? 0,
    imageUrl: hero ? extractBestImage(f.thumbnail, f.main) : null,
    archiveMatches: h.total,
    scanned: h.scored.length,
    noiseText:
      noiseTitles.length > 0
        ? noiseTitles.join(" · ")
        : h.plan.keyword.toUpperCase().replace(/\s+/g, " · "),
    secondary,
  };
}

// ── Main ────────────────────────────────────────────────

export async function buildDocumentary(
  query: string,
  preferredModel: string | undefined,
  emit: Emit
): Promise<DocumentaryData> {
  const startedAt = Date.now();
  log(emit, `Query received: "${query}"`, "ok");
  progress(emit, 5);

  // 1. Arc
  log(emit, "Designing the 5-act narrative arc...");
  let plan: ArcPlan;
  try {
    plan = await planArc(query, preferredModel, emit);
  } catch (err) {
    if (err instanceof LlmError && err.kind === "rate_limit") {
      throw new PipelineError(
        "The free AI quota is busy right now. Wait a minute and retry.",
        err.message
      );
    }
    if (err instanceof LlmError && err.kind === "config") {
      throw new PipelineError("No AI model is configured on the server.", err.message);
    }
    throw new PipelineError(
      "The AI could not plan this documentary. Retry, or rephrase the query.",
      message(err)
    );
  }
  log(emit, `→ Arc by ${plan.model.label}`, "ok");
  log(emit, `→ ${plan.chapters.map((c) => c.arcTag.toLowerCase()).join(" → ")}`, "ok");
  emit({
    type: "plan",
    chapters: plan.chapters.map(({ index, arcTag, keyword, dateRange }) => ({
      index,
      arcTag,
      keyword,
      dateRange,
    })),
  });
  progress(emit, 25);

  // 2. Retrieve + rank
  log(emit, `Scorer v3 · ${SCORER_LABEL}`, "pending");
  const usedHeroIds = new Set<string>();
  const harvests: ChapterHarvest[] = [];

  for (const ch of plan.chapters) {
    log(emit, `CH.0${ch.index + 1} ${ch.arcTag} · "${ch.keyword}" · ${ch.dateFrom} → ${ch.dateTo}`);

    let harvest: ChapterHarvest;
    try {
      harvest = await harvestChapter(ch, query, usedHeroIds, emit, {
        from: plan.chapters[ch.index - 1]?.dateFrom ?? "1999-01-01",
        to: plan.chapters[ch.index + 1]?.dateTo ?? todayIso(),
      });
    } catch (err) {
      log(emit, `→ retrieval failed: ${truncate(message(err), 80)}`, "error");
      harvest = { plan: ch, total: 0, scored: [], hero: null, secondary: [] };
    }
    harvests.push(harvest);

    emit({
      type: "chapter",
      index: ch.index,
      arcTag: ch.arcTag,
      keyword: ch.keyword,
      matches: harvest.total,
      headline: harvest.hero?.article.webTitle ?? null,
    });
    log(
      emit,
      harvest.hero
        ? `→ ${harvest.total.toLocaleString("en-GB")} matches · hero ${harvest.hero.score}/100: "${truncate(harvest.hero.article.webTitle, 64)}"`
        : "→ no articles in this window: silence in the archive",
      harvest.hero ? "ok" : "pending"
    );
    progress(emit, 25 + Math.round(((ch.index + 1) / 5) * 60));
  }

  if (harvests.every((h) => !h.hero)) {
    throw new PipelineError(
      "No Guardian articles found for any chapter. Try a broader or different query."
    );
  }

  // 3. Fact-check the narration against the articles found (best effort)
  const revised = await checkNarration(plan, harvests, preferredModel, emit, startedAt);
  if (revised) {
    harvests.forEach((h, i) => {
      h.plan = { ...h.plan, ...revised.chapters[i] };
    });
  }
  const interludes = revised?.interludes ?? plan.interludes;
  progress(emit, 95);

  // 4. Assemble
  const chapters = harvests.map((h) => assembleChapter(h, Boolean(revised)));
  const heroScores = chapters.filter((c) => c.guardian.articleId).map((c) => c.score);
  const scannedIds = new Set(harvests.flatMap((h) => h.scored.map((s) => s.article.id)));

  const data: DocumentaryData = {
    version: DOC_VERSION,
    query,
    subtitle: plan.subtitle || "A documentary excavated from the Guardian archive",
    chapters,
    interludes,
    stats: {
      scanned: scannedIds.size,
      archiveMatches: harvests.reduce((sum, h) => sum + h.total, 0),
      avgScore:
        heroScores.length > 0
          ? Math.round(heroScores.reduce((a, b) => a + b, 0) / heroScores.length)
          : 0,
    },
    model: plan.model,
    generatedAt: new Date().toISOString(),
  };

  log(emit, "Rendering documentary", "ok");
  progress(emit, 100);
  return data;
}
