"use client";

import { useEffect, useRef, useState } from "react";
import type { ChapterStatus, LogLine, PlannedChapter } from "@/app/utils/types";
import { ARC_STRUCTURE } from "@/app/utils/arc";

interface LoadingScreenProps {
  query: string;
  logs: LogLine[];
  progress: number;
  /** Arc plan, once the LLM has produced it */
  plan: PlannedChapter[] | null;
  /** Per-chapter retrieval results, filled as they arrive */
  chapters: Array<ChapterStatus | null>;
}

type BarState = "idle" | "armed" | "active" | "done" | "empty";

export default function LoadingScreen({
  query,
  logs,
  progress,
  plan,
  chapters,
}: LoadingScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const prevQueryRef = useRef(query);

  // Reset on new query
  useEffect(() => {
    if (query !== prevQueryRef.current) {
      setVisibleCount(0);
      prevQueryRef.current = query;
    }
  }, [query]);

  // Reveal lines one by one, faster when a burst arrives
  useEffect(() => {
    if (visibleCount < logs.length) {
      const pending = logs.length - visibleCount;
      const delay = pending > 3 ? 50 : 140;
      const timer = setTimeout(() => setVisibleCount((c) => c + 1), delay);
      return () => clearTimeout(timer);
    }
  }, [visibleCount, logs.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleCount]);

  // The strata from the landing page fill up as each chapter is excavated
  const firstPending = plan ? chapters.findIndex((c) => c === null) : -1;

  return (
    <section className="loading-screen">
      <div className="loading-grid">
        <div className="loading-main">
          <div className="loading-header">// AI orchestration log · live</div>
          <div className="loading-query-display">{query.toUpperCase()}</div>

          <div className="log-container" ref={containerRef}>
            {logs.slice(0, visibleCount).map((log, i) => (
              <div key={i} className="log-line visible">
                <span className="log-time">{log.time}</span>
                <span className={`log-text ${log.status}`}>{log.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="loading-strata" aria-hidden="true">
          {ARC_STRUCTURE.map((arc, i) => {
            const status = chapters[i];
            const planned = plan?.[i];
            const state: BarState = status
              ? status.headline
                ? "done"
                : "empty"
              : i === firstPending
                ? "active"
                : plan
                  ? "armed"
                  : "idle";

            return (
              <div key={arc.tag} className={`load-bar is-${state}`}>
                <div className="load-bar-row">
                  <span className="bar-num">CH.0{i + 1}</span>
                  <span className="load-bar-keyword">
                    {planned ? `“${planned.keyword}” · ${planned.dateRange}` : ""}
                  </span>
                  <span className="bar-tag">{arc.tag.toUpperCase()}</span>
                </div>
                {status && (
                  <div className="load-bar-detail">
                    <span className="load-bar-matches">
                      {status.matches.toLocaleString("en-GB")} matches
                    </span>
                    <span className="load-bar-headline">
                      {status.headline ?? "Silence in the archive"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="loading-bar-wrap">
        <div className="loading-bar-label">
          <span>Pipeline progress</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="loading-bar-track">
          <div className="loading-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  );
}
