import { NextRequest, NextResponse } from "next/server";
import { extractBestImage } from "@/app/utils/text";

const GUARDIAN_BASE = "https://content.guardianapis.com";

/**
 * GET /api/guardian/article?id=world/2008/sep/15/...
 *
 * Fetches a single Guardian article with full body HTML
 * for the article overlay view.
 */
export async function GET(request: NextRequest) {
  const articleId = request.nextUrl.searchParams.get("id");
  if (!articleId) {
    return NextResponse.json(
      { error: "Missing required parameter: id" },
      { status: 400 }
    );
  }

  const apiKey = process.env.GUARDIAN_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GUARDIAN_API_KEY not configured" },
      { status: 500 }
    );
  }

  const url = new URL(`${GUARDIAN_BASE}/${articleId}`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set(
    "show-fields",
    "body,headline,byline,standfirst,thumbnail,main,wordcount"
  );

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Guardian API error ${res.status}`, detail: text.slice(0, 200) },
        { status: 502 }
      );
    }

    const data = await res.json();
    const content = data?.response?.content;
    if (!content) {
      return NextResponse.json(
        { error: "Article not found" },
        { status: 404 }
      );
    }

    const fields = content.fields ?? {};

    return NextResponse.json({
      id: content.id,
      webTitle: content.webTitle,
      webUrl: content.webUrl,
      webPublicationDate: content.webPublicationDate,
      sectionName: content.sectionName,
      headline: fields.headline ?? content.webTitle,
      byline: fields.byline ?? "",
      standfirst: fields.standfirst ?? "",
      wordcount: fields.wordcount ? parseInt(fields.wordcount, 10) : 0,
      imageUrl: extractBestImage(fields.thumbnail, fields.main),
      body: fields.body ?? "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch article", detail: message },
      { status: 502 }
    );
  }
}
