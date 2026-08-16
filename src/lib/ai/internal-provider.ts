import type {
  InternalAIUsageMetadata,
  InternalArchiveAIProvider,
} from "@/lib/ai/types";
import { isSafeInternalAIEndpoint } from "@/lib/ai/internal-endpoint";
import { LocalOpenAICompatibleProvider } from "@/lib/ai/local-provider";
import { MockArchiveAIProvider } from "@/lib/ai/mock-provider";

export function getInternalArchiveAIProvider(): InternalArchiveAIProvider {
  const baseUrl = process.env.LOCAL_AI_BASE_URL;
  const model = process.env.LOCAL_AI_MODEL;
  const provider = process.env.INTERNAL_AI_PROVIDER ?? "local_openai_compatible";
  if (
    provider === "local_openai_compatible" &&
    baseUrl &&
    model &&
    isSafeInternalAIEndpoint(baseUrl)
  ) {
    return new LocalOpenAICompatibleProvider(baseUrl, model, process.env.LOCAL_AI_AUTH_TOKEN);
  }
  return new MockArchiveAIProvider();
}

export async function runInternalArchiveTask<T>(
  task: (provider: InternalArchiveAIProvider) => Promise<T>,
): Promise<{
  result: T;
  provider: InternalArchiveAIProvider["name"];
  usage: InternalAIUsageMetadata;
}> {
  const configured = getInternalArchiveAIProvider();
  if (configured.name === "mock") {
    return {
      result: await task(configured),
      provider: configured.name,
      usage: internalAIUsage(configured.name, "completed"),
    };
  }

  try {
    return {
      result: await task(configured),
      provider: configured.name,
      usage: internalAIUsage(configured.name, "completed"),
    };
  } catch {
    const fallback = new MockArchiveAIProvider();
    return {
      result: await task(fallback),
      provider: fallback.name,
      usage: internalAIUsage(fallback.name, "fallback"),
    };
  }
}

export function internalAIUsage(
  provider: InternalArchiveAIProvider["name"],
  status: InternalAIUsageMetadata["status"],
): InternalAIUsageMetadata {
  return {
    scope: "internal-archive",
    mode: provider === "local_openai_compatible"
      ? "self-hosted-local"
      : "deterministic-grounded-fallback",
    status,
    externalProviderCalled: false,
    externalBillableUsage: "none",
  };
}
