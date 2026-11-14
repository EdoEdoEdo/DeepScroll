/**
 * LLM layer — server only.
 *
 * Talks to Groq and Mistral through their OpenAI-compatible
 * /chat/completions endpoints with plain fetch: no SDK, so a model
 * change is a one-line edit and nothing breaks on SDK majors.
 *
 * Every call asks for JSON Schema structured output (strict, constrained
 * decoding where the provider supports it) and falls back, in order:
 *   1. same model, plain JSON mode (if the provider rejects the schema)
 *   2. next configured provider
 */

export type ProviderId = "groq" | "mistral";

export interface ModelOption {
  /** Stable ID used by the UI and the API */
  id: string;
  label: string;
  provider: ProviderId;
  /** Provider model string */
  modelId: string;
}

/**
 * Available models, in default-preference order.
 * Only models whose API key is configured are used.
 *
 * - Groq retired llama-3.3-70b-versatile on 2026-08-16;
 *   openai/gpt-oss-120b is its production replacement.
 * - Mistral: pinned snapshot (Small 4) instead of mistral-small-latest,
 *   so the model never changes underneath us.
 */
export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "groq-gpt-oss-120b",
    label: "GPT-OSS 120B",
    provider: "groq",
    modelId: "openai/gpt-oss-120b",
  },
  {
    id: "mistral-small-4",
    label: "Mistral Small 4",
    provider: "mistral",
    modelId: "mistral-small-2603",
  },
];

/** Old IDs still accepted (bookmarked clients, old presets) */
const LEGACY_IDS: Record<string, string> = {
  "groq-llama": "groq-gpt-oss-120b",
  "mistral-small": "mistral-small-4",
};

const PROVIDERS: Record<
  ProviderId,
  { envKey: string; chatUrl: string; modelsUrl: string }
> = {
  groq: {
    envKey: "GROQ_API_KEY",
    chatUrl: "https://api.groq.com/openai/v1/chat/completions",
    modelsUrl: "https://api.groq.com/openai/v1/models",
  },
  mistral: {
    envKey: "MISTRAL_API_KEY",
    chatUrl: "https://api.mistral.ai/v1/chat/completions",
    modelsUrl: "https://api.mistral.ai/v1/models",
  },
};

// ── Errors ──────────────────────────────────────────────

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

// ── Registry ────────────────────────────────────────────

export function getApiKey(provider: ProviderId): string | undefined {
  const key = process.env[PROVIDERS[provider].envKey];
  return key && key.trim().length > 0 ? key.trim() : undefined;
}

export function getAvailableModels(): Array<ModelOption & { available: boolean }> {
  return MODEL_OPTIONS.map((m) => ({ ...m, available: Boolean(getApiKey(m.provider)) }));
}

export function toModelRef(model: ModelOption): { id: string; label: string } {
  return { id: model.id, label: model.label };
}

/**
 * Configured models with the preferred one first.
 * Unknown/unavailable preferences fall back to default order.
 */
export function resolveModelChain(preferredId?: string): ModelOption[] {
  const id = preferredId ? LEGACY_IDS[preferredId] ?? preferredId : undefined;
  const available = MODEL_OPTIONS.filter((m) => getApiKey(m.provider));
  const preferred = available.find((m) => m.id === id);
  if (!preferred) return available;
  return [preferred, ...available.filter((m) => m !== preferred)];
}

// ── JSON generation ─────────────────────────────────────

export interface GenerateJsonOptions<T> {
  /** Schema name (letters, digits, underscores) */
  name: string;
  system: string;
  prompt: string;
  /** JSON Schema — strict-compatible: all properties required, additionalProperties false */
  schema: Record<string, unknown>;
  /** Validate/normalize the parsed JSON; throw to reject it */
  validate: (raw: unknown) => T;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  preferredModel?: string;
  /** Called on each failed attempt (for logs) */
  onAttemptError?: (model: ModelOption, err: Error) => void;
}

type ResponseMode = "json_schema" | "json_object";

export async function generateJson<T>(
  opts: GenerateJsonOptions<T>
): Promise<{ data: T; model: ModelOption }> {
  const chain = resolveModelChain(opts.preferredModel);
  if (chain.length === 0) {
    throw new LlmError("No LLM configured — set GROQ_API_KEY or MISTRAL_API_KEY");
  }

  const failures: string[] = [];

  for (const model of chain) {
    const modes: ResponseMode[] = ["json_schema", "json_object"];
    for (const mode of modes) {
      try {
        const text = await callChat(model, opts, mode);
        const data = opts.validate(parseJson(text));
        return { data, model };
      } catch (err) {
        const e = toError(err);
        failures.push(`${model.label} [${mode}]: ${e.message}`);
        opts.onAttemptError?.(model, e);
        // Only retry in plain JSON mode when the provider rejected the request itself
        const schemaRejected = e instanceof HttpError && e.status === 400;
        if (!(mode === "json_schema" && schemaRejected)) break;
      }
    }
  }

  throw new LlmError(`All models failed — ${failures.join(" | ")}`);
}

async function callChat<T>(
  model: ModelOption,
  opts: GenerateJsonOptions<T>,
  mode: ResponseMode
): Promise<string> {
  const provider = PROVIDERS[model.provider];
  const key = getApiKey(model.provider);
  if (!key) throw new Error(`${provider.envKey} not set`);

  const system =
    mode === "json_object"
      ? `${opts.system}\n\nReturn ONLY a JSON object that matches this JSON Schema:\n${JSON.stringify(opts.schema)}`
      : opts.system;

  const body: Record<string, unknown> = {
    model: model.modelId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: opts.prompt },
    ],
    temperature: opts.temperature ?? 0.6,
    response_format:
      mode === "json_schema"
        ? {
            type: "json_schema",
            json_schema: { name: opts.name, strict: true, schema: opts.schema },
          }
        : { type: "json_object" },
  };

  if (model.provider === "groq") {
    // gpt-oss is a reasoning model: keep reasoning short and out of the content
    body.max_completion_tokens = opts.maxTokens;
    body.reasoning_effort = "low";
    body.include_reasoning = false;
  } else {
    // Mistral Small 4 defaults to no reasoning → plain string content
    body.max_tokens = opts.maxTokens;
  }

  const res = await fetch(provider.chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new HttpError(res.status, `HTTP ${res.status} ${detail.slice(0, 240)}`.trim());
  }

  const json = (await res.json()) as {
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: unknown };
    }>;
  };

  const choice = json.choices?.[0];
  const text = extractText(choice?.message?.content);

  if (choice?.finish_reason === "length") {
    throw new Error("Response truncated (max tokens reached)");
  }
  if (!text.trim()) {
    throw new Error(`Empty response (finish_reason: ${choice?.finish_reason ?? "unknown"})`);
  }
  return text;
}

/** Content is a string, or (Mistral reasoning mode) an array of typed chunks */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((chunk) => {
        if (chunk && typeof chunk === "object") {
          const c = chunk as { type?: string; text?: unknown };
          if (c.type === "text" && typeof c.text === "string") return c.text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

/** Parse JSON, tolerating markdown fences or stray text around the object */
export function parseJson(raw: string): unknown {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Invalid JSON: ${cleaned.slice(0, 160)}`);
  }
}

// ── Health ──────────────────────────────────────────────

/**
 * Verify key + model availability via the provider's /models list.
 * Costs no tokens, and catches retired models (the 2026 outage).
 */
export async function checkProvider(
  provider: ProviderId
): Promise<{ ok: boolean; detail: string }> {
  const key = getApiKey(provider);
  const def = PROVIDERS[provider];
  if (!key) return { ok: false, detail: `${def.envKey} not set` };

  const wanted = MODEL_OPTIONS.filter((m) => m.provider === provider).map((m) => m.modelId);

  try {
    const res = await fetch(def.modelsUrl, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 120)}` };
    }
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = new Set((json.data ?? []).map((m) => m.id).filter(Boolean));
    const missing = wanted.filter((id) => !ids.has(id));
    if (missing.length > 0) {
      return {
        ok: false,
        detail: `Key valid, but model not listed (retired?): ${missing.join(", ")}`,
      };
    }
    return { ok: true, detail: `Key valid · ${wanted.join(", ")} available` };
  } catch (err) {
    return { ok: false, detail: `Network error: ${toError(err).message}` };
  }
}
