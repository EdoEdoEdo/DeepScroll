"use client";

import { useState } from "react";

interface ApiItem {
  id: string;
  webTitle: string;
  sectionName: string;
  webPublicationDate: string;
  webUrl: string;
  type: string;
  score: number;
  breakdown: { relevance: number; proximity: number; tone: number; narrative: number; media: number };
  wordcount: number;
  hasImage: boolean;
  imageUrl: string | null;
  trailText: string;
  byline: string;
  bodyExcerpt: string;
}

interface GuardianResponse {
  total: number;
  items: ApiItem[];
}

interface PlanResponse {
  query: string;
  evidenceCount: number;
  archiveTotal: number;
  evidence: string[];
  model: { id: string; label: string };
  chapters: Array<{
    index: number;
    arcTag: string;
    arcLabel: string;
    dateRange: string;
    dateFrom: string;
    dateTo: string;
    focusDate: string;
    keyword: string;
    section?: string;
  }>;
}

interface HealthResponse {
  status: string;
  hint: string;
  checks: Record<string, { ok: boolean; detail: string }>;
  guardianRateLimit: Record<string, string>;
}

const PRESETS = [
  { label: "2008 Financial Crisis", q: "financial crisis", from: "2007-01-01", to: "2009-12-31", focus: "2008-09-15", section: "business" },
  { label: "COVID-19", q: "covid pandemic lockdown", from: "2019-12-01", to: "2020-12-31", focus: "2020-03-23", section: "" },
  { label: "Brexit Referendum", q: "brexit referendum", from: "2016-01-01", to: "2016-12-31", focus: "2016-06-24", section: "politics" },
  { label: "Lehman Brothers", q: "lehman brothers bankruptcy", from: "2008-09-01", to: "2008-10-31", focus: "2008-09-15", section: "business" },
  { label: "Arab Spring", q: "arab spring revolution", from: "2010-12-01", to: "2012-06-30", focus: "2011-02-11", section: "world" },
];

export default function DiagnosticPage() {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [focus, setFocus] = useState("");
  const [section, setSection] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GuardianResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [orchQuery, setOrchQuery] = useState("");
  const [orchLoading, setOrchLoading] = useState(false);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [orchError, setOrchError] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  async function runSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const params = new URLSearchParams({ q: query.trim() });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (focus) params.set("focus", focus);
    if (section) params.set("section", section);

    try {
      const res = await fetch(`/api/guardian?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);
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
    setPlan(null);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: orchQuery.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);
      setPlan(data);
    } catch (err) {
      setOrchError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setOrchLoading(false);
    }
  }

  async function runHealth() {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/health");
      setHealth(await res.json());
    } catch {
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  }

  function applyPreset(p: (typeof PRESETS)[number]) {
    setQuery(p.q);
    setFrom(p.from);
    setTo(p.to);
    setFocus(p.focus);
    setSection(p.section);
  }

  const hero = result?.items?.[0] ?? null;

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontFamily: "var(--display)", fontSize: "clamp(36px, 8vw, 64px)", lineHeight: 0.95, marginBottom: 8 }}>
        DEEPSCROLL
      </h1>
      <p style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--mid)", marginBottom: 40 }}>
        // Dev diagnostic — health · Guardian + scorer v3 · arc planning
      </p>

      {/* ── Health ───────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>Health</h2>
        <button onClick={runHealth} disabled={healthLoading} style={btnStyle}>
          {healthLoading ? "..." : "CHECK"}
        </button>
        {health && (
          <div style={{ marginTop: 16, fontSize: 12, lineHeight: 1.8 }}>
            <div style={{ fontWeight: 500, color: health.status === "ready" ? "#2e7d32" : "var(--red)" }}>
              {health.status.toUpperCase()} — {health.hint}
            </div>
            {Object.entries(health.checks).map(([name, check]) => (
              <div key={name}>
                <span style={{ color: check.ok ? "#2e7d32" : "var(--red)" }}>{check.ok ? "●" : "○"}</span>{" "}
                <strong>{name}</strong> — {check.detail}
              </div>
            ))}
            {Object.keys(health.guardianRateLimit).length > 0 && (
              <div style={{ color: "var(--mid)", marginTop: 8 }}>
                Guardian rate limit:{" "}
                {Object.entries(health.guardianRateLimit)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" · ")}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Guardian Search ──────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>Guardian API + Scorer v3</h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => applyPreset(p)} style={chipStyle}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 16 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} placeholder="Query" style={inputStyle} />
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="from YYYY-MM-DD" style={inputStyle} />
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="to YYYY-MM-DD" style={inputStyle} />
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="focus date" style={inputStyle} />
          <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="section" style={inputStyle} />
          <button onClick={runSearch} disabled={loading} style={btnStyle}>
            {loading ? "..." : "FETCH"}
          </button>
        </div>

        {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 16 }}>Error: {error}</div>}

        {result && (
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--mid)", marginBottom: 12 }}>
              {result.total.toLocaleString("en-GB")} archive matches · top {result.items.length} ranked
            </div>

            {hero && (
              <div style={{ border: "2px solid var(--ink)", padding: 20, marginBottom: 16, background: "#f9f7f0" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--red)", marginBottom: 8 }}>
                  ★ Hero article · Score {hero.score}/100
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
                  <span>P:{hero.breakdown.proximity}</span>
                  <span>T:{hero.breakdown.tone}</span>
                  <span>N:{hero.breakdown.narrative}</span>
                  <span>M:{hero.breakdown.media}</span>
                  <span>{hero.wordcount} words</span>
                  <span>{hero.type}</span>
                  <span>{hero.sectionName}</span>
                  <span>{hero.webPublicationDate.slice(0, 10)}</span>
                </div>
                {hero.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={hero.imageUrl} alt="" style={{ marginTop: 12, maxWidth: 400, filter: "grayscale(100%) contrast(1.3)" }} />
                )}
              </div>
            )}

            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--ink)", textAlign: "left" }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Score</th>
                  <th style={thStyle}>R</th>
                  <th style={thStyle}>P</th>
                  <th style={thStyle}>T</th>
                  <th style={thStyle}>N</th>
                  <th style={thStyle}>M</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Title</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item, i) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={tdStyle}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{item.score}</td>
                    <td style={tdStyle}>{item.breakdown.relevance}</td>
                    <td style={tdStyle}>{item.breakdown.proximity}</td>
                    <td style={tdStyle}>{item.breakdown.tone}</td>
                    <td style={tdStyle}>{item.breakdown.narrative}</td>
                    <td style={tdStyle}>{item.breakdown.media}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{item.webPublicationDate.slice(0, 10)}</td>
                    <td style={tdStyle}>
                      <a href={item.webUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)" }}>
                        {item.webTitle}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Arc planning ─────────────────────────────── */}
      <section style={{ ...sectionStyle, borderBottom: "none" }}>
        <h2 style={h2Style}>Arc planning (LLM pass 1, grounded)</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 16 }}>
          <input value={orchQuery} onChange={(e) => setOrchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runOrchestrate()} placeholder="Historical query, e.g. Brexit" style={inputStyle} />
          <button onClick={runOrchestrate} disabled={orchLoading} style={btnStyle}>
            {orchLoading ? "..." : "PLAN"}
          </button>
        </div>

        {orchError && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 16 }}>Error: {orchError}</div>}

        {plan && (
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--mid)", marginBottom: 12 }}>
              {plan.model.label} · anchored to {plan.evidenceCount} headlines · {plan.archiveTotal.toLocaleString("en-GB")} archive matches
            </div>

            {plan.chapters.map((ch) => (
              <div key={ch.index} style={{ border: "1px solid var(--ink)", borderBottom: ch.index < 4 ? "none" : "1px solid var(--ink)", padding: 16, display: "grid", gridTemplateColumns: "60px 110px 1fr", gap: 16, alignItems: "start" }}>
                <div style={{ fontFamily: "var(--display)", fontSize: 20 }}>CH.0{ch.index + 1}</div>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", background: "var(--red)", color: "white", padding: "4px 8px", display: "inline-block", marginBottom: 4 }}>
                    {ch.arcTag}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--mid)" }}>{ch.dateRange}</div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--cond)", fontSize: 16, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                    {ch.arcLabel}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--mid)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>
                      q: <strong>{ch.keyword}</strong>
                    </span>
                    <span>
                      {ch.dateFrom} → {ch.dateTo}
                    </span>
                    <span>focus {ch.focusDate}</span>
                    {ch.section && <span>section: {ch.section}</span>}
                  </div>
                </div>
              </div>
            ))}

            {plan.evidence.length > 0 && (
              <details style={{ marginTop: 16, fontSize: 11, color: "var(--mid)" }}>
                <summary style={{ cursor: "crosshair" }}>Evidence headlines ({plan.evidence.length})</summary>
                <pre style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, marginTop: 8 }}>{plan.evidence.join("\n")}</pre>
              </details>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 48,
  borderBottom: "2px solid var(--ink)",
  paddingBottom: 48,
};
const h2Style: React.CSSProperties = {
  fontFamily: "var(--cond)",
  fontSize: 24,
  textTransform: "uppercase",
  marginBottom: 16,
};
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
  padding: "8px 6px", fontSize: 10, letterSpacing: "0.1em",
  textTransform: "uppercase", color: "var(--mid)",
};
const tdStyle: React.CSSProperties = { padding: "8px 6px" };
