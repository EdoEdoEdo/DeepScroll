"use client";

import { useState, useEffect } from "react";
import InfoModal from "./InfoModal";

interface ModelOption {
  id: string;
  label: string;
  provider: string;
  available: boolean;
}

const PRESETS = [
  { label: "Brexit", query: "Brexit" },
  { label: "COVID-19", query: "COVID-19 Pandemic" },
  { label: "Ukraine", query: "War in Ukraine" },
  { label: "Afghanistan", query: "Fall of Afghanistan" },
  { label: "US Election 2024", query: "US Election 2024" },
  { label: "Trump", query: "Donald Trump" },
  { label: "Hong Kong", query: "Hong Kong Protests" },
];

interface QueryScreenProps {
  onSubmit: (query: string, modelId: string) => void;
}

export default function QueryScreen({ onSubmit }: QueryScreenProps) {
  const [value, setValue] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);

  // Fetch available models on mount
  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        const available = (data.models ?? []).filter(
          (m: ModelOption) => m.available
        );
        setModels(available);
        if (available.length > 0 && !selectedModel) {
          setSelectedModel(available[0].id);
        }
      })
      .catch(() => {});
  }, [selectedModel]);

  function handleSubmit() {
    const q = value.trim();
    if (q && selectedModel) onSubmit(q, selectedModel);
  }

  return (
    <section className="query-screen">
      {/* Signature */}
      <a
        href="https://edoedoedo.it"
        target="_blank"
        rel="noopener noreferrer"
        className="signature"
      >
        EDOEDOEDO
      </a>

      {/* Info button */}
      <button className="info-btn" onClick={() => setInfoOpen(true)}>
        Info
      </button>

      <div className="query-eyebrow">
        <span className="query-eyebrow-brand">DEEPSCROLL</span>
        <span> — Digital Archive Intelligence</span>
        <span className="query-eyebrow-ver">v1.0</span>
      </div>

      <h1 className="logo">
        DEEP
        <br />
        SCROLL
      </h1>
      <div className="logo-sub">
        Historical Documentary Engine · The Guardian API · AI Orchestration
      </div>

      <div className="query-form">
        <div className="query-label">
          Enter a historical query
        </div>
        <div className="query-input-row">
          <input
            className="query-input"
            type="text"
            placeholder="Fall of Afghanistan..."
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <button className="query-submit" onClick={handleSubmit}>
            Generate ↓
          </button>
        </div>
      </div>

      <div className="query-hints">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className="hint"
            onClick={() => {
              setValue(p.query);
              onSubmit(p.query, selectedModel);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Model switch */}
      {models.length > 1 && (
        <div className="model-switch">
          <span className="model-switch-label">Model</span>
          {models.map((m) => (
            <button
              key={m.id}
              className={`model-option${selectedModel === m.id ? " active" : ""}`}
              onClick={() => setSelectedModel(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="corner-mark">
        Guardian API · AI Curator
        <br />
        5-Chapter Narrative Engine
      </div>

      {/* Info modal */}
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </section>
  );
}
