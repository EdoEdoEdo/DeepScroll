interface GuardianBoxProps {
  excerpt: string;
  date: string;
  section: string;
  articleId?: string;
  onReadMore?: (articleId: string) => void;
}

export default function GuardianBox({
  excerpt,
  date,
  section,
  articleId,
  onReadMore,
}: GuardianBoxProps) {
  return (
    <div className="guardian-box">
      <div className="guardian-box-label">
        <span>Primary source · The Guardian</span>
        <span>
          {date} · {section}
        </span>
      </div>
      <div className="guardian-excerpt">
        {excerpt ? (
          <>
            &ldquo;{excerpt}&rdquo;{" "}
            <em>[Guardian excerpt · real copy]</em>
          </>
        ) : (
          <em>[Excerpt not available for this article]</em>
        )}
      </div>
      {articleId && onReadMore && (
        <button
          className="guardian-read-more"
          onClick={() => onReadMore(articleId)}
        >
          Read full article →
        </button>
      )}
    </div>
  );
}
