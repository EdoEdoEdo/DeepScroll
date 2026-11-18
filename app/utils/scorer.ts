import type { GuardianResult, ScoredArticle } from "./types";

// ── Weight Configuration ────────────────────────────────

/**
 * Scorer v3 — picks the best primary source for a chapter window.
 * Media used to weigh 30%, but nearly every Guardian article has a
 * thumbnail, so it decided nothing; date proximity now does the work.
 */
export const WEIGHTS = {
  /** Guardian's own relevance ranking — the strongest signal, as in v1 */
  relevance: 0.5,
  /** Closeness to the chapter's focal date (a tie-breaker, not a driver) */
  proximity: 0.1,
  /** Reported news preferred over opinion, letters, galleries */
  tone: 0.15,
  /** Substantive length, not wire snippets nor 5,000-word essays */
  narrative: 0.15,
  /** Has a usable image */
  media: 0.1,
} as const;

/** Human-readable weights, for logs and the info panel */
export const SCORER_LABEL = "Relevance 50% · Tone 15% · Density 15% · Date proximity 10% · Media 10%";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScoreContext {
  dateFrom?: string;
  dateTo?: string;
  focusDate?: string;
  /** Words of the documentary topic (lower case): articles naming it get a bonus */
  topicTerms?: string[];
}

/*
 * Ranking hints only — they reorder the Guardian results, they never
 * remove one: a chapter is silent only when the archive is.
 */

/** Sections that rarely make a good primary source for a news documentary */
const SOFT_SECTIONS = new Set([
  "music", "culture", "film", "books", "tv-and-radio", "stage", "artanddesign",
  "lifeandstyle", "fashion", "food", "travel", "games", "crosswords", "money",
]);
/** Points removed from the final score (≈5 positions in a 20-result list) */
const SOFT_SECTION_PENALTY = 12;

/** Points added when the headline or standfirst names the topic */
const TOPIC_BONUS = 15;

/** Live blogs cover a whole day of news: unless their headline names the topic */
const LIVEBLOG_PENALTY = 12;

function headlineText(article: GuardianResult): string {
  return `${article.webTitle} ${article.fields?.trailText ?? ""} ${article.fields?.standfirst ?? ""}`.toLowerCase();
}

/** Headline, trail or standfirst contain every topic word */
function mentionsTopic(article: GuardianResult, terms: string[]): boolean {
  const text = headlineText(article);
  return terms.length > 0 && terms.every((t) => text.includes(t));
}

/** A live blog whose own headline is about something else */
function isOffTopicLiveblog(article: GuardianResult, terms: string[]): boolean {
  if (article.type !== "liveblog" || terms.length === 0) return false;
  const title = article.webTitle.toLowerCase();
  return !terms.every((t) => title.includes(t));
}

// ── Scoring Functions ───────────────────────────────────

/** Position in Guardian results: first = 100, linear decay */
function scoreRelevance(index: number, count: number): number {
  if (count <= 1) return 100;
  return Math.round(100 * (1 - index / count));
}

/** 100 on the focal date, 0 at a full window-width away */
function scoreProximity(article: GuardianResult, ctx: ScoreContext): number {
  // Compare calendar days: anything published on the focal day scores 100
  const published = Date.parse(article.webPublicationDate.slice(0, 10));
  const focus = Date.parse(ctx.focusDate ?? "");
  if (Number.isNaN(published) || Number.isNaN(focus)) return 50;

  const from = Date.parse(ctx.dateFrom ?? "");
  const to = Date.parse(ctx.dateTo ?? "");
  const span = !Number.isNaN(from) && !Number.isNaN(to) ? Math.max(DAY_MS, to - from) : 30 * DAY_MS;

  const distance = Math.abs(published - focus);
  return Math.round(100 * Math.max(0, 1 - distance / span));
}

/** Content type + tone tags */
function scoreTone(article: GuardianResult): number {
  const typeScores: Record<string, number> = {
    article: 100,
    liveblog: 70,
    interactive: 60,
    video: 40,
    audio: 40,
    gallery: 30,
    picture: 30,
  };
  let score = typeScores[article.type] ?? 50;

  const toneTags = article.tags?.filter((t) => t.type === "tone") ?? [];
  for (const tag of toneTags) {
    const id = tag.id.toLowerCase();
    if (id.endsWith("/news")) score += 5;
    else if (id.endsWith("/analysis")) score += 5;
    else if (id.endsWith("/comment")) score -= 15;
    else if (id.endsWith("/editorials")) score -= 10;
    else if (id.endsWith("/obituaries")) score -= 25;
    else if (id.endsWith("/letters")) score -= 40;
    else if (id.endsWith("/reviews")) score -= 40;
  }

  return Math.max(0, Math.min(100, score));
}

/** Word count curve: peak between 700 and 1,600 words */
function scoreNarrative(wordcount: number): number {
  if (wordcount === 0) return 40; // unknown (liveblogs, galleries)
  if (wordcount < 200) return 20;
  if (wordcount < 400) return 50;
  if (wordcount < 700) return 80;
  if (wordcount <= 1600) return 100;
  if (wordcount <= 3000) return 80;
  return 60;
}

function scoreMedia(article: GuardianResult): number {
  const hasImage = Boolean(article.fields?.thumbnail) || /<img/i.test(article.fields?.main ?? "");
  return hasImage ? 100 : 0;
}

// ── Utilities ───────────────────────────────────────────

function parseWordcount(article: GuardianResult): number {
  const raw = article.fields?.wordcount;
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// ── Main Scorer ─────────────────────────────────────────

/**
 * Score and rank Guardian results for a chapter window.
 * Deduplicates by article ID first. Returns sorted by score descending.
 */
export function scoreArticles(
  articles: GuardianResult[],
  ctx: ScoreContext = {}
): ScoredArticle[] {
  const seen = new Set<string>();
  const unique = articles.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  const terms = ctx.topicTerms ?? [];
  const scored = unique.map((article, index) => {
    const wordcount = parseWordcount(article);
    const breakdown = {
      relevance: scoreRelevance(index, unique.length),
      proximity: scoreProximity(article, ctx),
      tone: scoreTone(article),
      narrative: scoreNarrative(wordcount),
      media: scoreMedia(article),
    };

    const raw =
      (mentionsTopic(article, terms) ? TOPIC_BONUS : 0) -
      (isOffTopicLiveblog(article, terms) ? LIVEBLOG_PENALTY : 0) -
      (SOFT_SECTIONS.has(article.sectionId) ? SOFT_SECTION_PENALTY : 0) +
      breakdown.relevance * WEIGHTS.relevance +
      breakdown.proximity * WEIGHTS.proximity +
      breakdown.tone * WEIGHTS.tone +
      breakdown.narrative * WEIGHTS.narrative +
      breakdown.media * WEIGHTS.media;

    return {
      raw,
      result: {
        article,
        score: Math.max(0, Math.min(100, Math.round(raw))),
        breakdown,
        wordcount,
        hasImage: breakdown.media > 0,
      },
    };
  });

  // Sort on the unrounded value so near-ties don't fall back to input order
  return scored.sort((a, b) => b.raw - a.raw).map((s) => s.result);
}
