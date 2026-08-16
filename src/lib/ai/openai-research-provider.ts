import {
  EXTERNAL_RESEARCH_COST_ACKNOWLEDGEMENT,
  type ExternalResearchProvider,
  type ResearchRequest,
  type ResearchSourceSuggestion,
  type ResearchSuggestion,
} from "@/lib/ai/types";

interface ResponseOutputItem {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
  action?: { sources?: Array<{ title?: string; url?: string }> };
}

interface OpenAIResponsePayload {
  output?: ResponseOutputItem[];
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

export function externalResearchInput(request: ResearchRequest): string {
  return [
    "You are preparing research suggestions for a museum curator.",
    "Return sourced leads, distinguish uncertainty, and do not infer survivor identities.",
    "Everything is a suggestion requiring human approval.",
    `Research request: ${request.query}`,
  ].join("\n");
}

/**
 * A deliberately conservative upper bound used before a metered request. UTF-8
 * bytes bound ordinary text tokens and the fixed allowance covers tool/schema
 * serialization performed by the provider.
 */
export function externalResearchInputTokenCeiling(request: ResearchRequest): number {
  const promptBytes = new TextEncoder().encode(externalResearchInput(request)).length;
  const domainBytes = new TextEncoder().encode(request.allowedDomains.join(",")).length;
  return promptBytes + domainBytes + 512;
}

const MAX_RESEARCH_SOURCES = 10;
const MAX_SOURCE_URL_LENGTH = 2_048;
const MAX_SOURCE_TITLE_LENGTH = 240;

function hostnameMatchesAllowedDomain(hostname: string, allowedDomains: string[]): boolean {
  const candidate = hostname.toLocaleLowerCase("en").replace(/\.$/, "");
  return allowedDomains.some((entry) => {
    const allowed = entry.trim().toLocaleLowerCase("en").replace(/\.$/, "");
    return allowed.length > 0 && (candidate === allowed || candidate.endsWith(`.${allowed}`));
  });
}

function approvedSourceUrl(value: string, allowedDomains: string[]): string | undefined {
  if (value.length > MAX_SOURCE_URL_LENGTH) return undefined;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !hostnameMatchesAllowedDomain(parsed.hostname, allowedDomains)
    ) {
      return undefined;
    }
    return parsed.href;
  } catch {
    return undefined;
  }
}

function extractSources(
  payload: OpenAIResponsePayload,
  allowedDomains: string[],
): ResearchSourceSuggestion[] {
  const seen = new Set<string>();
  const sources: ResearchSourceSuggestion[] = [];
  for (const item of payload.output ?? []) {
    for (const source of item.action?.sources ?? []) {
      if (!source.url || sources.length >= MAX_RESEARCH_SOURCES) continue;
      const url = approvedSourceUrl(source.url, allowedDomains);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const rawTitle = source.title?.trim() || url;
      sources.push({ title: rawTitle.slice(0, MAX_SOURCE_TITLE_LENGTH), url });
    }
  }
  return sources;
}

function extractText(payload: OpenAIResponsePayload): string {
  if (payload.output_text) return payload.output_text;
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .filter(Boolean)
    .join("\n");
}

export class OpenAIResearchProvider implements ExternalResearchProvider {
  readonly name = "openai" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly maxOutputTokens: number,
  ) {}

  async research(request: ResearchRequest): Promise<ResearchSuggestion> {
    if (request.curatorConfirmed !== true) {
      throw new Error("External research requires explicit curator confirmation.");
    }
    if (request.costAcknowledgement !== EXTERNAL_RESEARCH_COST_ACKNOWLEDGEMENT) {
      throw new Error("External research requires an explicit per-request cost acknowledgement.");
    }
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        store: false,
        max_output_tokens: this.maxOutputTokens,
        max_tool_calls: 1,
        tools: [
          {
            type: "web_search",
            filters: request.allowedDomains.length
              ? { allowed_domains: request.allowedDomains }
              : undefined,
          },
        ],
        tool_choice: "auto",
        include: ["web_search_call.action.sources"],
        input: externalResearchInput(request),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`External research provider returned ${response.status}.`);
    }
    const payload = (await response.json()) as OpenAIResponsePayload;
    const inputTokens = Math.max(0, Math.trunc(payload.usage?.input_tokens ?? 0));
    const outputTokens = Math.max(0, Math.trunc(payload.usage?.output_tokens ?? 0));
    const totalTokens = Math.max(
      inputTokens + outputTokens,
      Math.trunc(payload.usage?.total_tokens ?? 0),
    );
    return {
      summary: extractText(payload) || "No research summary was returned.",
      sources: extractSources(payload, request.allowedDomains),
      provider: "openai",
      status: "suggested",
      requiresCuratorApproval: true,
      safetyNotice:
        "Curator-initiated external research only. Verify every source and claim before linking or publication.",
      providerUsage: { inputTokens, outputTokens, totalTokens },
    };
  }
}
