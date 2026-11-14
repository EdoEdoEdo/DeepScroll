/**
 * Documentary pipeline — server only.
 *
 *   query
 *     → Guardian evidence search (real headlines + dates)
 *     → LLM pass 1: 5-act search plan anchored to the evidence
 *     → Guardian search per act (throttled) → scorer v3 → hero, no repeats
 *     → LLM pass 2: narration written only from the retrieved articles
 *     → DocumentaryData
 *
 * Progress is reported through `emit` (streamed to the browser as NDJSON).
 * Guardian calls and both LLM passes are cached, so a repeated query is
 * served from cache in a second or two.
 */
import { createHash } from "crypto";
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
import { scoreArticles, SCORER_LABEL } from "./scorer";
import { generateJson, toModelRef, type ModelOption } from "./llm";
import {
  GUARDIAN_SECTIONS,
  PLAN_SCHEMA,
  PLAN_SYSTEM,
  PROMPT_VERSION,
  WRITE_SCHEMA,
  WRITE_SYSTEM,
  buildPlanPrompt,
  buildWritePrompt,
  type WriteMaterial,
} from "./prompts";
import { extractBestImage, firstWords, formatGuardianDate, stripHtml, truncate } from "./text";

const LLM_CACHE_SECONDS = 60 * 60 * 24 * 30;
export const MAX_QUERY_LENGTH = 120;

export type Emit = (event: PipelineEvent) => void;

export class PipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineError";
  }
}

// ── Helpers ─────────────────────────────────────────────

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function hash(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isoDay(value: string): string {
  return value.slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "2016-06-23" (also accepts full ISO timestamps) or null */
function isoOrNull(value: unknown): string | null {
  const s = str(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return Number.isNaN(Date.parse(s)) ? null : s;
}

function midpoint(from: string, to: string): string {
  return new Date((Date.parse(from) + Date.parse(to)) / 2).toISOString().slice(0, 10);
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

// ── Step 1: evidence ────────────────────────────────────

export interface Evidence {
  /** "YYYY-MM-DD | section | headline", oldest first */
  lines: string[];
  total: number;
  ids: string[];
}

export async function getEvidence(query: string): Promise<Evidence> {
  const { results, total } = await searchGuardian({ q: query, pageSize: 40, orderBy: "relevance" });
  const sorted = [...results].sort((a, b) =>
    a.webPublicationDate.localeCompare(b.webPublicationDate)
  );
  return {
    lines: sorted.map(
      (r) => `${isoDay(r.webPublicationDate)} | ${r.sectionId} | ${truncate(r.webTitle, 140)}`
    ),
    total,
    ids: results.map((r) => r.id),
  };
}

// ── Step 2: plan (LLM pass 1) ───────────────────────────

function validatePlan(raw: unknown, query: string, today: string): PlanChapter[] {
  const list = asRecord(raw)?.chapters;
  if (!Array.isArray(list) || list.length < 5) {
    throw new Error(`Expected 5 chapters, got ${Array.isArray(list) ? list.length : 0}`);
  }

  return list.slice(0, 5).map((item, i): PlanChapter => {
    const ch = asRecord(item) ?? {};

    let from = isoOrNull(ch.dateFrom);
    let to = isoOrNull(ch.dateTo);
    if (!from || !to) throw new Error(`Chapter ${i + 1}: invalid dates`);
    if (from > to) [from, to] = [to, from];
    if (to > today) to = today;
    if (from > to) from = to;

    let focus = isoOrNull(ch.focusDate);
    if (!focus || focus < from || focus > to) focus = midpoint(from, to);

    const keyword =
      str(ch.keyword)
        .replace(/["'()]/g, " ")
        .replace(/\b(AND|OR|NOT)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim() || query;

    const sectionRaw = str(ch.section);
    const section =
      sectionRaw && (GUARDIAN_SECTIONS as readonly string[]).includes(sectionRaw)
        ? sectionRaw
        : undefined;

    return {
      index: i,
      arcTag: ARC_STRUCTURE[i].tag,
      arcLabel: str(ch.arcLabel) || ARC_STRUCTURE[i].role,
      dateRange: str(ch.dateRange) || `${from} – ${to}`,
      dateFrom: from,
      dateTo: to,
      focusDate: focus,
      keyword,
      section,
    };
  });
}

export async function planArc(
  query: string,
  evidence: Evidence,
  preferredModel?: string,
  emit?: Emit
): Promise<ArcPlan> {
  const today = todayIso();

  const run = () =>
    generateJson<PlanChapter[]>({
      name: "documentary_plan",
      system: PLAN_SYSTEM,
      prompt: buildPlanPrompt(query, evidence.lines, today),
      schema: PLAN_SCHEMA,
      validate: (raw) => validatePlan(raw, query, today),
      maxTokens: 3000,
      temperature: 0.5,
      preferredModel,
      onAttemptError: (model, err) =>
        emit && log(emit, `⚠ ${model.label}: ${truncate(err.message, 90)}`, "error"),
    });

  const cached = unstable_cache(
    run,
    ["llm-plan", PROMPT_VERSION, query.toLowerCase(), preferredModel ?? "auto", hash(evidence.lines)],
    { revalidate: LLM_CACHE_SECONDS }
  );

  const { data, model } = await cached();
  return { query, chapters: data, evidenceCount: evidence.lines.length, model: toModelRef(model) };
}

// ── Step 3: retrieve + rank per chapter ─────────────────

interface ChapterHarvest {
  plan: PlanChapter;
  total: number;
  scored: ScoredArticle[];
  hero: ScoredArticle | null;
  secondary: ScoredArticle[];
}

async function harvestChapter(
  plan: PlanChapter,
  query: string,
  usedHeroIds: Set<string>,
  emit: Emit
): Promise<ChapterHarvest> {
  const searchWindow = {
    fromDate: plan.dateFrom,
    toDate: plan.dateTo,
    orderBy: "relevance" as const,
    pageSize: 20,
    withBody: true,
  };

  let res = await searchGuardian({ q: plan.keyword, ...searchWindow, section: plan.section });

  if (res.results.length === 0 && plan.section) {
    log(emit, `→ nothing in section "${plan.section}", widening to all sections`, "pending");
    res = await searchGuardian({ q: plan.keyword, ...searchWindow });
  }
  if (res.results.length === 0 && plan.keyword.toLowerCase() !== query.toLowerCase()) {
    log(emit, `→ retrying with "${query}" in the same window`, "pending");
    res = await searchGuardian({ q: query, ...searchWindow });
  }

  const scored = scoreArticles(res.results, {
    dateFrom: plan.dateFrom,
    dateTo: plan.dateTo,
    focusDate: plan.focusDate,
  });

  // The same article never leads two chapters
  const hero = scored.find((s) => !usedHeroIds.has(s.article.id)) ?? null;
  if (hero) usedHeroIds.add(hero.article.id);
  const secondary = scored
    .filter((s) => s !== hero && !usedHeroIds.has(s.article.id))
    .slice(0, 8);

  return { plan, total: res.total, scored, hero, secondary };
}

// ── Step 4: narration (LLM pass 2) ──────────────────────

interface WrittenChapter {
  arcLabel: string;
  synopsis: string;
  insight: string;
}

interface WriteResult {
  subtitle: string;
  interludes: [string, string];
  chapters: WrittenChapter[];
}

function buildMaterial(harvests: ChapterHarvest[]): WriteMaterial[] {
  return harvests.map((h) => {
    const hero = h.hero?.article ?? null;
    const f = hero?.fields ?? {};
    return {
      arcTag: h.plan.arcTag,
      dateRange: h.plan.dateRange,
      keyword: h.plan.keyword,
      matches: h.total,
      hero: hero
        ? {
            date: isoDay(hero.webPublicationDate),
            section: hero.sectionName,
            byline: f.byline ?? "",
            headline: hero.webTitle,
            standfirst: stripHtml(f.standfirst),
            excerpt: firstWords(f.bodyText || stripHtml(f.trailText), 220),
          }
        : null,
      others: h.secondary.slice(0, 7).map((s) => ({
        date: isoDay(s.article.webPublicationDate),
        title: s.article.webTitle,
      })),
    };
  });
}

function validateWrite(raw: unknown, material: WriteMaterial[]): WriteResult {
  const obj = asRecord(raw);
  if (!obj) throw new Error("Narration is not a JSON object");

  const list = Array.isArray(obj.chapters) ? obj.chapters : [];
  if (list.length < 5) throw new Error(`Expected 5 chapters, got ${list.length}`);

  const chapters = list.slice(0, 5).map((item, i): WrittenChapter => {
    const ch = asRecord(item) ?? {};
    const hasMaterial = Boolean(material[i]?.hero);
    return {
      arcLabel: str(ch.arcLabel),
      // Never keep narration for a chapter without sources
      synopsis: hasMaterial ? str(ch.synopsis) : "",
      insight: hasMaterial ? str(ch.insight) : "",
    };
  });

  const interludes = Array.isArray(obj.interludes)
    ? obj.interludes.map(str).filter((s) => s.length > 0)
    : [];

  return {
    subtitle: str(obj.subtitle),
    interludes: [interludes[0] ?? FALLBACK_INTERLUDES[0], interludes[1] ?? FALLBACK_INTERLUDES[1]],
    chapters,
  };
}

async function writeNarration(
  query: string,
  material: WriteMaterial[],
  preferredModel: string | undefined,
  emit: Emit
): Promise<{ data: WriteResult; model: ModelOption }> {
  const run = () =>
    generateJson<WriteResult>({
      name: "documentary_narration",
      system: WRITE_SYSTEM,
      prompt: buildWritePrompt(query, material),
      schema: WRITE_SCHEMA,
      validate: (raw) => validateWrite(raw, material),
      maxTokens: 6000,
      temperature: 0.7,
      preferredModel,
      onAttemptError: (model, err) => log(emit, `⚠ ${model.label}: ${truncate(err.message, 90)}`, "error"),
    });

  return unstable_cache(
    run,
    ["llm-write", PROMPT_VERSION, query.toLowerCase(), preferredModel ?? "auto", hash(material)],
    { revalidate: LLM_CACHE_SECONDS }
  )();
}

// ── Step 5: assemble ────────────────────────────────────

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

function assembleChapter(h: ChapterHarvest, written: WrittenChapter | null): ChapterData {
  const hero = h.hero?.article ?? null;
  const f = hero?.fields ?? {};
  const grounded = Boolean(written?.synopsis);
  const secondary = h.secondary.map(toSource);
  const noiseTitles = secondary.map((s) => s.title.toUpperCase());

  return {
    index: h.plan.index,
    arcTag: h.plan.arcTag,
    arcLabel: written?.arcLabel || h.plan.arcLabel,
    dateRange: h.plan.dateRange,
    keyword: h.plan.keyword,
    headline: hero?.webTitle ?? "Silence in the archive",
    // Fallback is Guardian copy, never ungrounded AI text
    body: grounded && written ? written.synopsis : stripHtml(f.standfirst) || stripHtml(f.trailText),
    grounded,
    insight: written?.insight ?? "",
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
  log(emit, `Query received: "${query}"`, "ok");
  progress(emit, 3);

  // 1. Evidence
  log(emit, "Scanning the Guardian archive for evidence...");
  let evidence: Evidence;
  try {
    evidence = await getEvidence(query);
  } catch (err) {
    throw new PipelineError(`Guardian archive unavailable — ${message(err)}`);
  }
  log(
    emit,
    `→ ${evidence.total.toLocaleString("en-GB")} archive matches · ${evidence.lines.length} dated headlines read`,
    "ok"
  );
  if (evidence.lines.length === 0) {
    log(emit, "→ No direct matches: the plan relies on model knowledge", "pending");
  }
  progress(emit, 12);

  // 2. Plan
  log(emit, "Planning the 5-act arc from real headlines...");
  let plan: ArcPlan;
  try {
    plan = await planArc(query, evidence, preferredModel, emit);
  } catch (err) {
    throw new PipelineError(`Arc planning failed — ${message(err)}`);
  }
  log(emit, `→ Planned by ${plan.model.label}`, "ok");
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

  // 3. Retrieve + rank
  log(emit, `Scorer v3 · ${SCORER_LABEL}`, "pending");
  const usedHeroIds = new Set<string>();
  const harvests: ChapterHarvest[] = [];

  for (const ch of plan.chapters) {
    log(emit, `CH.0${ch.index + 1} ${ch.arcTag} · "${ch.keyword}" · ${ch.dateFrom} → ${ch.dateTo}`);

    let harvest: ChapterHarvest;
    try {
      harvest = await harvestChapter(ch, query, usedHeroIds, emit);
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
    progress(emit, 25 + Math.round(((ch.index + 1) / 5) * 45));
  }

  if (harvests.every((h) => !h.hero)) {
    throw new PipelineError(
      "No Guardian articles found for any chapter. Try a broader or different query."
    );
  }

  // 4. Narration
  log(emit, "Writing narration from the retrieved articles only...");
  const material = buildMaterial(harvests);
  let written: { data: WriteResult; model: ModelOption } | null = null;
  try {
    written = await writeNarration(query, material, plan.model.id, emit);
    const grounded = harvests.filter((h) => h.hero).length;
    log(emit, `→ Narration by ${written.model.label} · grounded in ${grounded} hero articles`, "ok");
  } catch (err) {
    log(
      emit,
      `→ Narration unavailable (${truncate(message(err), 70)}) — showing Guardian standfirsts`,
      "error"
    );
  }
  progress(emit, 92);

  // 5. Assemble
  const chapters = harvests.map((h, i) => assembleChapter(h, written?.data.chapters[i] ?? null));
  const heroScores = chapters.filter((c) => c.guardian.articleId).map((c) => c.score);
  const scannedIds = new Set([
    ...evidence.ids,
    ...harvests.flatMap((h) => h.scored.map((s) => s.article.id)),
  ]);

  const data: DocumentaryData = {
    version: DOC_VERSION,
    query,
    subtitle: written?.data.subtitle || "A documentary excavated from the Guardian archive",
    chapters,
    interludes: written?.data.interludes ?? [FALLBACK_INTERLUDES[0], FALLBACK_INTERLUDES[1]],
    stats: {
      scanned: scannedIds.size,
      archiveMatches: harvests.reduce((sum, h) => sum + h.total, 0),
      avgScore:
        heroScores.length > 0
          ? Math.round(heroScores.reduce((a, b) => a + b, 0) / heroScores.length)
          : 0,
    },
    model: written ? toModelRef(written.model) : plan.model,
    generatedAt: new Date().toISOString(),
  };

  log(emit, "Rendering documentary", "ok");
  progress(emit, 100);
  return data;
}
