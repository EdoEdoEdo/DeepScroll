"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/app/utils/gsap";

interface InterludeProps {
  number: string;
  text: string;
}

export default function Interlude({ number, text }: InterludeProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      gsap.from(el, {
        scale: 0.97,
        opacity: 0,
        y: 16,
        duration: 0.6,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
        },
      });

      // Number — fade in separately with delay
      gsap.from(el.querySelector(".interlude-num"), {
        opacity: 0,
        x: -20,
        duration: 0.5,
        delay: 0.15,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
        },
      });

      // Text — stagger the text and sub
      gsap.from(el.querySelector(".interlude-text"), {
        opacity: 0,
        y: 10,
        duration: 0.5,
        delay: 0.2,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
        },
      });

      gsap.from(el.querySelector(".interlude-sub"), {
        opacity: 0,
        duration: 0.4,
        delay: 0.35,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
        },
      });
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className="chapter-interlude">
      <div className="interlude-num">{number}</div>
      <div>
        <div className="interlude-text">{text}</div>
        <div className="interlude-sub">
          DeepScroll · Guardian Archive · AI Curation
        </div>
      </div>
    </div>
  );
}
