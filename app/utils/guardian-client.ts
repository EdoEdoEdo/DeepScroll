import type { GuardianSearchResponse, GuardianResult } from "./types";

const GUARDIAN_BASE = "https://content.guardianapis.com";

export interface GuardianSearchParams {
  q: string;
  fromDate?: string;
  toDate?: string;
  section?: string;
  orderBy?: "relevance" | "newest" | "oldest";
  pageSize?: number;
  page?: number;
}

/**
 * Build the full Guardian API URL with all parameters.
 * API key is injected server-side from env.
 */
function buildUrl(params: GuardianSearchParams): string {
  const apiKey = process.env.GUARDIAN_API_KEY;
  if (!apiKey) {
    throw new Error("GUARDIAN_API_KEY is not set in environment variables");
  }

  const url = new URL(`${GUARDIAN_BASE}/search`);
  url.searchParams.set("q", params.q);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("order-by", params.orderBy ?? "relevance");
  url.searchParams.set("page-size", String(params.pageSize ?? 20));
  url.searchParams.set("page", String(params.page ?? 1));

  // Fields we need for scoring + display
  // main = higher-res image HTML (contains <img> tag with full-size src)
  // thumbnail = small preview image (~500px)
  url.searchParams.set(
    "show-fields",
    "headline,trailText,thumbnail,main,wordcount,byline,standfirst,shortUrl"
  );
  // Tags for tone scoring
  url.searchParams.set("show-tags", "tone,keyword");

  if (params.fromDate) url.searchParams.set("from-date", params.fromDate);
  if (params.toDate) url.searchParams.set("to-date", params.toDate);
  if (params.section) url.searchParams.set("section", params.section);

  return url.toString();
}

/**
 * Fetch articles from Guardian Content API.
 * Runs server-side only (uses API key from env).
 */
export async function searchGuardian(
  params: GuardianSearchParams
): Promise<{
  results: GuardianResult[];
  total: number;
  pages: number;
}> {
  const url = buildUrl(params);

  const res = await fetch(url, {
    next: { revalidate: 3600 }, // cache for 1 hour
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Guardian API error ${res.status}: ${text.slice(0, 200)}`
    );
  }

  const data: GuardianSearchResponse = await res.json();

  return {
    results: data.response.results,
    total: data.response.total,
    pages: data.response.pages,
  };
}

/**
 * Fetch a single article by ID to get its bodyText.
 * Used after scoring to enrich only the hero article.
 *
 * Guardian single-item endpoint: GET /{article_id}
 * Returns the first ~maxWords of bodyText as plain text.
 */
export async function fetchArticleBody(
  articleId: string,
  maxWords: number = 200
): Promise<string> {
  const apiKey = process.env.GUARDIAN_API_KEY;
  if (!apiKey) return "";

  const url = new URL(`${GUARDIAN_BASE}/${articleId}`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("show-fields", "bodyText");

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    });

    if (!res.ok) return "";

    const data = await res.json();
    const bodyText: string = data?.response?.content?.fields?.bodyText ?? "";

    if (!bodyText) return "";

    // Extract first N words
    const words = bodyText.trim().split(/\s+/);
    const excerpt = words.slice(0, maxWords).join(" ");
    return words.length > maxWords ? `${excerpt}...` : excerpt;
  } catch {
    return "";
  }
}
