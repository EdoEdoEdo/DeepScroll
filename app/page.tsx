"use client";

import { useState, useCallback, useRef } from "react";
import type { DocumentaryData } from "@/app/utils/types";
import type { LogLine } from "@/app/components/LoadingScreen";
import { runPipeline } from "@/app/utils/pipeline";
import { FALLBACK_INTERLUDES } from "@/app/utils/arc";
import { ScrollTrigger } from "@/app/utils/gsap";
import QueryScreen from "@/app/components/QueryScreen";
import LoadingScreen from "@/app/components/LoadingScreen";
import DepthIndicator from "@/app/components/DepthIndicator";
import DocHeader from "@/app/components/DocHeader";
import Chapter from "@/app/components/Chapter";
import Interlude from "@/app/components/Interlude";
import Finale from "@/app/components/Finale";
import ArticleOverlay from "@/app/components/ArticleOverlay";

type AppState = "query" | "loading" | "documentary" | "error";

export default function DeepScrollPage() {
  const [state, setState] = useState<AppState>("query");
  const [query, setQuery] = useState("");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [documentary, setDocumentary] = useState<DocumentaryData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [overlayArticleId, setOverlayArticleId] = useState<string | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((log: LogLine) => {
    setLogs((prev) => [...prev, log]);
  }, []);

  const handleSubmit = useCallback(
    async (q: string, modelId?: string) => {
      setQuery(q);
      setState("loading");
      setLogs([]);
      setProgress(0);
      setErrorMsg(null);

      try {
        const data = await runPipeline(q, addLog, setProgress, modelId);
        setDocumentary(data);
        setState("documentary");

        requestAnimationFrame(() => {
          setTimeout(() => {
            headerRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }, 100);
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Pipeline failed");
        setState("error");
      }
    },
    [addLog]
  );

  const handleReset = useCallback(() => {
    // Kill all ScrollTrigger instances from the documentary
    ScrollTrigger.getAll().forEach((t) => t.kill());
    setState("query");
    setQuery("");
    setLogs([]);
    setProgress(0);
    setDocumentary(null);
    setErrorMsg(null);
    setOverlayArticleId(null);
    window.scrollTo(0, 0);
  }, []);

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
        <LoadingScreen query={query} logs={logs} progress={progress} />
      )}

      {/* Error State */}
      {state === "error" && (
        <section className="loading-screen">
          <div className="loading-header">// Pipeline Error</div>
          <div
            className="loading-query-display"
            style={{ fontSize: "clamp(24px, 4vw, 48px)" }}
          >
            {errorMsg}
          </div>
          <button
            className="reset-btn"
            onClick={handleReset}
            style={{ marginTop: 32 }}
          >
            ← Try again
          </button>
        </section>
      )}

      {/* Documentary */}
      {state === "documentary" && documentary && (
        <>
          <div ref={headerRef}>
            <DocHeader data={documentary} />
          </div>

          <section id="screen-doc">
            {documentary.chapters.map((ch, i) => {
              let interludeText: string | null = null;
              if (i === 2) {
                interludeText = documentary.interludes?.[0] ?? FALLBACK_INTERLUDES[0];
              } else if (i === 4) {
                interludeText = documentary.interludes?.[1] ?? FALLBACK_INTERLUDES[1];
              }

              return (
                <div key={i}>
                  {interludeText && (
                    <Interlude
                      number={`0${i + 1}`}
                      text={interludeText}
                    />
                  )}
                  <Chapter chapter={ch} onReadMore={handleReadMore} />
                </div>
              );
            })}
          </section>

          <Finale data={documentary} onReset={handleReset} />
        </>
      )}

      {/* Article Overlay */}
      <ArticleOverlay
        articleId={overlayArticleId}
        onClose={handleCloseOverlay}
      />
    </>
  );
}
