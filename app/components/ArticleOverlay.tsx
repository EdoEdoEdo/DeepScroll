"use client";

import { useEffect, useState, useCallback } from "react";

interface ArticleData {
  id: string;
  webTitle: string;
  webUrl: string;
  webPublicationDate: string;
  sectionName: string;
  headline: string;
  byline: string;
  standfirst: string;
  wordcount: number;
  imageUrl: string | null;
  body: string;
}

interface ArticleOverlayProps {
  articleId: string | null;
  onClose: () => void;
}

export default function ArticleOverlay({ articleId, onClose }: ArticleOverlayProps) {
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchArticle = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setArticle(null);
    try {
      const res = await fetch(`/api/guardian/article?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setArticle(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load article");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (articleId) {
      fetchArticle(articleId);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [articleId, fetchArticle]);

  // Close on ESC
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!articleId) return null;

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="article-overlay" onClick={onClose}>
      <div className="article-overlay-inner" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button className="article-close" onClick={onClose}>
          ✕ Close
        </button>

        {loading && (
          <div className="article-loading">
            <div className="article-loading-text">Loading article...</div>
          </div>
        )}

        {error && (
          <div className="article-loading">
            <div className="article-loading-text" style={{ color: "var(--red)" }}>
              {error}
            </div>
          </div>
        )}

        {article && (
          <>
            {/* Hero image */}
            {article.imageUrl && (
              <div className="article-hero-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={article.imageUrl} alt="" />
              </div>
            )}

            <div className="article-content">
              {/* Meta bar */}
              <div className="article-meta-bar">
                <span>{article.sectionName}</span>
                <span>{formatDate(article.webPublicationDate)}</span>
                <span>{article.wordcount.toLocaleString()} words</span>
              </div>

              {/* Headline */}
              <h1 className="article-headline">{article.headline}</h1>

              {/* Byline */}
              {article.byline && (
                <div className="article-byline">{article.byline}</div>
              )}

              {/* Standfirst */}
              {article.standfirst && (
                <div
                  className="article-standfirst"
                  dangerouslySetInnerHTML={{ __html: article.standfirst }}
                />
              )}

              {/* Divider */}
              <div className="article-divider" />

              {/* Body */}
              <div
                className="article-body-html"
                dangerouslySetInnerHTML={{ __html: article.body }}
              />

              {/* Source link */}
              <div className="article-source">
                <a
                  href={article.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read original on theguardian.com →
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
