"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "@/app/utils/gsap";
import type { DocumentaryData } from "@/app/utils/types";

interface FinaleProps {
  data: DocumentaryData;
  onReset: () => void;
  onReadMore?: (articleId: string) => void;
}

export default function Finale({ data, onReset, onReadMore }: FinaleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const sources = data.chapters.filter((ch) => ch.guardian.articleId);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      gsap.from(".finale-label", {
        opacity: 0,
        y: -8,
        duration: 0.4,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 80%" },
      });

      gsap.from(".finale-title", {
        clipPath: "inset(100% 0% 0% 0%)",
        duration: 0.7,
        delay: 0.1,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 80%" },
      });

      gsap.from(".stat-cell", {
        opacity: 0,
        y: 16,
        duration: 0.4,
        stagger: 0.1,
        delay: 0.3,
        ease: "power2.out",
        scrollTrigger: { trigger: ".finale-stats", start: "top 85%" },
      });

      if (el.querySelector(".finale-source")) {
        gsap.from(".finale-source", {
          opacity: 0,
          x: -12,
          duration: 0.35,
          stagger: 0.07,
          ease: "power2.out",
          scrollTrigger: { trigger: ".finale-sources", start: "top 85%" },
        });
      }

      gsap.from(".finale-actions", {
        opacity: 0,
        duration: 0.4,
        delay: 0.6,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 80%" },
      });
    }, el);

    return () => ctx.revert();
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", window.location.href);
    }
  }

  return (
    <div ref={ref} id="doc-finale" className="doc-finale">
      <div className="finale-label">// Documentary complete</div>
      <div className="finale-title">
        End of
        <br />
        Document
      </div>

      <div className="finale-stats">
        <div className="stat-cell">
          <div className="stat-val">5</div>
          <div className="stat-label">Acts</div>
        </div>
        <div className="stat-cell">
          <div className="stat-val">{data.stats.scanned.toLocaleString("en-GB")}</div>
          <div className="stat-label">Articles ranked</div>
        </div>
        <div className="stat-cell">
          <div className="stat-val">{data.stats.archiveMatches.toLocaleString("en-GB")}</div>
          <div className="stat-label">Archive matches</div>
        </div>
        <div className="stat-cell">
          <div className="stat-val">{data.stats.avgScore}</div>
          <div className="stat-label">Avg. score</div>
        </div>
      </div>

      {sources.length > 0 && (
        <div className="finale-sources">
          <div className="finale-sources-label">
            // Primary sources · The Guardian
            {data.model ? ` · narration by ${data.model.label}, written from these articles` : ""}
          </div>
          <ol className="finale-source-list">
            {sources.map((ch) => (
              <li key={ch.guardian.articleId} className="finale-source">
                <span className="finale-source-num">
                  CH.0{ch.index + 1} · {ch.arcTag}
                </span>
                <button
                  type="button"
                  className="finale-source-title"
                  onClick={() => onReadMore?.(ch.guardian.articleId)}
                >
                  {ch.headline}
                </button>
                <span className="finale-source-meta">
                  {ch.guardian.date}
                  {ch.guardian.byline ? ` · ${ch.guardian.byline}` : ""} ·{" "}
                  <a href={ch.guardian.url} target="_blank" rel="noopener noreferrer">
                    theguardian.com ↗
                  </a>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="finale-actions">
        <button className="reset-btn" onClick={onReset}>
          ← New query
        </button>
        <button className="reset-btn" onClick={handleCopy}>
          {copied ? "Link copied ✓" : "Copy link ↗"}
        </button>
      </div>
    </div>
  );
}
