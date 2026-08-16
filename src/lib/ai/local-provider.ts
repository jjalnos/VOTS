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
import { assertSafeInternalAIEndpoint } from "@/lib/ai/internal-endpoint";

interface ChatCompletionPayload {
  choices?: Array<{ message?: { content?: string } }>;
}

export class LocalOpenAICompatibleProvider implements InternalArchiveAIProvider {
  readonly name = "local_openai_compatible" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly authToken?: string,
  ) {}

  private async complete(system: string, user: string): Promise<string> {
    // Validate again at the network boundary so direct construction cannot
    // bypass the internal/external provider factory separation.
    assertSafeInternalAIEndpoint(this.baseUrl);
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.1,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      cache: "no-store",
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error("Internal AI endpoint redirects are not accepted.");
    }
    if (!response.ok) throw new Error(`Internal AI endpoint returned ${response.status}.`);
    const payload = (await response.json()) as ChatCompletionPayload;
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Internal AI endpoint returned no text.");
    return content;
  }

  async suggestExtraction(request: ExtractionRequest): Promise<ExtractionSuggestion[]> {
    const value = await this.complete(
      "You assist a museum curator. Extract only explicit text; never infer an identity or present uncertainty as fact. Return a concise suggestion requiring curator approval.",
      `Archive item: ${request.archiveItemId}\nLocale: ${request.locale}\nCurator note: ${request.curatorPrompt ?? "none"}\nContent:\n${request.content ?? "No text supplied."}`,
    );
    return [{
      field: "curator_review_note",
      value,
      sourceLocator: `archive-item:${request.archiveItemId}`,
      status: "suggested",
      requiresCuratorApproval: true,
    }];
  }

  async suggestMatches(request: MatchRequest): Promise<MatchSuggestion[]> {
    if (!request.candidateRecordIds.length) return [];
    const rationale = await this.complete(
      "You assist a museum curator with record matching. Do not infer identity. Explain ambiguity and label every result as an unverified suggestion.",
      `Archive item: ${request.archiveItemId}\nCandidate IDs: ${request.candidateRecordIds.join(", ")}\nRecord text:\n${request.recordText}`,
    );
    return [{
      candidateRecordId: request.candidateRecordIds[0],
      rationale,
      status: "suggested",
      requiresCuratorApproval: true,
    }];
  }

  async suggestTranslation(request: TranslationRequest): Promise<TranslationSuggestion> {
    const translatedText = await this.complete(
      "Translate archival text conservatively. Preserve names, dates, ambiguity, and source markers. Do not add facts. Output translation text only.",
      `Translate from ${request.sourceLocale} to ${request.targetLocale}:\n${request.sourceText}`,
    );
    return {
      translatedText,
      status: "suggested",
      requiresCuratorApproval: true,
      safetyNotice: "Internal model suggestion. A curator must compare it with the original before publication.",
    };
  }

  async answerPublishedChat(request: PublishedChatRequest): Promise<string> {
    return this.complete(
      "Answer only from the supplied published museum context. Never use outside knowledge, infer identity, or add a claim. If context is insufficient, say so. Preserve citation markers.",
      `Locale: ${request.locale}\nQuestion: ${request.question}\nPublished context:\n${request.publishedContext}`,
    );
  }
}
