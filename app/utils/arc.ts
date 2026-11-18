import type { ArcTag } from "./types";
import presetsJson from "./presets.json";

/** Data shape version of DocumentaryData (pre-generated presets must match) */
export const DOC_VERSION = 3;

/** Version shown in the UI */
export const APP_VERSION = "v2.1.1";

/**
 * Narrative arc structure — fixed 5-chapter dramaturgy.
 */
export const ARC_STRUCTURE: Array<{
  index: number;
  tag: ArcTag;
  role: string;
  description: string;
}> = [
  {
    index: 0,
    tag: "Prelude",
    role: "Context before the event",
    description:
      "The world before the crisis. Systemic blindness, ignored warnings, false normalcy.",
  },
  {
    index: 1,
    tag: "Signal",
    role: "First ignored indicator",
    description:
      "The first visible crack. A specific event that marks the beginning in retrospect.",
  },
  {
    index: 2,
    tag: "Crisis",
    role: "The breaking point",
    description:
      "The moment of collapse. Maximum coverage density, maximum impact.",
  },
  {
    index: 3,
    tag: "Response",
    role: "Institutional/human reaction",
    description:
      "How the system responds. Bailouts, political decisions, mobilization.",
  },
  {
    index: 4,
    tag: "Aftermath",
    role: "The bill comes due",
    description:
      "Long-term impact, structural changes, lessons learned or ignored.",
  },
];

/**
 * Fallback interlude quotes — used if the writer doesn't provide them.
 */
export const FALLBACK_INTERLUDES = [
  "Every article you are reading is real.",
  "History is not invented — it is excavated.",
] as const;

/**
 * Chapter indices before which an interlude is shown.
 * (Before chapter 3 and chapter 5, i.e. indices 2 and 4)
 */
export const INTERLUDE_BEFORE = [2, 4] as const;

// ── Presets ─────────────────────────────────────────────

export interface Preset {
  label: string;
  query: string;
}

export const PRESETS: Preset[] = presetsJson.items;

/**
 * URL-safe slug — must stay identical to slugify() in
 * scripts/generate-presets.mjs (pre-generated files are named with it).
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Preset matching a query (case/spacing-insensitive), if any */
export function findPreset(query: string): Preset | undefined {
  const slug = slugify(query);
  return PRESETS.find((p) => slugify(p.query) === slug);
}
