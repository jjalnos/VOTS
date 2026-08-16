export type DemoArchiveAssistantRole = "user" | "assistant";

export interface DemoArchiveAssistantHistoryMessage {
  role: DemoArchiveAssistantRole;
  content: string;
}

export interface DemoArchiveAssistantCitation {
  index: number;
  recordId: string;
  title: string;
  survivorName: string;
  locator: "extracted text" | "curator notes" | "record metadata";
  excerpt: string;
}

export interface DemoArchiveAssistantAnswer {
  answer: string;
  citations: DemoArchiveAssistantCitation[];
  confidence: "grounded" | "unknown" | "conversation";
  provider: "deterministic-archive" | "self-hosted-local";
  archiveScope: {
    recordsSearched: number;
    recordsMatched: number;
    onlyPrivateWorkspace: true;
  };
  aiUsage: {
    scope: "internal-archive";
    mode: "deterministic-grounded-fallback" | "self-hosted-local";
    status: "completed" | "fallback" | "not-needed";
    externalProviderCalled: false;
    externalBillableUsage: "none";
  };
}

export class DemoArchiveAssistantError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DemoArchiveAssistantError";
    this.status = status;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function citationLocator(value: unknown): DemoArchiveAssistantCitation["locator"] {
  return value === "extracted text" || value === "curator notes" || value === "record metadata"
    ? value
    : "record metadata";
}

function responseError(value: unknown): string {
  return isObject(value) && typeof value.error === "string"
    ? value.error
    : "The Archive Assistant could not answer that question.";
}

function answerFromUnknown(value: unknown): DemoArchiveAssistantAnswer {
  if (!isObject(value) || typeof value.answer !== "string" || !Array.isArray(value.citations)) {
    throw new Error("The Archive Assistant response was not recognized.");
  }
  const citations = value.citations
    .filter(isObject)
    .map((citation) => ({
      index: typeof citation.index === "number" ? citation.index : 0,
      recordId: asString(citation.recordId),
      title: asString(citation.title),
      survivorName: asString(citation.survivorName),
      locator: citationLocator(citation.locator),
      excerpt: asString(citation.excerpt),
    }))
    .filter((citation) => citation.index > 0 && citation.recordId && citation.title);
  const archiveScope = isObject(value.archiveScope) ? value.archiveScope : {};
  const aiUsage = isObject(value.aiUsage) ? value.aiUsage : {};
  return {
    answer: value.answer,
    citations,
    confidence:
      value.confidence === "grounded" || value.confidence === "conversation"
        ? value.confidence
        : "unknown",
    provider: value.provider === "self-hosted-local" ? "self-hosted-local" : "deterministic-archive",
    archiveScope: {
      recordsSearched:
        typeof archiveScope.recordsSearched === "number" ? archiveScope.recordsSearched : 0,
      recordsMatched:
        typeof archiveScope.recordsMatched === "number" ? archiveScope.recordsMatched : 0,
      onlyPrivateWorkspace: true,
    },
    aiUsage: {
      scope: "internal-archive",
      mode: aiUsage.mode === "self-hosted-local"
        ? "self-hosted-local"
        : "deterministic-grounded-fallback",
      status:
        aiUsage.status === "fallback" || aiUsage.status === "not-needed"
          ? aiUsage.status
          : "completed",
      externalProviderCalled: false,
      externalBillableUsage: "none",
    },
  };
}

export async function askDemoArchiveAssistant(
  question: string,
  history: DemoArchiveAssistantHistoryMessage[],
  signal?: AbortSignal,
): Promise<DemoArchiveAssistantAnswer> {
  const response = await fetch("/api/demo/archive/assistant", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history: history.slice(-8) }),
    cache: "no-store",
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new DemoArchiveAssistantError(responseError(payload), response.status);
  return answerFromUnknown(payload);
}
