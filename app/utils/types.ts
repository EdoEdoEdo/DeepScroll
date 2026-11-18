// ── Arc Narrative Types ─────────────────────────────────

export const ARC_TAGS = [
  "Prelude",
  "Signal",
  "Crisis",
  "Response",
  "Aftermath",
] as const;

export type ArcTag = (typeof ARC_TAGS)[number];

/** Model that served an LLM step */
export interface ModelRef {
  id: string;
  label: string;
}

/**
 * Chapter plan produced by the LLM in a single call:
 * search parameters + narration, from the model's own knowledge.
 */
export interface PlanChapter {
  /** Chapter index 0-4 */
  index: number;
  arcTag: ArcTag;
  /** Short, event-specific label */
  arcLabel: string;
  /** Human-readable window, e.g. "Sep 15 – 20, 2008" */
  dateRange: string;
  /** ISO YYYY-MM-DD — search from */
  dateFrom: string;
  /** ISO YYYY-MM-DD — search to */
  dateTo: string;
  /** ISO YYYY-MM-DD — most significant day inside the window */
  focusDate: string;
  /** Guardian search keyword(s) */
  keyword: string;
  /** Guardian section filter (optional) */
  section?: string;
  /** Narration paragraph (AI) */
  synopsis: string;
  /** Observation about the Guardian coverage (AI) */
  aiHint: string;
}

export interface ArcPlan {
  query: string;
  subtitle: string;
  interludes: [string, string];
  chapters: PlanChapter[];
  model: ModelRef;
}

// ── Guardian API Types ──────────────────────────────────

export interface GuardianFields {
  headline?: string;
  trailText?: string;
  body?: string;
  /** Plain text body — trimmed server-side to the first N words */
  bodyText?: string;
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

export interface ScoreBreakdown {
  relevance: number;
  proximity: number;
  tone: number;
  narrative: number;
  media: number;
}

export interface ScoredArticle {
  /** Original Guardian result */
  article: GuardianResult;
  /** Composite score 0-100 */
  score: number;
  breakdown: ScoreBreakdown;
  /** Parsed word count */
  wordcount: number;
  /** Whether the article has an image */
  hasImage: boolean;
}

// ── Chapter Render Data ─────────────────────────────────

/** A real Guardian article referenced by the documentary */
export interface SourceRef {
  id: string;
  title: string;
  /** ISO publication date */
  date: string;
  section: string;
  url: string;
  byline: string;
}

export interface ChapterData {
  index: number;
  arcTag: ArcTag;
  arcLabel: string;
  dateRange: string;
  keyword: string;
  /** Hero article headline (Guardian copy) */
  headline: string;
  /** Narration — AI voiceover, or the Guardian standfirst as fallback */
  body: string;
  /** true when body is the AI narration, false when it is Guardian copy */
  aiNarration: boolean;
  /** AI observation about the coverage of this window */
  insight: string;
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
  /** Guardian archive matches for this chapter's search */
  archiveMatches: number;
  /** Articles actually downloaded and ranked */
  scanned: number;
  /** Noise text for typographic texture */
  noiseText: string;
  /** Other ranked articles from the same window */
  secondary: SourceRef[];
}

export interface DocumentaryStats {
  /** Unique articles downloaded and ranked */
  scanned: number;
  /** Sum of Guardian archive matches across chapters */
  archiveMatches: number;
  /** Mean hero score across chapters with a hero */
  avgScore: number;
}

export interface DocumentaryData {
  /** Data shape version — bump when this interface changes */
  version: number;
  query: string;
  subtitle: string;
  chapters: ChapterData[];
  /** Dynamic interlude statements (before CH.03 and CH.05) */
  interludes: [string, string];
  stats: DocumentaryStats;
  /** Model that planned and narrated the documentary */
  model: ModelRef | null;
  generatedAt: string;
}

// ── Pipeline Events (NDJSON stream) ─────────────────────

export type LogStatus = "active" | "ok" | "pending" | "error";

export interface LogLine {
  time: string;
  text: string;
  status: LogStatus;
}

export interface ChapterStatus {
  index: number;
  arcTag: ArcTag;
  keyword: string;
  matches: number;
  headline: string | null;
}

/** Planned chapter, sent as soon as the arc is ready (before retrieval) */
export interface PlannedChapter {
  index: number;
  arcTag: ArcTag;
  keyword: string;
  dateRange: string;
}

export type PipelineEvent =
  | { type: "log"; text: string; status: LogStatus }
  | { type: "plan"; chapters: PlannedChapter[] }
  | { type: "progress"; value: number }
  | ({ type: "chapter" } & ChapterStatus)
  | { type: "result"; data: DocumentaryData }
  | { type: "error"; message: string; detail?: string };
