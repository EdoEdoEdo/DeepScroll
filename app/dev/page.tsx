"use client";

import { useState } from "react";

interface ApiItem {
  id: string;
  webTitle: string;
  sectionName: string;
  webPublicationDate: string;
  webUrl: string;
  score: number;
  breakdown: { relevance: number; media: number; narrative: number; tone: number };
  wordcount: number;
  hasImage: boolean;
  thumbnail: string | null;
  imageUrl: string | null;
  trailText: string;
  standfirst: string;
  byline: string;
  bodyExcerpt: string;
}

interface GuardianResponse {
  total: number;
  pages: number;
  items: ApiItem[];
  error?: string;
}

interface ArcPlan {
  query: string;
  subtitle: string;
  interludes?: string[];
  chapters: Array<{
    index: number;
    arcTag: string;
    arcLabel: string;
    dateRange: string;
    keyword: string;
    dateFrom: string;
    dateTo: string;
    section?: string;
    synopsis: string;
    aiHint?: string;
  }>;
}

const PRESETS = [
  { label: "2008 Financial Crisis", q: "financial crisis", from: "2007-01-01", to: "2009-12-31", section: "business" },
  { label: "COVID-19", q: "covid pandemic lockdown", from: "2019-12-01", to: "2020-12-31", section: "" },
  { label: "Brexit Referendum", q: "brexit referendum", from: "2016-01-01", to: "2016-12-31", section: "politics" },
  { label: "Lehman Brothers", q: "lehman brothers bankruptcy", from: "2008-09-01", to: "2008-10-31", section: "business" },
  { label: "Arab Spring", q: "arab spring revolution", from: "2010-12-01", to: "2012-06-30", section: "world" },
];

export default function DiagnosticPage() {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [section, setSection] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GuardianResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [orchQuery, setOrchQuery] = useState("");
  const [orchLoading, setOrchLoading] = useState(false);
  const [arcPlan, setArcPlan] = useState<ArcPlan | null>(null);
  const [orchError, setOrchError] = useState<string | null>(null);

  async function runSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const params = new URLSearchParams({ q: query.trim() });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (section) params.set("section", section);

    try {
      const res = await fetch(`/api/guardian?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function runOrchestrate() {
    if (!orchQuery.trim()) return;
    setOrchLoading(true);
    setOrchError(null);
    setArcPlan(null);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: orchQuery.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
      setArcPlan(data);
    } catch (err) {
      setOrchError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setOrchLoading(false);
    }
  }

  function applyPreset(p: (typeof PRESETS)[number]) {
    setQuery(p.q);
    setFrom(p.from);
    setTo(p.to);
    setSection(p.section);
  }

  const hero = result?.items?.[0] ?? null;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontFamily: "var(--display)", fontSize: "clamp(36px, 8vw, 64px)", lineHeight: 0.95, marginBottom: 8 }}>
        DEEPSCROLL
      </h1>
      <p style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--mid)", marginBottom: 40 }}>
        // Dev Diagnostic — Guardian API + Scorer + Orchestrate
      </p>

      {/* ── Guardian Search ────────────────────────────── */}
      <section style={{ marginBottom: 48, borderBottom: "2px solid var(--ink)", paddingBottom: 48 }}>
        <h2 style={{ fontFamily: "var(--cond)", fontSize: 24, textTransform: "uppercase", marginBottom: 16 }}>
          Guardian API + Scorer
        </h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => applyPreset(p)} style={chipStyle}>{p.label}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 16 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} placeholder="Query" style={inputStyle} />
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="from-date" style={inputStyle} />
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="to-date" style={inputStyle} />
          <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="section" style={inputStyle} />
          <button onClick={runSearch} disabled={loading} style={btnStyle}>{loading ? "..." : "FETCH"}</button>
        </div>

        {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 16 }}>Error: {error}</div>}

        {result && (
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--mid)", marginBottom: 12 }}>
              {result.total.toLocaleString()} results · showing top {result.items.length} scored
            </div>

            {hero && (
              <div style={{ border: "2px solid var(--ink)", padding: 20, marginBottom: 16, background: "#f9f7f0" }}>
                <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--red)", marginBottom: 8 }}>
                  ★ Hero Article · Score {hero.score}/100
                </div>
                <div style={{ fontFamily: "var(--cond)", fontSize: 22, fontWeight: 900, textTransform: "uppercase", marginBottom: 8 }}>
                  {hero.webTitle}
                </div>
                {hero.bodyExcerpt && (
                  <div style={{ fontFamily: "var(--serif)", fontSize: 13, fontStyle: "italic", color: "#333", marginBottom: 8, lineHeight: 1.6 }}>
                    &ldquo;{hero.bodyExcerpt}&rdquo;
                  </div>
                )}
                <div style={{ fontSize: 10, color: "var(--mid)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <span>R:{hero.breakdown.relevance}</span>
                  <span>M:{hero.breakdown.media}</span>
                  <span>N:{hero.breakdown.narrative}</span>
                  <span>T:{hero.breakdown.tone}</span>
                  <span>{hero.wordcount} words</span>
                  <span>{hero.hasImage ? "has image" : "no image"}</span>
                  <span>{hero.sectionName}</span>
                </div>
                {hero.imageUrl && (
                  <img src={hero.imageUrl} alt="" style={{ marginTop: 12, maxWidth: 400, filter: "grayscale(100%) contrast(1.3)" }} />
                )}
              </div>
            )}

            {result.items.length > 1 && (
              <div style={{ fontSize: 10, color: "var(--mid)", marginBottom: 16, lineHeight: 1.8 }}>
                <strong>Noise titles:</strong>{" "}
                {result.items.slice(1, 8).map((s) => s.webTitle.toUpperCase()).join(" · ")}
              </div>
            )}

            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--ink)", textAlign: "left" }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Score</th>
                  <th style={thStyle}>Title</th>
                  <th style={thStyle}>Section</th>
                  <th style={thStyle}>Words</th>
                  <th style={thStyle}>Img</th>
                  <th style={thStyle}>R/M/N/T</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={tdStyle}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 500, color: s.score >= 70 ? "var(--ink)" : "var(--mid)" }}>{s.score}</td>
                    <td style={tdStyle}>
                      <a href={s.webUrl} target="_blank" rel="noopener" style={{ color: "var(--ink)", textDecoration: "none" }}>
                        {s.webTitle.length > 80 ? s.webTitle.slice(0, 80) + "..." : s.webTitle}
                      </a>
                    </td>
                    <td style={tdStyle}>{s.sectionName}</td>
                    <td style={tdStyle}>{s.wordcount || "—"}</td>
                    <td style={tdStyle}>{s.hasImage ? "✓" : "—"}</td>
                    <td style={{ ...tdStyle, color: "var(--mid)", fontSize: 10 }}>
                      {s.breakdown.relevance}/{s.breakdown.media}/{s.breakdown.narrative}/{s.breakdown.tone}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── LLM Orchestrate ───────────────────────────── */}
      <section>
        <h2 style={{ fontFamily: "var(--cond)", fontSize: 24, textTransform: "uppercase", marginBottom: 16 }}>
          LLM Arc Orchestration (Groq)
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 16 }}>
          <input value={orchQuery} onChange={(e) => setOrchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runOrchestrate()} placeholder="Historical query (e.g. 2008 Financial Crisis)" style={inputStyle} />
          <button onClick={runOrchestrate} disabled={orchLoading} style={btnStyle}>
            {orchLoading ? "Generating..." : "ORCHESTRATE"}
          </button>
        </div>

        {orchError && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 16 }}>Error: {orchError}</div>}

        {arcPlan && (
          <div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontStyle: "italic", marginBottom: 12, color: "#333" }}>
              {arcPlan.subtitle}
            </div>
            {arcPlan.interludes && arcPlan.interludes.length > 0 && (
              <div style={{ marginBottom: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {arcPlan.interludes.map((text, i) => (
                  <div key={i} style={{ background: "var(--red)", color: "white", padding: "8px 14px", fontFamily: "var(--cond)", fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>
                    {text}
                  </div>
                ))}
              </div>
            )}
            {arcPlan.chapters.map((ch) => (
              <div key={ch.index} style={{ border: "1px solid var(--ink)", borderBottom: ch.index < 4 ? "none" : "1px solid var(--ink)", padding: 16, display: "grid", gridTemplateColumns: "60px 100px 1fr", gap: 16, alignItems: "start" }}>
                <div style={{ fontFamily: "var(--display)", fontSize: 20 }}>CH.0{ch.index + 1}</div>
                <div>
                  <div style={{ fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase", background: "var(--red)", color: "white", padding: "4px 8px", display: "inline-block", marginBottom: 4 }}>
                    {ch.arcTag}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--mid)" }}>{ch.dateRange}</div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--cond)", fontSize: 16, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                    {ch.arcLabel}
                  </div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 12, fontStyle: "italic", color: "#333", lineHeight: 1.6, marginBottom: 8 }}>{ch.synopsis}</div>
                  {ch.aiHint && (
                    <div style={{ fontSize: 10, color: "var(--red)", lineHeight: 1.5, marginBottom: 8 }}>
                      AI // {ch.aiHint}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "var(--mid)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>q: <strong>{ch.keyword}</strong></span>
                    <span>{ch.dateFrom} → {ch.dateTo}</span>
                    {ch.section && <span>section: {ch.section}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--mono)", fontSize: 12, padding: "10px 12px",
  border: "1px solid var(--ink)", background: "transparent", outline: "none",
};
const btnStyle: React.CSSProperties = {
  fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.15em",
  textTransform: "uppercase", padding: "10px 20px", background: "var(--ink)",
  color: "var(--paper)", border: "none", cursor: "crosshair", whiteSpace: "nowrap",
};
const chipStyle: React.CSSProperties = {
  fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em",
  textTransform: "uppercase", padding: "6px 12px", border: "1px solid #ccc",
  background: "transparent", cursor: "crosshair",
};
const thStyle: React.CSSProperties = {
  padding: "8px 6px", fontSize: 9, letterSpacing: "0.1em",
  textTransform: "uppercase", color: "var(--mid)",
};
const tdStyle: React.CSSProperties = { padding: "8px 6px" };
