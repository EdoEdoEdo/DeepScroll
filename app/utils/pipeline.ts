/**
 * Client-side runner: POST /api/documentary and read the NDJSON event
 * stream. Every documentary is generated live — no pre-recorded editions.
 */
import type {
  ChapterStatus,
  DocumentaryData,
  LogLine,
  PipelineEvent,
  PlannedChapter,
} from "./types";

export interface PipelineCallbacks {
  onLog: (line: LogLine) => void;
  onProgress: (value: number) => void;
  onPlan: (chapters: PlannedChapter[]) => void;
  onChapter: (status: ChapterStatus) => void;
}

/** Error from the pipeline: readable message + optional technical detail */
export class PipelineRunError extends Error {
  constructor(message: string, public detail?: string) {
    super(message);
    this.name = "PipelineRunError";
  }
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
