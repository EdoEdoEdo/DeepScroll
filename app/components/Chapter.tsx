"use client";

import { useEffect, useRef } from "react";
import type { ChapterData } from "@/app/utils/types";
import { gsap, refreshScroll } from "@/app/utils/gsap";
import GuardianBox from "./GuardianBox";
import AIBlock from "./AIBlock";
import SourceStrata from "./SourceStrata";

interface ChapterProps {
  chapter: ChapterData;
  onReadMore?: (articleId: string) => void;
}

type TweenVars = Record<string, unknown>;

/** Scroll-triggered entrance — silently skipped when the target is absent */
function reveal(
  target: Element | NodeListOf<Element> | null,
  vars: TweenVars,
  trigger: Element | null,
  start = "top 85%"
) {
  if (!target || !trigger) return;
  if (target instanceof NodeList && target.length === 0) return;
  gsap.from(target, { ...vars, scrollTrigger: { trigger, start } });
}

/** Coverage line: the writer's observation + the real numbers */
function coverageText(ch: ChapterData): string {
  if (!ch.guardian.articleId) {
    return "No Guardian article matched this window. The silence of the archive is itself a data point.";
  }
  const stats = `${ch.archiveMatches.toLocaleString("en-GB")} archive matches for “${ch.keyword}” (${ch.dateRange}) · ${ch.scanned} ranked · hero scored ${ch.score}/100.`;
  return ch.insight ? `${ch.insight} ${stats}` : stats;
}

/**
 * One act of the documentary. Each act has its own treatment:
 *   Prelude   — calm, muted image
 *   Signal    — mirrored layout, a red crack opens on scroll
 *   Crisis    — full-bleed pinned stage, full-colour photo, huge headline
 *   Response  — denser grid, strata index on ink
 *   Aftermath — single quiet column, desaturated strip, slow reveals
 */
export default function Chapter({ chapter, onReadMore }: ChapterProps) {
  const ref = useRef<HTMLElement>(null);
  const ch = chapter;
  const num = `0${ch.index + 1}`;
  const isCrisis = ch.arcTag === "Crisis";
  const isSignal = ch.arcTag === "Signal";
  const hasHero = Boolean(ch.guardian.articleId);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const q = (selector: string) => el.querySelector(selector);
    const qa = (selector: string) => el.querySelectorAll(selector);
    const slow = ch.arcTag === "Aftermath" ? 1.6 : 1;
    let mm: ReturnType<typeof gsap.matchMedia> | null = null;

    const ctx = gsap.context(() => {
      reveal(q(".chapter-bar"), { y: -20, opacity: 0, duration: 0.5, ease: "power2.out" }, el);

      reveal(
        q(".chapter-arc-label"),
        { opacity: 0, y: 8, duration: 0.4 * slow, delay: 0.1, ease: "power2.out" },
        q(".chapter-left"),
        "top 80%"
      );

      // Headline — clip-path reveal bottom to top
      const headline = q(".chapter-headline");
      if (headline) {
        gsap.set(headline, { clipPath: "inset(100% 0% 0% 0%)" });
        gsap.to(headline, {
          clipPath: "inset(0% 0% 0% 0%)",
          duration: 0.8 * slow,
          ease: "power3.out",
          scrollTrigger: { trigger: headline, start: "top 80%" },
        });
      }

      reveal(
        q(".chapter-body-text"),
        { opacity: 0, y: 20, duration: 0.6 * slow, delay: 0.2, ease: "power2.out" },
        q(".chapter-body-text")
      );
      reveal(
        q(".guardian-box"),
        { x: -30, opacity: 0, duration: 0.6, delay: 0.1, ease: "power2.out" },
        q(".guardian-box")
      );
      reveal(
        qa(".meta-row"),
        { opacity: 0, x: -12, duration: 0.3, stagger: 0.06, ease: "power2.out" },
        q(".meta-row"),
        "top 90%"
      );
      reveal(
        qa(".strata-row"),
        { opacity: 0, y: 10, duration: 0.35 * slow, stagger: 0.05, ease: "power2.out" },
        q(".strata-index")
      );
      reveal(
        q(".chapter-ai-block"),
        { opacity: 0, y: 16, duration: 0.5, ease: "power2.out" },
        q(".chapter-ai-block"),
        "top 92%"
      );

      // ── Visual panel ─────────────────────────────────
      const right = q(".chapter-right");
      const img = q(".chapter-img");
      if (img && right) {
        gsap.fromTo(
          img,
          { y: -40 },
          {
            y: 40,
            ease: "none",
            scrollTrigger: { trigger: right, start: "top bottom", end: "bottom top", scrub: true },
          }
        );
      }
      reveal(qa(".chapter-right .noise-line"), { opacity: 0, duration: 0.4, stagger: 0.05 }, right, "top 80%");
      reveal(q(".chapter-right-badge"), { opacity: 0, duration: 0.6, delay: 0.4 }, right, "top 80%");
      reveal(q(".chapter-right-date"), { opacity: 0, y: 10, duration: 0.6, delay: 0.5 }, right, "top 80%");

      // ── Signal: the crack opens as you scroll past ───
      const crack = q(".signal-crack");
      if (crack && right) {
        gsap.fromTo(
          crack,
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: "none",
            scrollTrigger: { trigger: right, start: "top 75%", end: "bottom 40%", scrub: true },
          }
        );
      }

      // ── Crisis: pinned full-bleed stage ──────────────
      const stage = q(".chapter-stage");
      if (stage) {
        const stageImg = stage.querySelector(".stage-img");
        const stageHeadline = stage.querySelector(".stage-headline");
        const stageShade = stage.querySelector(".stage-shade");

        mm = gsap.matchMedia();
        mm.add("(min-width: 901px) and (prefers-reduced-motion: no-preference)", () => {
          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: stage,
              start: "top top",
              end: "+=70%",
              pin: true,
              scrub: true,
              anticipatePin: 1,
            },
          });
          if (stageImg) tl.fromTo(stageImg, { scale: 1.18 }, { scale: 1, ease: "none" }, 0);
          if (stageHeadline) {
            tl.fromTo(stageHeadline, { yPercent: 40, opacity: 0.15 }, { yPercent: 0, opacity: 1, ease: "none" }, 0);
          }
          if (stageShade) tl.fromTo(stageShade, { opacity: 0.35 }, { opacity: 0.9, ease: "none" }, 0);
        });
        mm.add("(max-width: 900px), (prefers-reduced-motion: reduce)", () => {
          if (stageHeadline) {
            gsap.from(stageHeadline, {
              opacity: 0,
              y: 30,
              duration: 0.8,
              ease: "power3.out",
              scrollTrigger: { trigger: stage, start: "top 70%" },
            });
          }
        });
      }
    }, el);

    return () => {
      mm?.revert();
      ctx.revert();
    };
  }, [ch.arcTag]);

  // Noise text for marquee texture
  const noiseText = (ch.noiseText + " · ").repeat(4);
  const noise = (
    <div className="chapter-noise">
      {Array.from({ length: isCrisis ? 14 : 10 }, (_, j) => (
        <div
          key={j}
          className="noise-line"
          style={{ "--dur": `${16 + j * 3}s` } as React.CSSProperties}
        >
          {noiseText + noiseText}
        </div>
      ))}
    </div>
  );

  const hideOnError = (e: { currentTarget: HTMLImageElement }) => {
    e.currentTarget.style.display = "none";
  };

  const narration = (
    <>
      <div className="chapter-arc-label">
        // {ch.arcTag} · {ch.arcLabel}
      </div>
      {!isCrisis && <h2 className="chapter-headline">{ch.headline}</h2>}
      {ch.body ? (
        <p className="chapter-body-text">{ch.body}</p>
      ) : (
        <p className="chapter-body-text is-silent">
          No Guardian article matched “{ch.keyword}” in this window ({ch.dateRange}). The
          archive is silent here.
        </p>
      )}
      {hasHero && (
        <div className="chapter-provenance">
          {ch.grounded
            ? "Narration · AI-written from the Guardian articles of this window"
            : "Guardian standfirst · AI narration unavailable"}
        </div>
      )}
    </>
  );

  const guardianBox = hasHero ? (
    <GuardianBox
      excerpt={ch.guardian.excerpt}
      date={ch.guardian.date}
      section={ch.guardian.section}
      byline={ch.guardian.byline}
      articleId={ch.guardian.articleId}
      onReadMore={onReadMore}
    />
  ) : null;

  const meta = hasHero ? (
    <div className="chapter-meta">
      <div className="meta-row">
        <span>Section</span>
        <span>{ch.guardian.section}</span>
      </div>
      <div className="meta-row">
        <span>Word count</span>
        <span>{ch.wordcount.toLocaleString("en-GB")}</span>
      </div>
      <div className="meta-row">
        <span>Scorer</span>
        <span>{ch.score}/100</span>
      </div>
      <div className="meta-row">
        <span>Archive matches</span>
        <span>{ch.archiveMatches.toLocaleString("en-GB")}</span>
      </div>
      <div className="meta-row">
        <span>Visual</span>
        <span>{ch.imageUrl ? "Guardian image" : "Typographic noise"}</span>
      </div>
      <div className="meta-row">
        <span>Source</span>
        <span>theguardian.com</span>
      </div>
    </div>
  ) : null;

  const strataLimit = ch.arcTag === "Response" ? 8 : ch.arcTag === "Aftermath" ? 4 : 5;

  return (
    <article ref={ref} className={`chapter act-${ch.arcTag.toLowerCase()}`} data-act={ch.arcTag}>
      {/* Top bar */}
      <div className="chapter-bar">
        <div className="chapter-num">CH.{num}</div>
        <div className="chapter-arc-tag">{ch.arcTag}</div>
        <div className="chapter-title-bar">{ch.arcLabel.toUpperCase()}</div>
        <div className="chapter-score-bar">
          Scorer <span className="score-val">{hasHero ? `${ch.score}/100` : "—"}</span>
        </div>
        <div className="chapter-date">{ch.dateRange}</div>
      </div>

      {/* Crisis: full-bleed stage */}
      {isCrisis && (
        <div className="chapter-stage">
          {ch.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="stage-img"
              src={ch.imageUrl}
              alt=""
              onLoad={() => refreshScroll()}
              onError={hideOnError}
            />
          ) : (
            <div className="stage-fallback">{noise}</div>
          )}
          <div className="stage-shade" />
          <div className="stage-meta">
            <span>
              CH.{num} · {ch.arcTag}
            </span>
            <span>{ch.guardian.date}</span>
          </div>
          <h2
            className={`stage-headline${
              ch.headline.length > 110 ? " is-xlong" : ch.headline.length > 60 ? " is-long" : ""
            }`}
          >
            {ch.headline}
          </h2>
        </div>
      )}

      {/* Body */}
      <div className="chapter-body">
        <div className="chapter-left">
          <div>
            {narration}
            {!isCrisis && guardianBox}
          </div>
          {meta}
        </div>

        {isCrisis ? (
          <div className="chapter-side">{guardianBox}</div>
        ) : (
          <div className="chapter-right">
            {ch.imageUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="chapter-img"
                  src={ch.imageUrl}
                  alt=""
                  loading="lazy"
                  onLoad={() => refreshScroll()}
                  onError={hideOnError}
                />
                <div className="chapter-img-overlay" />
              </>
            )}
            {noise}
            {isSignal && <div className="signal-crack" />}
            <div className="chapter-right-badge">
              CH.{num} · {ch.arcTag}
            </div>
            <div className="chapter-right-date">{ch.dateRange}</div>
          </div>
        )}
      </div>

      {/* Other articles from the same window */}
      <SourceStrata items={ch.secondary} limit={strataLimit} onOpen={onReadMore} />

      {/* Coverage analysis */}
      <AIBlock label="Coverage" text={coverageText(ch)} />
    </article>
  );
}
