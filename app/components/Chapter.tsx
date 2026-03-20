"use client";

import { useEffect, useRef } from "react";
import type { ChapterData } from "@/app/utils/types";
import { gsap, ScrollTrigger } from "@/app/utils/gsap";
import GuardianBox from "./GuardianBox";
import AIBlock from "./AIBlock";

interface ChapterProps {
  chapter: ChapterData;
  onReadMore?: (articleId: string) => void;
}

export default function Chapter({ chapter, onReadMore }: ChapterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ch = chapter;
  const num = `0${ch.index + 1}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      // ── Chapter bar — slide down ────────────────────
      gsap.from(el.querySelector(".chapter-bar"), {
        y: -20,
        opacity: 0,
        duration: 0.5,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
        },
      });

      // ── Arc label — fade in ─────────────────────────
      gsap.from(el.querySelector(".chapter-arc-label"), {
        opacity: 0,
        y: 8,
        duration: 0.4,
        delay: 0.1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el.querySelector(".chapter-left"),
          start: "top 80%",
        },
      });

      // ── Headline — clip-path reveal bottom to top ───
      const headline = el.querySelector(".chapter-headline");
      if (headline) {
        gsap.set(headline, {
          clipPath: "inset(100% 0% 0% 0%)",
          opacity: 1,
        });
        gsap.to(headline, {
          clipPath: "inset(0% 0% 0% 0%)",
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: headline,
            start: "top 80%",
          },
        });
      }

      // ── Body text — fade up ─────────────────────────
      gsap.from(el.querySelector(".chapter-body-text"), {
        opacity: 0,
        y: 20,
        duration: 0.6,
        delay: 0.2,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el.querySelector(".chapter-body-text"),
          start: "top 85%",
        },
      });

      // ── Guardian box — slide from left ──────────────
      gsap.from(el.querySelector(".guardian-box"), {
        x: -30,
        opacity: 0,
        duration: 0.6,
        delay: 0.1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el.querySelector(".guardian-box"),
          start: "top 85%",
        },
      });

      // ── Metadata rows — stagger ─────────────────────
      const metaRows = el.querySelectorAll(".meta-row");
      if (metaRows.length > 0) {
        gsap.from(metaRows, {
          opacity: 0,
          x: -12,
          duration: 0.3,
          stagger: 0.06,
          ease: "power2.out",
          scrollTrigger: {
            trigger: metaRows[0],
            start: "top 90%",
          },
        });
      }

      // ── Right column image — parallax ───────────────
      const img = el.querySelector(".chapter-img");
      if (img) {
        gsap.fromTo(
          img,
          { y: -40 },
          {
            y: 40,
            ease: "none",
            scrollTrigger: {
              trigger: el.querySelector(".chapter-right"),
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          }
        );
      }

      // ── Noise lines — stagger fade in ───────────────
      const noiseLines = el.querySelectorAll(".noise-line");
      if (noiseLines.length > 0) {
        gsap.from(noiseLines, {
          opacity: 0,
          duration: 0.4,
          stagger: 0.05,
          scrollTrigger: {
            trigger: el.querySelector(".chapter-right"),
            start: "top 80%",
          },
        });
      }

      // ── Right badges — fade in with delay ───────────
      gsap.from(el.querySelector(".chapter-right-badge"), {
        opacity: 0,
        duration: 0.6,
        delay: 0.4,
        scrollTrigger: {
          trigger: el.querySelector(".chapter-right"),
          start: "top 80%",
        },
      });

      gsap.from(el.querySelector(".chapter-right-date"), {
        opacity: 0,
        y: 10,
        duration: 0.6,
        delay: 0.5,
        scrollTrigger: {
          trigger: el.querySelector(".chapter-right"),
          start: "top 80%",
        },
      });

      // ── AI block — slide up ─────────────────────────
      gsap.from(el.querySelector(".chapter-ai-block"), {
        opacity: 0,
        y: 16,
        duration: 0.5,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el.querySelector(".chapter-ai-block"),
          start: "top 92%",
        },
      });
    }, el);

    return () => ctx.revert();
  }, []);

  // Noise text for marquee
  const noiseText = (ch.noiseText + " · ").repeat(4);
  const noiseLines = Array.from({ length: 10 }, (_, j) => ({
    key: j,
    dur: `${16 + j * 3}s`,
    text: noiseText + noiseText,
  }));

  return (
    <div ref={ref} className="chapter">
      {/* Top bar */}
      <div className="chapter-bar">
        <div className="chapter-num">CH.{num}</div>
        <div className="chapter-arc-tag">{ch.arcTag}</div>
        <div className="chapter-title-bar">{ch.arcLabel.toUpperCase()}</div>
        <div className="chapter-score-bar">
          Scorer <span className="score-val">{ch.score}/100</span>
        </div>
        <div className="chapter-date">{ch.dateRange}</div>
      </div>

      {/* Body: left + right */}
      <div className="chapter-body">
        <div className="chapter-left">
          <div>
            <div className="chapter-arc-label">
              // {ch.arcTag} · {ch.arcLabel}
            </div>
            <div className="chapter-headline">{ch.headline}</div>
            <div className="chapter-body-text">{ch.body}</div>

            <GuardianBox
              excerpt={ch.guardian.excerpt}
              date={ch.guardian.date}
              section={ch.guardian.section}
              articleId={ch.guardian.articleId}
              onReadMore={onReadMore}
            />
          </div>

          <div className="chapter-meta">
            <div className="meta-row">
              <span>Section</span>
              <span>{ch.guardian.section}</span>
            </div>
            <div className="meta-row">
              <span>Word count</span>
              <span>{ch.wordcount.toLocaleString()}</span>
            </div>
            <div className="meta-row">
              <span>Scorer</span>
              <span>{ch.score}/100</span>
            </div>
            <div className="meta-row">
              <span>Visual</span>
              <span>
                {ch.imageUrl ? "Guardian thumbnail" : "Typographic noise"}
              </span>
            </div>
            <div className="meta-row">
              <span>Source</span>
              <span>theguardian.com</span>
            </div>
          </div>
        </div>

        <div className="chapter-right">
          {ch.imageUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="chapter-img"
                src={ch.imageUrl}
                alt=""
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="chapter-img-overlay" />
            </>
          )}
          <div className="chapter-noise">
            {noiseLines.map((line) => (
              <div
                key={line.key}
                className="noise-line"
                style={{ "--dur": line.dur } as React.CSSProperties}
              >
                {line.text}
              </div>
            ))}
          </div>
          <div className="chapter-right-badge">
            CH.{num} · {ch.arcTag}
          </div>
          <div className="chapter-right-date">{ch.dateRange}</div>
        </div>
      </div>

      {/* AI analysis block */}
      <AIBlock text={ch.aiAnalysis} />
    </div>
  );
}
