import type { Locale } from "@/lib/domain/types";

export interface ExtractionRequest {
  archiveItemId: string;
  locale: Locale;
  content?: string;
  curatorPrompt?: string;
}

export interface ExtractionSuggestion {
  field: string;
  value: string;
  sourceLocator: string;
  status: "suggested";
  requiresCuratorApproval: true;
}

export interface ResearchRequest {
  query: string;
  locale: Locale;
  allowedDomains: string[];
  initiatedByUserId: string;
}

export interface MatchRequest {
  archiveItemId: string;
  recordText: string;
  candidateRecordIds: string[];
}

export interface MatchSuggestion {
  candidateRecordId: string;
  rationale: string;
  confidence?: number;
  status: "suggested";
  requiresCuratorApproval: true;
}

export interface TranslationRequest {
  sourceText: string;
  sourceLocale: Locale;
  targetLocale: Locale;
}

export interface TranslationSuggestion {
  translatedText: string;
  status: "suggested";
  requiresCuratorApproval: true;
  safetyNotice: string;
}

export interface PublishedChatRequest {
  question: string;
  locale: Locale;
  publishedContext: string;
}

export interface ResearchSourceSuggestion {
  title: string;
  url: string;
}

export interface ResearchSuggestion {
  summary: string;
  sources: ResearchSourceSuggestion[];
  provider: "mock" | "openai";
  status: "suggested";
  requiresCuratorApproval: true;
  safetyNotice: string;
}

export interface InternalArchiveAIProvider {
  readonly name: "mock" | "local_openai_compatible";
  suggestExtraction(request: ExtractionRequest): Promise<ExtractionSuggestion[]>;
  suggestMatches(request: MatchRequest): Promise<MatchSuggestion[]>;
  suggestTranslation(request: TranslationRequest): Promise<TranslationSuggestion>;
  answerPublishedChat(request: PublishedChatRequest): Promise<string>;
}

export interface ExternalResearchProvider {
  readonly name: "mock" | "openai";
  research(request: ResearchRequest): Promise<ResearchSuggestion>;
}
