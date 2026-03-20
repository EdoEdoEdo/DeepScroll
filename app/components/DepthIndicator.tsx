"use client";

import { useEffect, useState } from "react";

export default function DepthIndicator({ visible }: { visible: boolean }) {
  const [pct, setPct] = useState(0);
  const [currentChapter, setCurrentChapter] = useState<{
    num: string;
    tag: string;
  } | null>(null);

  useEffect(() => {
    if (!visible) return;

    function update() {
      const doc = document.getElementById("screen-doc");
      const finale = document.getElementById("doc-finale");
      if (!doc || !finale) return;

      // Depth bar progress
      const start = doc.offsetTop;
      const end = finale.offsetTop + finale.offsetHeight;
      const range = end - start - window.innerHeight;
      if (range > 0) {
        const progress = Math.min(
          100,
          Math.max(0, Math.round(((window.scrollY - start) / range) * 100))
        );
        setPct(progress);
      }

      // Find current chapter in viewport
      const chapters = doc.querySelectorAll(".chapter");
      const viewMid = window.scrollY + window.innerHeight * 0.4;
      let found: { num: string; tag: string } | null = null;

      chapters.forEach((ch, i) => {
        const el = ch as HTMLElement;
        if (viewMid >= el.offsetTop && viewMid < el.offsetTop + el.offsetHeight) {
          const tagEl = el.querySelector(".chapter-arc-tag");
          found = {
            num: `0${i + 1}`,
            tag: tagEl?.textContent ?? "",
          };
        }
      });

      setCurrentChapter(found);
    }

    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => window.removeEventListener("scroll", update);
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <div className="depth-bar">
        <div className="depth-fill" style={{ width: `${pct}%` }} />
      </div>
      {currentChapter && (
        <div className="depth-label">
          CH.{currentChapter.num} · {currentChapter.tag}
        </div>
      )}
    </>
  );
}
