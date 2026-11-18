/**
 * Client-side runner.
 *
 * 1. Preset query with a pre-generated file in /public/presets → replay it
 *    (instant, no API quota, works even if every LLM provider is down).
 * 2. Otherwise POST /api/documentary and read the NDJSON event stream.
 */
import type {
  ChapterStatus,
  DocumentaryData,
  LogLine,
  PipelineEvent,
  PlannedChapter,
} from "./types";
import { DOC_VERSION, findPreset, slugify } from "./arc";

export interface PipelineCallbacks {
  onLog: (line: LogLine) => void;
  onProgress: (value: number) => void;
  onPlan: (chapters: PlannedChapter[]) => void;
  onChapter: (status: ChapterStatus) => void;
}

/** Shape of /public/presets/<slug>.json (written by scripts/generate-presets.mjs) */
interface PresetFile {
  version: number;
  query: string;
  events: PipelineEvent[];
  data: DocumentaryData;
}

/** Error from the pipeline: readable message + optional technical detail */
export class PipelineRunError extends Error {
  constructor(message: string, public detail?: string) {
    super(message);
    this.name = "PipelineRunError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Real elapsed time since the run started, "mm:ss" */
function makeClock(): () => string {
  const start = Date.now();
  return () => {
    const s = Math.floor((Date.now() - start) / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };
}

export async function runDocumentary(
  query: string,
  modelId: string | undefined,
  cb: PipelineCallbacks
): Promise<DocumentaryData> {
  const clock = makeClock();

  const dispatch = (event: PipelineEvent): DocumentaryData | null => {
    switch (event.type) {
      case "log":
        cb.onLog({ time: clock(), text: event.text, status: event.status });
        return null;
      case "progress":
        cb.onProgress(event.value);
        return null;
      case "plan":
        cb.onPlan(event.chapters);
        return null;
      case "chapter": {
        const { index, arcTag, keyword, matches, headline } = event;
        cb.onChapter({ index, arcTag, keyword, matches, headline });
        return null;
      }
      case "result":
        return event.data;
      case "error":
        throw new PipelineRunError(event.message, event.detail);
    }
  };

  // ── 1. Pre-generated preset ───────────────────────────
  const preset = findPreset(query);
  if (preset) {
    const file = await loadPreset(slugify(preset.query));
    if (file) {
      cb.onLog({ time: clock(), text: "Loading the pre-generated edition of this documentary", status: "ok" });
      for (const event of file.events) {
        if (event.type === "result" || event.type === "error") continue;
        dispatch(event);
        await sleep(event.type === "log" ? 70 : 20);
      }
      return file.data;
    }
  }

  // ── 2. Live pipeline (NDJSON stream) ──────────────────
  const res = await fetch("/api/documentary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, model: modelId || undefined }),
  });

  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null as DocumentaryData | null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: PipelineEvent;
    try {
      event = JSON.parse(trimmed) as PipelineEvent;
    } catch {
      return; // ignore a malformed line
    }
    const data = dispatch(event);
    if (data) result = data;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    handleLine(buffer + decoder.decode());
  } finally {
    reader.releaseLock();
  }

  if (!result) throw new Error("The stream ended without a documentary");
  return result;
}

async function loadPreset(slug: string): Promise<PresetFile | null> {
  try {
    const res = await fetch(`/presets/${slug}.json`);
    if (!res.ok) return null;
    const file = (await res.json()) as PresetFile;
    if (file.version !== DOC_VERSION || !file.data || !Array.isArray(file.events)) return null;
    return file;
  } catch {
    return null;
  }
}
