import type {
  ExternalResearchProvider,
  ExtractionRequest,
  ExtractionSuggestion,
  InternalArchiveAIProvider,
  MatchRequest,
  MatchSuggestion,
  PublishedChatRequest,
  ResearchRequest,
  ResearchSuggestion,
  TranslationRequest,
  TranslationSuggestion,
} from "@/lib/ai/types";

export class MockArchiveAIProvider implements InternalArchiveAIProvider, ExternalResearchProvider {
  readonly name = "mock" as const;

  async suggestExtraction(request: ExtractionRequest): Promise<ExtractionSuggestion[]> {
    return [
      {
        field: "review_note",
        value:
          request.locale === "es"
            ? "Sugerencia simulada. Revise el archivo original antes de aprobar."
            : "Mock suggestion. Review the original file before approval.",
        sourceLocator: `archive-item:${request.archiveItemId}`,
        status: "suggested",
        requiresCuratorApproval: true,
      },
    ];
  }

  async suggestMatches(request: MatchRequest): Promise<MatchSuggestion[]> {
    return request.candidateRecordIds.slice(0, 1).map((candidateRecordId) => ({
      candidateRecordId,
      rationale: "Mock-only candidate. No identity match has been verified.",
      status: "suggested" as const,
      requiresCuratorApproval: true as const,
    }));
  }

  async suggestTranslation(request: TranslationRequest): Promise<TranslationSuggestion> {
    return {
      translatedText: `[Mock ${request.sourceLocale}→${request.targetLocale}] ${request.sourceText}`,
      status: "suggested",
      requiresCuratorApproval: true,
      safetyNotice: "Mock translation. Preserve names and compare with the original before approval.",
    };
  }

  async answerPublishedChat(request: PublishedChatRequest): Promise<string> {
    return request.publishedContext;
  }

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
    };
  }
}
