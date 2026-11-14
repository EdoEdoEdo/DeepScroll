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
            The AI works in two passes. First it reads real Guardian
            headlines to plan the arc and the searches. Then, once the
            articles are retrieved and ranked, it writes the narration using
            only what those articles say. Headlines, excerpts and sources are
            Guardian copy; every act links back to the article it stands on.
          </p>
        </div>

        <div className="info-divider" />

        <div className="info-detail">
          <strong>Narrative engine</strong> — 5-act dramatic structure
          (Prelude → Signal → Crisis → Response → Aftermath)<br />
          <strong>Data source</strong> — The Guardian Content API, real-time
          search and scoring<br />
          <strong>Scorer</strong> — Relevance 35% · Date proximity 25% · Tone
          20% · Narrative density 10% · Media 10%<br />
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
