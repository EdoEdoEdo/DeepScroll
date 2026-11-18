"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { ChapterStatus, DocumentaryData, LogLine, PlannedChapter } from "@/app/utils/types";
import { runDocumentary, PipelineRunError } from "@/app/utils/pipeline";
import { FALLBACK_INTERLUDES, INTERLUDE_BEFORE } from "@/app/utils/arc";
import { ScrollTrigger, refreshScroll } from "@/app/utils/gsap";
import QueryScreen from "@/app/components/QueryScreen";
import LoadingScreen from "@/app/components/LoadingScreen";
import DepthIndicator from "@/app/components/DepthIndicator";
import DocHeader from "@/app/components/DocHeader";
import Chapter from "@/app/components/Chapter";
import Interlude from "@/app/components/Interlude";
import Finale from "@/app/components/Finale";
import ArticleOverlay from "@/app/components/ArticleOverlay";

type AppState = "query" | "loading" | "documentary" | "error";

const emptyChapters = (): Array<ChapterStatus | null> => [null, null, null, null, null];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Keep ?q= in the address bar so every documentary is shareable */
function setQueryParam(q: string | null) {
  const url = new URL(window.location.href);
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  window.history.replaceState(null, "", url.toString());
}

export default function DeepScrollPage() {
  const [state, setState] = useState<AppState>("query");
  const [query, setQuery] = useState("");
  const [modelId, setModelId] = useState<string | undefined>(undefined);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [plan, setPlan] = useState<PlannedChapter[] | null>(null);
  const [chapterStatus, setChapterStatus] = useState<Array<ChapterStatus | null>>(emptyChapters);
  const [documentary, setDocumentary] = useState<DocumentaryData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [overlayArticleId, setOverlayArticleId] = useState<string | null>(null);
  const runId = useRef(0);
  const didInit = useRef(false);

  const handleSubmit = useCallback(async (q: string, model?: string) => {
    const id = ++runId.current;
    const isCurrent = () => runId.current === id;

    setQuery(q);
    setModelId(model);
    setState("loading");
    setLogs([]);
    setProgress(0);
    setPlan(null);
    setChapterStatus(emptyChapters());
    setErrorMsg(null);
    setErrorDetail(null);
    window.scrollTo(0, 0);

    try {
      const data = await runDocumentary(q, model, {
        onLog: (line) => {
          if (isCurrent()) setLogs((prev) => [...prev, line]);
        },
        onProgress: (value) => {
          if (isCurrent()) setProgress(value);
        },
        onPlan: (chapters) => {
          if (isCurrent()) setPlan(chapters);
        },
        onChapter: (status) => {
          if (!isCurrent()) return;
          setChapterStatus((prev) => {
            const next = [...prev];
            next[status.index] = status;
            return next;
          });
        },
      });

      // Let the log finish revealing before the cut
      await sleep(900);
      if (!isCurrent()) return;

      setDocumentary(data);
      setState("documentary");
      setQueryParam(q);
    } catch (err) {
      if (!isCurrent()) return;
      setErrorMsg(err instanceof Error ? err.message : "Pipeline failed");
      setErrorDetail(err instanceof PipelineRunError ? err.detail ?? null : null);
      setState("error");
    }
  }, []);

  // Shared link: /?q=Brexit → generate straight away
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const q = new URLSearchParams(window.location.search).get("q")?.trim();
    if (q) void handleSubmit(q);
  }, [handleSubmit]);

  // Re-measure scroll triggers once the documentary is laid out
  useEffect(() => {
    if (state !== "documentary") return;
    window.scrollTo(0, 0);
    refreshScroll(400);
    document.fonts?.ready.then(() => refreshScroll());
  }, [state]);

  const handleReset = useCallback(() => {
    runId.current++;
    // Kill all ScrollTrigger instances from the documentary
    ScrollTrigger.getAll().forEach((t: { kill: () => void }) => t.kill());
    setState("query");
    setQuery("");
    setLogs([]);
    setProgress(0);
    setPlan(null);
    setChapterStatus(emptyChapters());
    setDocumentary(null);
    setErrorMsg(null);
    setErrorDetail(null);
    setOverlayArticleId(null);
    setQueryParam(null);
    window.scrollTo(0, 0);
  }, []);

  const handleRetry = useCallback(() => {
    if (query) void handleSubmit(query, modelId);
  }, [query, modelId, handleSubmit]);

  const handleReadMore = useCallback((articleId: string) => {
    setOverlayArticleId(articleId);
  }, []);

  const handleCloseOverlay = useCallback(() => {
    setOverlayArticleId(null);
  }, []);

  return (
    <>
      <DepthIndicator visible={state === "documentary"} />

      {/* Query Screen */}
      {state === "query" && <QueryScreen onSubmit={handleSubmit} />}

      {/* Loading Screen */}
      {state === "loading" && (
        <LoadingScreen
          query={query}
          logs={logs}
          progress={progress}
          plan={plan}
          chapters={chapterStatus}
        />
      )}

      {/* Error State */}
      {state === "error" && (
        <section className="loading-screen error-screen">
          <div className="loading-header">// Pipeline error · {query}</div>
          <div className="error-message">{errorMsg}</div>
          {errorDetail && (
            <details className="error-detail">
              <summary>Technical detail</summary>
              <pre>{errorDetail}</pre>
            </details>
          )}
          <div className="error-actions">
            <button className="reset-btn" onClick={handleRetry}>
              ↻ Retry
            </button>
            <button className="reset-btn" onClick={handleReset}>
              ← New query
            </button>
          </div>
        </section>
      )}

      {/* Documentary */}
      {state === "documentary" && documentary && (
        <>
          <DocHeader data={documentary} />

          <section id="screen-doc">
            {documentary.chapters.map((ch, i) => {
              const interludeIndex = (INTERLUDE_BEFORE as readonly number[]).indexOf(i);
              const interludeText =
                interludeIndex >= 0
                  ? documentary.interludes?.[interludeIndex] ?? FALLBACK_INTERLUDES[interludeIndex]
                  : null;

              return (
                <div key={`${documentary.generatedAt}-${i}`}>
                  {interludeText && <Interlude number={`0${i + 1}`} text={interludeText} />}
                  <Chapter chapter={ch} onReadMore={handleReadMore} />
                </div>
              );
            })}
          </section>

          <Finale data={documentary} onReset={handleReset} onReadMore={handleReadMore} />
        </>
      )}

      {/* Article Overlay */}
      <ArticleOverlay articleId={overlayArticleId} onClose={handleCloseOverlay} />
    </>
  );
}
