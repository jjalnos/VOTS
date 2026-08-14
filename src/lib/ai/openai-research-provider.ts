import type {
  ExternalResearchProvider,
  ResearchRequest,
  ResearchSourceSuggestion,
  ResearchSuggestion,
} from "@/lib/ai/types";

interface ResponseOutputItem {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
  action?: { sources?: Array<{ title?: string; url?: string }> };
}

interface OpenAIResponsePayload {
  output?: ResponseOutputItem[];
  output_text?: string;
}

function extractSources(payload: OpenAIResponsePayload): ResearchSourceSuggestion[] {
  const seen = new Set<string>();
  const sources: ResearchSourceSuggestion[] = [];
  for (const item of payload.output ?? []) {
    for (const source of item.action?.sources ?? []) {
      if (!source.url || seen.has(source.url)) continue;
      seen.add(source.url);
      sources.push({ title: source.title || source.url, url: source.url });
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
  ) {}

  async research(request: ResearchRequest): Promise<ResearchSuggestion> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
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
        input: [
          "You are preparing research suggestions for a museum curator.",
          "Return sourced leads, distinguish uncertainty, and do not infer survivor identities.",
          "Everything is a suggestion requiring human approval.",
          `Research request: ${request.query}`,
        ].join("\n"),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`External research provider returned ${response.status}.`);
    }
    const payload = (await response.json()) as OpenAIResponsePayload;
    return {
      summary: extractText(payload) || "No research summary was returned.",
      sources: extractSources(payload),
      provider: "openai",
      status: "suggested",
      requiresCuratorApproval: true,
      safetyNotice:
        "Curator-initiated external research only. Verify every source and claim before linking or publication.",
    };
  }
}
