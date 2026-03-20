import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import type { LanguageModelV1 } from "ai";

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  modelId: string;
}

/**
 * Available models for the UI switch.
 * Only models whose API key is configured will be shown.
 */
export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "groq-llama",
    label: "Llama 3.3 70B",
    provider: "groq",
    modelId: "llama-3.3-70b-versatile",
  },
  {
    id: "mistral-small",
    label: "Mistral Small",
    provider: "mistral",
    modelId: "mistral-small-latest",
  },
];

/**
 * Get a language model instance by option ID.
 * Throws if the required API key is not configured.
 */
export function getModel(optionId: string): LanguageModelV1 {
  const option = MODEL_OPTIONS.find((m) => m.id === optionId);
  if (!option) {
    throw new Error(`Unknown model: ${optionId}`);
  }

  switch (option.provider) {
    case "groq": {
      const key = process.env.GROQ_API_KEY;
      if (!key) throw new Error("GROQ_API_KEY is not configured");
      const groq = createGroq({ apiKey: key });
      return groq(option.modelId);
    }
    case "mistral": {
      const key = process.env.MISTRAL_API_KEY;
      if (!key) throw new Error("MISTRAL_API_KEY is not configured");
      const mistral = createMistral({ apiKey: key });
      return mistral(option.modelId);
    }
    default:
      throw new Error(`Unknown provider: ${option.provider}`);
  }
}

/**
 * Get available models (only those with configured API keys).
 * Called by the health/models endpoint.
 */
export function getAvailableModels(): Array<ModelOption & { available: boolean }> {
  return MODEL_OPTIONS.map((m) => {
    let available = false;
    switch (m.provider) {
      case "groq":
        available = Boolean(process.env.GROQ_API_KEY);
        break;
      case "mistral":
        available = Boolean(process.env.MISTRAL_API_KEY);
        break;
    }
    return { ...m, available };
  });
}
