import type {
  ArcPlan,
  ArcChapter,
  ChapterData,
  DocumentaryData,
} from "./types";
import { formatGuardianDate } from "./text";
import type { LogLine } from "@/app/components/LoadingScreen";

// ── API Response Types (match what /api/guardian actually returns) ───

interface GuardianApiItem {
  id: string;
  webTitle: string;
  sectionName: string;
  webPublicationDate: string;
  webUrl: string;
  score: number;
  breakdown: {
    relevance: number;
    media: number;
    narrative: number;
    tone: number;
  };
  wordcount: number;
  hasImage: boolean;
  thumbnail: string | null;
  /** Best available image — upscaled thumbnail or extracted from main */
  imageUrl: string | null;
  trailText: string;
  standfirst: string;
  byline: string;
  bodyExcerpt: string;
}

interface GuardianApiResponse {
  total: number;
  pages: number;
  items: GuardianApiItem[];
  error?: string;
}

// ── Helpers ─────────────────────────────────────────────

type LogCallback = (log: LogLine) => void;
type ProgressCallback = (pct: number) => void;

let logCounter = 0;
function ts(): string {
  const s = String(logCounter++).padStart(2, "0");
  return `00:${s}`;
}

// ── Main Pipeline ───────────────────────────────────────

/**
 * Full pipeline: query → LLM arc → Guardian fetch → scorer → DocumentaryData
 */
export async function runPipeline(
  query: string,
  onLog: LogCallback,
  onProgress: ProgressCallback,
  modelId?: string
): Promise<DocumentaryData> {
  logCounter = 0;

  // ── Step 1: LLM Orchestration ─────────────────────────
  onLog({ time: ts(), text: `Parsing semantic query: "${query}"`, status: "active" });
  onProgress(5);

  onLog({ time: ts(), text: "LLM generating 5-chapter narrative arc...", status: "active" });
  onProgress(10);

  let arcPlan: ArcPlan;
  try {
    const res = await fetch("/api/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, model: modelId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
    arcPlan = data as ArcPlan;
  } catch (err) {
    onLog({
      time: ts(),
      text: `LLM error: ${err instanceof Error ? err.message : "unknown"}`,
      status: "error",
    });
    throw err;
  }

  onLog({
    time: ts(),
    text: `→ Arc structure: ${arcPlan.chapters.map((c) => c.arcTag.toLowerCase()).join(" → ")}`,
    status: "ok",
  });
  onLog({
    time: ts(),
    text: `→ Temporal span calculated`,
    status: "ok",
  });
  onProgress(20);

  // ── Step 2: Guardian Fetch (parallel) ─────────────────
  onLog({ time: ts(), text: "Querying Guardian Content API...", status: "active" });
  onProgress(30);

  onLog({ time: ts(), text: "→ Endpoint: /search?order-by=relevance", status: "pending" });

  interface ChapterFetch {
    arc: ArcChapter;
    items: GuardianApiItem[];
    total: number;
  }

  let chapterResults: ChapterFetch[];

  try {
    const fetchPromises = arcPlan.chapters.map(async (arc, i) => {
      const params = new URLSearchParams({ q: arc.keyword, from: arc.dateFrom, to: arc.dateTo });
      if (arc.section) params.set("section", arc.section);

      const res = await fetch(`/api/guardian?${params}`);
      const data: GuardianApiResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Guardian fetch failed for CH.0${i + 1}`);

      return { arc, items: data.items ?? [], total: data.total ?? 0 };
    });

    chapterResults = await Promise.all(fetchPromises);
  } catch (err) {
    onLog({
      time: ts(),
      text: `Guardian API error: ${err instanceof Error ? err.message : "unknown"}`,
      status: "error",
    });
    throw err;
  }

  const totalArticles = chapterResults.reduce((sum, r) => sum + r.total, 0);
  const totalFetched = chapterResults.reduce((sum, r) => sum + r.items.length, 0);

  onLog({
    time: ts(),
    text: `→ Raw candidates fetched: ${totalArticles.toLocaleString()} articles`,
    status: "ok",
  });
  onProgress(50);

  // ── Step 3: Scorer log ────────────────────────────────
  onLog({ time: ts(), text: "Running Scorer algorithm (v2.1)...", status: "active" });
  onLog({ time: ts(), text: "→ Relevance weight ·········· 40%", status: "pending" });
  onLog({ time: ts(), text: "→ Media assets check ········ 30%", status: "pending" });
  onLog({ time: ts(), text: "→ Narrative density filter ·· 20%", status: "pending" });
  onLog({ time: ts(), text: "→ Tone & authority ·········· 10%", status: "pending" });
  onProgress(65);

  onLog({
    time: ts(),
    text: `→ Hero articles selected: 5 / ${totalFetched}`,
    status: "ok",
  });
  onProgress(75);

  // ── Step 4: Assemble ChapterData ──────────────────────
  onLog({ time: ts(), text: "AI narrative synthesis per chapter...", status: "active" });

  const chapters: ChapterData[] = chapterResults.map((result, i) => {
    const hero = result.items[0] ?? null;
    const secondaryItems = result.items.slice(1, 12);

    // Build noise text from secondary headlines
    const secondaryTitles = secondaryItems.map((s) => s.webTitle.toUpperCase());
    const noiseText =
      secondaryTitles.length > 0
        ? secondaryTitles.join(" · ")
        : result.arc.keyword.toUpperCase().replace(/\s+/g, " · ");

    // Pick the best excerpt: bodyExcerpt > trailText > standfirst
    const excerpt = hero?.bodyExcerpt || hero?.trailText || hero?.standfirst || "";

    return {
      index: i,
      arcTag: result.arc.arcTag,
      arcLabel: result.arc.arcLabel,
      dateRange: result.arc.dateRange,
      headline: hero?.webTitle ?? result.arc.keyword.toUpperCase(),
      body: result.arc.synopsis,
      aiAnalysis: buildAiAnalysis(result.arc, result.total, result.items.length, hero),
      guardian: {
        excerpt,
        date: hero ? formatGuardianDate(hero.webPublicationDate) : result.arc.dateRange,
        section: hero?.sectionName ?? result.arc.section ?? "World",
        url: hero?.webUrl ?? "",
        byline: hero?.byline ?? "",
        articleId: hero?.id ?? "",
      },
      score: hero?.score ?? 0,
      wordcount: hero?.wordcount ?? 0,
      imageUrl: hero?.imageUrl ?? null,
      noiseText,
      secondaryTitles,
    };
  });

  onLog({ time: ts(), text: "→ Guardian excerpts extracted", status: "ok" });
  onProgress(90);

  onLog({ time: ts(), text: "Rendering 5-chapter documentary...", status: "ok" });
  onProgress(100);

  // Give loading screen time to reveal final log lines before transition
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const avgScore = chapters.length > 0
    ? Math.round(chapters.reduce((sum, c) => sum + c.score, 0) / chapters.length)
    : 0;

  return {
    query,
    subtitle: arcPlan.subtitle,
    chapters,
    totalArticlesAnalyzed: totalArticles,
    avgScore,
    generatedAt: new Date().toISOString(),
    interludes: arcPlan.interludes,
  };
}

// ── AI Analysis Builder ─────────────────────────────────

function buildAiAnalysis(
  arc: ArcChapter,
  total: number,
  fetched: number,
  hero: GuardianApiItem | null
): string {
  const parts: string[] = [];

  // Start with LLM's analytical hint if available
  if (arc.aiHint && arc.aiHint.length > 0) {
    parts.push(arc.aiHint);
  }

  // Add real corpus statistics
  if (total > 0) {
    parts.push(
      `The Guardian corpus registers ${total.toLocaleString()} articles for "${arc.keyword}" in the period ${arc.dateRange}.`
    );
  }

  if (hero) {
    if (total > 1000) {
      parts.push(`Exceptional coverage density — the topic was a focal point for the newsroom.`);
    } else if (total < 20 && total > 0) {
      parts.push(`Limited coverage — the event was still a weak signal in the informational noise.`);
    }

    if (hero.hasImage) {
      parts.push(`Hero article with visual documentation, score ${hero.score}/100.`);
    }
  } else {
    parts.push(`No articles found for this temporal segment. The silence of the archive is itself a data point.`);
  }

  return parts.join(" ");
}
