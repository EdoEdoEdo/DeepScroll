"use client";

import { useState } from "react";
import type { SourceRef } from "@/app/utils/types";
import { formatGuardianDate } from "@/app/utils/text";
import { refreshScroll } from "@/app/utils/gsap";

interface SourceStrataProps {
  items: SourceRef[];
  /** Rows shown before "show all" */
  limit?: number;
  onOpen?: (articleId: string) => void;
}

/**
 * The other ranked articles from a chapter's window, as a readable
 * stratigraphic index. Every row opens the full article.
 */
export default function SourceStrata({ items, limit = 5, onOpen }: SourceStrataProps) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, limit);
  const hidden = items.length - visible.length;

  function toggle() {
    setExpanded((v) => !v);
    // Rows below change height: re-measure pins and triggers
    refreshScroll(50);
  }

  return (
    <div className="strata-index">
      <div className="strata-index-head">
        <span>Strata · {items.length} more articles from this window</span>
        <span>The Guardian</span>
      </div>
      <ol className="strata-index-list">
        {visible.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              className="strata-row"
              onClick={() => onOpen?.(item.id)}
              title="Read the full article"
            >
              <span className="strata-row-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="strata-row-date">{formatGuardianDate(item.date)}</span>
              <span className="strata-row-title">{item.title}</span>
              <span className="strata-row-section">{item.section}</span>
            </button>
          </li>
        ))}
      </ol>
      {(hidden > 0 || expanded) && items.length > limit && (
        <button type="button" className="strata-more" onClick={toggle}>
          {expanded ? "− Show fewer" : `+ Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}
