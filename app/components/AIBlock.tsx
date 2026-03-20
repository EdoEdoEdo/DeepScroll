"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "@/app/utils/gsap";

interface AIBlockProps {
  text: string;
}

export default function AIBlock({ text }: AIBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    // Split text into word spans
    const words = text.split(/\s+/);
    textEl.innerHTML = words
      .map((w) => `<span class="ai-word">${w} </span>`)
      .join("");

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
      <div className="ai-label">AI //</div>
      <div ref={textRef} className="ai-text" />
    </div>
  );
}
