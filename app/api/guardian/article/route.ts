import { NextRequest, NextResponse } from "next/server";
import { fetchArticle, isValidArticleId } from "@/app/utils/guardian-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/guardian/article?id=world/2008/sep/15/...
 *
 * Single Guardian article with full body HTML (sanitized server-side)
 * for the article overlay view. Cached for a week.
 */
export async function GET(request: NextRequest) {
  const articleId = request.nextUrl.searchParams.get("id")?.trim();
  if (!articleId) {
    return NextResponse.json({ error: "Missing required parameter: id" }, { status: 400 });
  }
  if (!isValidArticleId(articleId)) {
    return NextResponse.json({ error: "Invalid article id" }, { status: 400 });
  }

  try {
    const article = await fetchArticle(articleId);
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }
    return NextResponse.json(article);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch article", detail: message },
      { status: 502 }
    );
  }
}
