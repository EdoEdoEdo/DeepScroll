"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "@/app/utils/gsap";

interface AIBlockProps {
  /** Short label shown before the text, e.g. "Coverage" */
  label?: string;
  text: string;
}

export default function AIBlock({ label = "AI", text }: AIBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    // Split into word spans with textContent — never innerHTML,
    // the text comes from an LLM and from user input
    textEl.replaceChildren(
      ...text
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => {
          const span = document.createElement("span");
          span.className = "ai-word";
          span.textContent = `${word} `;
          return span;
        })
    );

    const wordEls = textEl.querySelectorAll(".ai-word");

    const ctx = gsap.context(() => {
      gsap.set(wordEls, { opacity: 0 });

      ScrollTrigger.create({
        trigger: container,
        start: "top 92%",
        once: true,
        onEnter: () => {
          gsap.to(wordEls, {
            opacity: 1,
            duration: 0.08,
            stagger: 0.02,
            ease: "none",
          });
        },
      });
    }, container);

    return () => ctx.revert();
  }, [text]);

  return (
    <div ref={ref} className="chapter-ai-block">
      <div className="ai-label">{label} //</div>
      <div ref={textRef} className="ai-text" aria-label={text} />
    </div>
  );
}
