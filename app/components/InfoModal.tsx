"use client";

import { useEffect } from "react";

interface InfoModalProps {
  open: boolean;
  onClose: () => void;
}

export default function InfoModal({ open, onClose }: InfoModalProps) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="info-overlay" onClick={onClose}>
      <div className="info-inner" onClick={(e) => e.stopPropagation()}>
        <button className="info-close" onClick={onClose}>
          ✕ Close
        </button>

        <div className="info-tag">// About this project</div>

        <div className="info-title">
          AI does not write history.<br />
          It curates it.
        </div>

        <div className="info-body">
          <p>
            DeepScroll transforms historical queries into interactive
            5-chapter documentaries. Every article, every excerpt, every
            headline comes from The Guardian&apos;s open archive — over two
            million pieces of journalism dating back to 1999.
          </p>
          <p>
            The AI acts as a director, not an author. It designs the
            narrative arc, selects the search parameters, and scores the
            results. But it never invents a single fact. The truth is
            always The Guardian&apos;s.
          </p>
        </div>

        <div className="info-divider" />

        <div className="info-detail">
          <strong>Narrative engine</strong> — 5-act dramatic structure
          (Prelude → Signal → Crisis → Response → Aftermath)<br />
          <strong>Data source</strong> — The Guardian Content API, real-time
          search and scoring<br />
          <strong>Scorer</strong> — Relevance 40% · Media 30% · Narrative
          density 20% · Tone 10%<br />
          <strong>Stack</strong> — Next.js 15 · Vercel AI SDK · GSAP
          ScrollTrigger<br />
          <strong>Design</strong> — Brutalist, data-exposed, document-first<br />
          <strong>Author</strong> —{" "}
          <a
            href="https://edoedoedo.it"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--red)", textDecoration: "none" }}
          >
            edoedoedo.it
          </a>
        </div>
      </div>
    </div>
  );
}
