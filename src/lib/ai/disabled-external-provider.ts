import type {
  ExternalResearchProvider,
  ResearchRequest,
  ResearchSuggestion,
} from "@/lib/ai/types";

/** No network behavior; used when explicit external research is disabled. */
export class DisabledExternalResearchProvider implements ExternalResearchProvider {
  readonly name = "mock" as const;

  async research(request: ResearchRequest): Promise<ResearchSuggestion> {
    return {
      summary:
        request.locale === "es"
          ? `La investigación externa está desactivada. Solicitud registrada para revisión: ${request.query}`
          : `External research is disabled. Request recorded for review: ${request.query}`,
      sources: [],
      provider: "mock",
      status: "suggested",
      requiresCuratorApproval: true,
      safetyNotice:
        request.locale === "es"
          ? "No se realizó ninguna búsqueda externa ni se envió contenido privado."
          : "No external search ran and no private content was sent.",
      providerUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }
}
