import { NextRequest, NextResponse } from "next/server";
import { searchGuardian } from "@/app/utils/guardian-client";
import { scoreArticles } from "@/app/utils/scorer";
import { stripHtml, extractBestImage, firstWords } from "@/app/utils/text";

export const dynamic = "force-dynamic";

/**
 * GET /api/guardian — diagnostic proxy used by /dev.
 *
 * Guardian search + scorer v3, HTML stripped.
 *
 * Query params:
 *   q        — search query (required)
 *   from     — ISO date (optional)
 *   to       — ISO date (optional)
 *   focus    — ISO focal date for the proximity score (optional)
 *   section  — Guardian section filter (optional)
 *   pageSize — default 20, max 50
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Missing required parameter: q" }, { status: 400 });
  }

  const fromDate = searchParams.get("from") || undefined;
  const toDate = searchParams.get("to") || undefined;
  const focusDate = searchParams.get("focus") || undefined;
  const section = searchParams.get("section") || undefined;
  const pageSize = Math.min(50, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20);

  try {
    const { results, total } = await searchGuardian({
      q,
      fromDate,
      toDate,
      section,
      orderBy: "relevance",
      pageSize,
      withBody: true,
    });

    const scored = scoreArticles(results, { dateFrom: fromDate, dateTo: toDate, focusDate });

    const items = scored.map((s) => ({
      id: s.article.id,
      webTitle: s.article.webTitle,
      sectionName: s.article.sectionName,
      webPublicationDate: s.article.webPublicationDate,
      webUrl: s.article.webUrl,
      type: s.article.type,
      score: s.score,
      breakdown: s.breakdown,
      wordcount: s.wordcount,
      hasImage: s.hasImage,
      imageUrl: extractBestImage(s.article.fields?.thumbnail, s.article.fields?.main),
      trailText: stripHtml(s.article.fields?.trailText),
      byline: s.article.fields?.byline ?? "",
      bodyExcerpt: firstWords(s.article.fields?.bodyText, 80),
    }));

    return NextResponse.json({ total, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Guardian API]", message);
    return NextResponse.json(
      { error: "Guardian API request failed", detail: message },
      { status: 502 }
    );
  }
}
