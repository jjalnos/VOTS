import type { ExternalResearchProvider, InternalArchiveAIProvider } from "@/lib/ai/types";
import { LocalOpenAICompatibleProvider } from "@/lib/ai/local-provider";
import { MockArchiveAIProvider } from "@/lib/ai/mock-provider";
import { OpenAIResearchProvider } from "@/lib/ai/openai-research-provider";

export function getInternalArchiveAIProvider(): InternalArchiveAIProvider {
  const baseUrl = process.env.LOCAL_AI_BASE_URL;
  const model = process.env.LOCAL_AI_MODEL;
  const provider = process.env.INTERNAL_AI_PROVIDER ?? "local_openai_compatible";
  if (provider === "local_openai_compatible" && baseUrl && model) {
    return new LocalOpenAICompatibleProvider(baseUrl, model, process.env.LOCAL_AI_AUTH_TOKEN);
  }
  return new MockArchiveAIProvider();
}

export function getExternalResearchProvider(): ExternalResearchProvider {
  const liveEnabled =
    process.env.EXTERNAL_RESEARCH_PROVIDER === "openai" &&
    process.env.OPENAI_EXTERNAL_RESEARCH_ENABLED === "true";
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_RESEARCH_MODEL;
  if (liveEnabled && apiKey && model) {
    return new OpenAIResearchProvider(apiKey, model);
  }
  return new MockArchiveAIProvider();
}
