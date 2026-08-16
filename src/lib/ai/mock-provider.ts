import type {
  ExtractionRequest,
  ExtractionSuggestion,
  InternalArchiveAIProvider,
  MatchRequest,
  MatchSuggestion,
  PublishedChatRequest,
  TranslationRequest,
  TranslationSuggestion,
} from "@/lib/ai/types";

export class MockArchiveAIProvider implements InternalArchiveAIProvider {
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
}
