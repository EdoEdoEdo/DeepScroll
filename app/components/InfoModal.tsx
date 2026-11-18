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
            DeepScroll turns a historical query into a 5-act documentary
            built from The Guardian&apos;s open archive: over two million
            pieces of journalism dating back to 1999.
          </p>
          <p>
            The AI acts as director: it designs the arc, the search for each
            act and the voiceover. Then the Guardian archive is searched and
            ranked, and the best article becomes the primary source of each
            act. Headlines, excerpts and sources are real Guardian copy; the
            narration is the AI&apos;s, and every act links back to its source.
          </p>
        </div>

        <div className="info-divider" />

        <div className="info-detail">
          <strong>Narrative engine</strong> — 5-act dramatic structure
          (Prelude → Signal → Crisis → Response → Aftermath)<br />
          <strong>Data source</strong> — The Guardian Content API, real-time
          search and scoring<br />
          <strong>Scorer</strong> — Relevance 50% · Tone 15% · Narrative
          density 15% · Date proximity 10% · Media 10%<br />
          <strong>Models</strong> — GPT-OSS 120B on Groq · Mistral Small 4 as
          automatic fallback<br />
          <strong>Stack</strong> — Next.js 15 · GSAP ScrollTrigger · NDJSON
          streaming<br />
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
