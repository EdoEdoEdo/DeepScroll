import { NextRequest, NextResponse } from "next/server";
import { searchGuardian, fetchArticleBody } from "@/app/utils/guardian-client";
import { scoreArticles } from "@/app/utils/scorer";
import { stripHtml, extractBestImage } from "@/app/utils/text";

/**
 * GET /api/guardian
 *
 * Proxy for The Guardian Content API.
 * Hides API key server-side, adds scorer ranking.
 * Returns clean, pipeline-ready data with HTML stripped.
 *
 * Two-pass strategy:
 *   1. Search + score (lightweight, no bodyText)
 *   2. Fetch bodyText for hero article only (single-item endpoint)
 *
 * Query params:
 *   q         — search query (required)
 *   from      — ISO date string (optional)
 *   to        — ISO date string (optional)
 *   section   — Guardian section filter (optional)
 *   orderBy   — "relevance" | "newest" | "oldest" (default: relevance)
 *   pageSize  — number of results (default: 20, max: 50)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const q = searchParams.get("q");
  if (!q) {
    return NextResponse.json(
      { error: "Missing required parameter: q" },
      { status: 400 }
    );
  }

  const fromDate = searchParams.get("from") ?? undefined;
  const toDate = searchParams.get("to") ?? undefined;
  const section = searchParams.get("section") ?? undefined;
  const orderBy =
    (searchParams.get("orderBy") as "relevance" | "newest" | "oldest") ??
    "relevance";
  const pageSize = Math.min(
    50,
    parseInt(searchParams.get("pageSize") ?? "20", 10) || 20
  );

  try {
    // ── Pass 1: Search + Score (lightweight, no bodyText) ──
    let { results, total, pages } = await searchGuardian({
      q,
      fromDate,
      toDate,
      section,
      orderBy,
      pageSize,
    });

    // Fallback: if section filter yields 0 results, retry without it
    if (results.length === 0 && section) {
      console.log(`[Guardian API] 0 results with section="${section}", retrying without section filter`);
      const fallback = await searchGuardian({
        q,
        fromDate,
        toDate,
        orderBy,
        pageSize,
      });
      results = fallback.results;
      total = fallback.total;
      pages = fallback.pages;
    }

    // Score and rank
    const scored = scoreArticles(results);

    // ── Pass 2: Enrich hero with bodyText (single fetch) ──
    let heroBodyExcerpt = "";
    if (scored.length > 0) {
      heroBodyExcerpt = await fetchArticleBody(scored[0].article.id, 200);
    }

    // Build response items
    const items = scored.map((s, index) => {
      const trailText = stripHtml(s.article.fields?.trailText);
      const standfirst = stripHtml(s.article.fields?.standfirst);

      // Hero gets the rich bodyText excerpt; others get trailText
      const bodyExcerpt =
        index === 0 && heroBodyExcerpt
          ? heroBodyExcerpt
          : trailText || standfirst || "";

      return {
        // Identity
        id: s.article.id,
        webTitle: s.article.webTitle,
        sectionName: s.article.sectionName,
        webPublicationDate: s.article.webPublicationDate,
        webUrl: s.article.webUrl,
        // Scorer
        score: s.score,
        breakdown: s.breakdown,
        wordcount: s.wordcount,
        hasImage: s.hasImage,
        // Content — HTML stripped
        thumbnail: s.article.fields?.thumbnail ?? null,
        imageUrl: extractBestImage(s.article.fields?.thumbnail, s.article.fields?.main),
        trailText,
        standfirst,
        byline: s.article.fields?.byline ?? "",
        // Rich excerpt for Guardian box (hero = bodyText, others = trailText)
        bodyExcerpt,
      };
    });

    return NextResponse.json({ total, pages, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Guardian API]", message);

    return NextResponse.json(
      { error: "Guardian API request failed", detail: message },
      { status: 502 }
    );
  }
}
