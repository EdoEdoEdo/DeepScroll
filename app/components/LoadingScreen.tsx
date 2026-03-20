"use client";

import { useEffect, useRef, useState } from "react";

export interface LogLine {
  time: string;
  text: string;
  status: "active" | "ok" | "pending" | "error";
}

interface LoadingScreenProps {
  query: string;
  logs: LogLine[];
  progress: number;
}

export default function LoadingScreen({
  query,
  logs,
  progress,
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

  useEffect(() => {
    if (visibleCount < logs.length) {
      // Adaptive delay: faster when many logs are pending (async burst)
      const pending = logs.length - visibleCount;
      const delay = pending > 3 ? 60 : 180;
      const timer = setTimeout(
        () => setVisibleCount((c) => c + 1),
        delay
      );
      return () => clearTimeout(timer);
    }
  }, [visibleCount, logs.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleCount]);

  return (
    <section className="loading-screen">
      <div className="loading-header">// AI Orchestration Log</div>
      <div className="loading-query-display">{query.toUpperCase()}</div>

      <div className="log-container" ref={containerRef}>
        {logs.slice(0, visibleCount).map((log, i) => (
          <div key={i} className="log-line visible">
            <span className="log-time">{log.time}</span>
            <span className={`log-text ${log.status}`}>{log.text}</span>
          </div>
        ))}
      </div>

      <div className="loading-bar-wrap">
        <div className="loading-bar-label">
          <span>Pipeline Progress</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="loading-bar-track">
          <div
            className="loading-bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </section>
  );
}
