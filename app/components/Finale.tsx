"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/app/utils/gsap";
import type { DocumentaryData } from "@/app/utils/types";

interface FinaleProps {
  data: DocumentaryData;
  onReset: () => void;
}

export default function Finale({ data, onReset }: FinaleProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      gsap.from(".finale-label", {
        opacity: 0,
        y: -8,
        duration: 0.4,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 80%",
        },
      });

      gsap.from(".finale-title", {
        clipPath: "inset(100% 0% 0% 0%)",
        duration: 0.7,
        delay: 0.1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: el,
          start: "top 80%",
        },
      });

      gsap.from(".stat-cell", {
        opacity: 0,
        y: 16,
        duration: 0.4,
        stagger: 0.1,
        delay: 0.3,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el.querySelector(".finale-stats"),
          start: "top 85%",
        },
      });

      gsap.from(".reset-btn", {
        opacity: 0,
        duration: 0.4,
        delay: 0.6,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 80%",
        },
      });
    }, el);

    return () => ctx.revert();
  }, []);

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
          <div className="stat-label">Chapters</div>
        </div>
        <div className="stat-cell">
          <div className="stat-val">
            {data.totalArticlesAnalyzed.toLocaleString()}
          </div>
          <div className="stat-label">Analyzed</div>
        </div>
        <div className="stat-cell">
          <div className="stat-val">{data.avgScore}</div>
          <div className="stat-label">Avg. score</div>
        </div>
        <div className="stat-cell">
          <div className="stat-val">TG</div>
          <div className="stat-label">The Guardian</div>
        </div>
      </div>
      <button className="reset-btn" onClick={onReset}>
        ← New query
      </button>
    </div>
  );
}
