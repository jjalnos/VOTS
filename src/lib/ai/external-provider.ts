import type { ExternalResearchProvider } from "@/lib/ai/types";
import { DisabledExternalResearchProvider } from "@/lib/ai/disabled-external-provider";
import { OpenAIResearchProvider } from "@/lib/ai/openai-research-provider";

export interface ExternalResearchProviderResolution {
  provider: ExternalResearchProvider;
  model: string | null;
  live: boolean;
}

export function resolveExternalResearchProvider(
  maxOutputTokens: number,
): ExternalResearchProviderResolution {
  const liveEnabled =
    process.env.EXTERNAL_RESEARCH_PROVIDER === "openai" &&
    process.env.OPENAI_EXTERNAL_RESEARCH_ENABLED === "true";
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_RESEARCH_MODEL;
  if (liveEnabled && apiKey && model) {
    return {
      provider: new OpenAIResearchProvider(apiKey, model, maxOutputTokens),
      model,
      live: true,
    };
  }
  return { provider: new DisabledExternalResearchProvider(), model: null, live: false };
}
