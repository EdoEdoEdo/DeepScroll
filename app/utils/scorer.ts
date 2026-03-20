import type { GuardianResult, ScoredArticle } from "./types";

// ── Weight Configuration ────────────────────────────────

const WEIGHTS = {
  /** Guardian's own relevance ranking */
  relevance: 0.4,
  /** Articles with images score higher */
  media: 0.3,
  /** Longer, more substantive articles score higher */
  narrative: 0.2,
  /** News and analysis tone preferred */
  tone: 0.1,
} as const;

// ── Scoring Functions ───────────────────────────────────

/**
 * Relevance score based on position in Guardian results.
 * First result = 100, decays linearly.
 */
function scoreRelevance(index: number, total: number): number {
  if (total <= 1) return 100;
  return Math.round(100 * (1 - index / total));
}

/**
 * Media score: articles with thumbnail get full marks.
 */
function scoreMedia(article: GuardianResult): number {
  const thumbnail = article.fields?.thumbnail;
  if (thumbnail && thumbnail.length > 0) return 100;
  return 0;
}

/**
 * Narrative density score based on word count.
 * < 500 words = penalized (likely wire copy or snippet)
 * 500-1200 = decent
 * > 1200 = long-read bonus
 */
function scoreNarrative(article: GuardianResult): number {
  const wc = parseWordcount(article);
  if (wc < 300) return 10;
  if (wc < 500) return 30;
  if (wc < 800) return 60;
  if (wc < 1200) return 80;
  return 100; // long-read
}

/**
 * Tone score: news and analysis preferred over liveblog, gallery, etc.
 * Uses both `type` field and tone tags.
 */
function scoreTone(article: GuardianResult): number {
  // Prefer standard articles over liveblogs, galleries, etc.
  const typeScores: Record<string, number> = {
    article: 100,
    liveblog: 40,
    interactive: 60,
    gallery: 30,
    video: 50,
    audio: 50,
  };
  let base = typeScores[article.type] ?? 50;

  // Bonus for tone tags: news and analysis are preferred
  const toneTags = article.tags?.filter((t) => t.type === "tone") ?? [];
  for (const tag of toneTags) {
    const id = tag.id.toLowerCase();
    if (id.includes("analysis") || id.includes("comment")) {
      base = Math.min(100, base + 15);
    }
    if (id.includes("news")) {
      base = Math.min(100, base + 10);
    }
    if (id.includes("letters") || id.includes("obituaries")) {
      base = Math.max(0, base - 20);
    }
  }

  return base;
}

// ── Utilities ───────────────────────────────────────────

function parseWordcount(article: GuardianResult): number {
  const raw = article.fields?.wordcount;
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 0 : parsed;
}

// ── Main Scorer ─────────────────────────────────────────

/**
 * Score and rank an array of Guardian results.
 * Deduplicates by article ID first, then scores.
 * Returns sorted by score descending — first item is the "hero".
 */
export function scoreArticles(
  articles: GuardianResult[]
): ScoredArticle[] {
  // Deduplicate by article ID — Guardian can return the same article
  // with different rankings when keywords match multiple fields
  const seen = new Set<string>();
  const unique = articles.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  const scored = unique.map((article, index) => {
    const relevance = scoreRelevance(index, articles.length);
    const media = scoreMedia(article);
    const narrative = scoreNarrative(article);
    const tone = scoreTone(article);

    const composite = Math.round(
      relevance * WEIGHTS.relevance +
        media * WEIGHTS.media +
        narrative * WEIGHTS.narrative +
        tone * WEIGHTS.tone
    );

    return {
      article,
      score: composite,
      breakdown: { relevance, media, narrative, tone },
      wordcount: parseWordcount(article),
      hasImage: Boolean(article.fields?.thumbnail),
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}
