// ── Arc Narrative Types ─────────────────────────────────

export const ARC_TAGS = [
  "Prelude",
  "Signal",
  "Crisis",
  "Response",
  "Aftermath",
] as const;

export type ArcTag = (typeof ARC_TAGS)[number];

export interface ArcChapter {
  /** Chapter index 0-4 */
  index: number;
  /** Narrative arc tag */
  arcTag: ArcTag;
  /** Descriptive arc label, e.g. "Lehman, 1:45 AM" */
  arcLabel: string;
  /** Date range for this chapter, e.g. "2006 – 2007" */
  dateRange: string;
  /** Guardian search keyword(s) for this chapter */
  keyword: string;
  /** ISO date string — search from */
  dateFrom: string;
  /** ISO date string — search to */
  dateTo: string;
  /** Guardian section filter (optional) */
  section?: string;
  /** Rich narrative body text (3-5 sentences) */
  synopsis: string;
  /** AI analysis hint — seed for the AI block */
  aiHint: string;
}

export interface ArcPlan {
  /** Original user query */
  query: string;
  /** Documentary subtitle */
  subtitle: string;
  /** The 5 chapters */
  chapters: ArcChapter[];
  /** Dynamic interlude statements specific to this story (2 items) */
  interludes: [string, string];
}

// ── Guardian API Types ──────────────────────────────────

export interface GuardianFields {
  headline?: string;
  trailText?: string;
  body?: string;
  thumbnail?: string;
  /** HTML containing higher-res <img> tag */
  main?: string;
  wordcount?: string;
  byline?: string;
  standfirst?: string;
  shortUrl?: string;
}

export interface GuardianTag {
  id: string;
  type: string;
  webTitle: string;
  sectionId?: string;
}

export interface GuardianResult {
  id: string;
  type: string;
  sectionId: string;
  sectionName: string;
  webPublicationDate: string;
  webTitle: string;
  webUrl: string;
  apiUrl: string;
  fields?: GuardianFields;
  tags?: GuardianTag[];
}

export interface GuardianSearchResponse {
  response: {
    status: string;
    userTier: string;
    total: number;
    startIndex: number;
    pageSize: number;
    currentPage: number;
    pages: number;
    orderBy: string;
    results: GuardianResult[];
  };
}

// ── Scorer Types ────────────────────────────────────────

export interface ScoredArticle {
  /** Original Guardian result */
  article: GuardianResult;
  /** Composite score 0-100 */
  score: number;
  /** Breakdown */
  breakdown: {
    relevance: number;
    media: number;
    narrative: number;
    tone: number;
  };
  /** Parsed word count */
  wordcount: number;
  /** Whether the article has an image */
  hasImage: boolean;
}

// ── Chapter Render Data ─────────────────────────────────

export interface ChapterData {
  index: number;
  arcTag: ArcTag;
  arcLabel: string;
  dateRange: string;
  /** Hero article headline (from Guardian) */
  headline: string;
  /** AI narrative body text */
  body: string;
  /** AI corpus analysis */
  aiAnalysis: string;
  /** Guardian attribution */
  guardian: {
    excerpt: string;
    date: string;
    section: string;
    url: string;
    byline: string;
    /** Guardian article ID for single-item fetch */
    articleId: string;
  };
  /** Scorer result */
  score: number;
  wordcount: number;
  /** Image URL if available */
  imageUrl: string | null;
  /** Noise text for typographic fallback */
  noiseText: string;
  /** Secondary article titles for marquee */
  secondaryTitles: string[];
}

export interface DocumentaryData {
  query: string;
  subtitle: string;
  chapters: ChapterData[];
  totalArticlesAnalyzed: number;
  avgScore: number;
  generatedAt: string;
  /** Dynamic interlude statements */
  interludes: [string, string];
}
