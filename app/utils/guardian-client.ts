/**
 * Guardian Content API client — server only.
 *
 * - Throttled: requests are spaced to GUARDIAN_MAX_RPS (default 1/s,
 *   the limit of recent developer keys), with retry on HTTP 429.
 * - Cached: results go through Next's data cache (unstable_cache), so
 *   a repeated query costs no API calls — and cache hits skip the throttle.
 */
import { unstable_cache } from "next/cache";
import type { GuardianResult, GuardianSearchResponse } from "./types";
import { extractBestImage, firstWords, sanitizeHtml } from "./text";

const GUARDIAN_BASE = "https://content.guardianapis.com";

/** Bump to invalidate cached Guardian responses */
const CACHE_VERSION = "g2";

/** The archive is historical: a week of cache is safe */
const CACHE_SECONDS = 60 * 60 * 24 * 7;

/** bodyText kept per article in search results (keeps cache entries small) */
const BODY_WORDS = 320;

export class GuardianError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GuardianError";
  }
}

// ── Throttle ────────────────────────────────────────────

const MAX_RPS = Math.max(0.2, Number(process.env.GUARDIAN_MAX_RPS) || 1);
const MIN_INTERVAL_MS = Math.ceil(1000 / MAX_RPS);
let nextSlot = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reserve the next request slot (per server instance) */
async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await sleep(wait);
}

function getKey(): string {
  const key = process.env.GUARDIAN_API_KEY?.trim();
  if (!key) throw new GuardianError(500, "GUARDIAN_API_KEY is not set");
  return key;
}

async function guardianFetch<T>(url: URL, attempt = 0): Promise<T> {
  await throttle();
  const res = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 429 && attempt < 2) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : (attempt + 1) * 2;
    await sleep(Math.min(seconds, 8) * 1000);
    return guardianFetch<T>(url, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const reason = res.status === 429 ? "rate limit reached" : text.slice(0, 160);
    throw new GuardianError(res.status, `Guardian API ${res.status}: ${reason}`);
  }

  return (await res.json()) as T;
}

// ── Search ──────────────────────────────────────────────

export interface GuardianSearchParams {
  q: string;
  fromDate?: string;
  toDate?: string;
  section?: string;
  orderBy?: "relevance" | "newest" | "oldest";
  pageSize?: number;
  /** Include the first words of bodyText for each result */
  withBody?: boolean;
}

export interface GuardianSearchResult {
  results: GuardianResult[];
  total: number;
}

async function searchUncached(params: GuardianSearchParams): Promise<GuardianSearchResult> {
  const url = new URL(`${GUARDIAN_BASE}/search`);
  url.searchParams.set("q", params.q);
  url.searchParams.set("api-key", getKey());
  url.searchParams.set("order-by", params.orderBy ?? "relevance");
  url.searchParams.set("page-size", String(Math.min(50, params.pageSize ?? 20)));

  const fields = ["headline", "trailText", "thumbnail", "main", "wordcount", "byline", "standfirst"];
  if (params.withBody) fields.push("bodyText");
  url.searchParams.set("show-fields", fields.join(","));
  url.searchParams.set("show-tags", "tone");

  if (params.fromDate) url.searchParams.set("from-date", params.fromDate);
  if (params.toDate) url.searchParams.set("to-date", params.toDate);
  if (params.section) url.searchParams.set("section", params.section);

  const data = await guardianFetch<GuardianSearchResponse>(url);
  const response = data.response;

  // Trim heavy fields so cache entries stay small
  const results = (response.results ?? []).map((r) => ({
    ...r,
    fields: r.fields
      ? {
          ...r.fields,
          bodyText: r.fields.bodyText ? firstWords(r.fields.bodyText, BODY_WORDS) : undefined,
        }
      : undefined,
  }));

  return { results, total: response.total ?? 0 };
}

export const searchGuardian = unstable_cache(searchUncached, ["guardian-search", CACHE_VERSION], {
  revalidate: CACHE_SECONDS,
});

// ── Single article (overlay) ────────────────────────────

export interface GuardianArticle {
  id: string;
  webTitle: string;
  webUrl: string;
  webPublicationDate: string;
  sectionName: string;
  headline: string;
  byline: string;
  standfirst: string;
  wordcount: number;
  imageUrl: string | null;
  body: string;
}

/** Guardian content IDs look like "world/2008/sep/15/lehman-brothers" */
export function isValidArticleId(id: string): boolean {
  return /^[a-z0-9][a-z0-9\-_/]*$/i.test(id) && !id.includes("..") && id.length < 300;
}

async function fetchArticleUncached(articleId: string): Promise<GuardianArticle | null> {
  if (!isValidArticleId(articleId)) throw new GuardianError(400, "Invalid article id");

  const url = new URL(`${GUARDIAN_BASE}/${articleId}`);
  url.searchParams.set("api-key", getKey());
  url.searchParams.set("show-fields", "body,headline,byline,standfirst,thumbnail,main,wordcount");

  const data = await guardianFetch<{
    response?: {
      content?: GuardianResult;
    };
  }>(url);

  const content = data.response?.content;
  if (!content) return null;
  const fields = content.fields ?? {};

  return {
    id: content.id,
    webTitle: content.webTitle,
    webUrl: content.webUrl,
    webPublicationDate: content.webPublicationDate,
    sectionName: content.sectionName,
    headline: fields.headline ?? content.webTitle,
    byline: fields.byline ?? "",
    standfirst: sanitizeHtml(fields.standfirst),
    wordcount: fields.wordcount ? parseInt(fields.wordcount, 10) || 0 : 0,
    imageUrl: extractBestImage(fields.thumbnail, fields.main),
    body: sanitizeHtml(fields.body),
  };
}

export const fetchArticle = unstable_cache(fetchArticleUncached, ["guardian-article", CACHE_VERSION], {
  revalidate: CACHE_SECONDS,
});

// ── Health ──────────────────────────────────────────────

/** Uncached connectivity check; also returns any rate-limit headers */
export async function checkGuardian(): Promise<{
  ok: boolean;
  detail: string;
  rateLimit: Record<string, string>;
}> {
  let key: string;
  try {
    key = getKey();
  } catch {
    return { ok: false, detail: "GUARDIAN_API_KEY not set", rateLimit: {} };
  }

  try {
    const res = await fetch(`${GUARDIAN_BASE}/search?q=test&page-size=1&api-key=${key}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const rateLimit: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      if (name.toLowerCase().includes("ratelimit")) rateLimit[name] = value;
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 100)}`, rateLimit };
    }
    const data = (await res.json()) as GuardianSearchResponse;
    return {
      ok: true,
      detail: `Connected — ${data.response.total.toLocaleString("en-GB")} articles · throttle ${MAX_RPS} req/s`,
      rateLimit,
    };
  } catch (err) {
    return {
      ok: false,
      detail: `Network error: ${err instanceof Error ? err.message : "unknown"}`,
      rateLimit: {},
    };
  }
}
