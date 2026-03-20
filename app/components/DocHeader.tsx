"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/app/utils/gsap";
import type { DocumentaryData } from "@/app/utils/types";

interface DocHeaderProps {
  data: DocumentaryData;
}

export default function DocHeader({ data }: DocHeaderProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.2 });

      tl.from(".doc-query-label", {
        opacity: 0,
        y: -8,
        duration: 0.4,
        ease: "power2.out",
      })
        .from(
          ".doc-query-title",
          {
            clipPath: "inset(100% 0% 0% 0%)",
            duration: 0.7,
            ease: "power3.out",
          },
          "-=0.1"
        )
        .from(
          ".doc-subtitle",
          {
            opacity: 0,
            y: 12,
            duration: 0.5,
            ease: "power2.out",
          },
          "-=0.3"
        )
        .from(
          ".doc-meta-row span",
          {
            opacity: 0,
            y: 8,
            duration: 0.3,
            stagger: 0.06,
            ease: "power2.out",
          },
          "-=0.2"
        )
        .from(
          ".scroll-indicator",
          {
            opacity: 0,
            duration: 0.4,
            ease: "power2.out",
          },
          "-=0.1"
        );
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref}>
      <div className="doc-header">
        <div className="doc-query-label">
          // Documentary generated — Guardian API · AI Curated
        </div>
        <div className="doc-query-title">{data.query.toUpperCase()}</div>
        <div className="doc-subtitle">{data.subtitle}</div>
        <div className="doc-meta-row">
          <span>
            <strong>5</strong> Narrative chapters
          </span>
          <span>
            <strong>{data.totalArticlesAnalyzed.toLocaleString()}</strong>{" "}
            Articles analyzed
          </span>
          <span>
            <strong>{data.avgScore}/100</strong> Avg. score
          </span>
          <span>
            <strong>The Guardian</strong> API
          </span>
          <span>
            <strong>
              {new Date(data.generatedAt).toLocaleDateString("en-GB")}
            </strong>
          </span>
        </div>
      </div>
      <div className="scroll-indicator">
        <div className="scroll-arrow" />
        Scroll to explore · 5 narrative chapters
      </div>
    </div>
  );
}
