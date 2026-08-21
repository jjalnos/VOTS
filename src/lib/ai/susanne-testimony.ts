import { createHash } from "node:crypto";
import { SUSANNE_UNSUPPORTED_REFUSAL } from "@/lib/ai/susanne-realtime";

export const SUSANNE_TESTIMONY_SOURCE = {
  title: "Susanne “Zsuzsi” Weisz Jalnos testimony · JFSA/HMMSA",
  url: "https://www.youtube.com/watch?v=I-Xq1fGq_gI",
  kind: "original-testimony",
} as const;

export const SUSANNE_TESTIMONY_EXPECTED_ATTRIBUTES = {
  video_id: "I-Xq1fGq_gI",
  source_media: "youtube",
  transcript_status: "ai_transcribed_unreviewed",
  quote_approved: false,
} as const;

// Retrieval alone is not evidence. Discard weak semantic matches before they
// can be shown to the model or treated as grounding for a spoken answer.
export const SUSANNE_MINIMUM_GROUNDED_SCORE = 0.55;

export interface SusanneTestimonyPassage {
  id: string;
  text: string;
  score: number | null;
  confidence: "high" | "medium" | "low" | null;
  sourceTitle: string;
  sourceUrl: string;
  timestampSeconds: number | null;
  timestampLabel: string | null;
  citationLabel: string;
  untrusted: true;
}

export interface SusanneTestimonySearchPayload {
  query: string;
  grounded: boolean;
  quote_approved: false;
  passages: SusanneTestimonyPassage[];
  sources: Array<typeof SUSANNE_TESTIMONY_SOURCE>;
  refusal: typeof SUSANNE_UNSUPPORTED_REFUSAL;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function finiteScore(value: unknown): number | null {
  const score = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(score) || score < 0 || score > 1) return null;
  return Math.round(score * 10_000) / 10_000;
}

function cleanPassage(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, "")
    .trim()
    .slice(0, 3_000);
}

function timestampFromClock(value: string): number | undefined {
  const match = /(?:^|\[|\s)(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\]|\s|$)/.exec(value);
  if (!match) return undefined;
  const hours = Number(match[1] ?? "0");
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    minutes > 59 ||
    seconds > 59
  ) {
    return undefined;
  }
  const total = hours * 3_600 + minutes * 60 + seconds;
  return total <= 86_400 ? total : undefined;
}

function timestampFromValue(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value <= 86_400
      ? Math.floor(value)
      : undefined;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return numeric >= 0 && numeric <= 86_400 ? Math.floor(numeric) : undefined;
  }
  return timestampFromClock(trimmed);
}

function resultTimestamp(
  attributes: Record<string, unknown> | undefined,
  text: string,
): number | undefined {
  for (const key of [
    "timestamp_seconds",
    "start_seconds",
    "start_time_seconds",
    "timestamp",
    "start_time",
  ]) {
    const parsed = timestampFromValue(attributes?.[key]);
    if (parsed !== undefined) return parsed;
  }
  return timestampFromClock(text.slice(0, 120));
}

function hasExpectedTestimonyAttributes(
  attributes: Record<string, unknown> | undefined,
): boolean {
  return (
    attributes?.video_id === SUSANNE_TESTIMONY_EXPECTED_ATTRIBUTES.video_id &&
    attributes.source_media === SUSANNE_TESTIMONY_EXPECTED_ATTRIBUTES.source_media &&
    attributes.transcript_status ===
      SUSANNE_TESTIMONY_EXPECTED_ATTRIBUTES.transcript_status &&
    attributes.quote_approved === SUSANNE_TESTIMONY_EXPECTED_ATTRIBUTES.quote_approved
  );
}

export function formatTestimonyTimestamp(seconds: number): string {
  const bounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(bounded / 3_600);
  const minutes = Math.floor((bounded % 3_600) / 60);
  const remaining = bounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export function testimonyUrlAt(seconds: number | null): string {
  if (seconds === null) return SUSANNE_TESTIMONY_SOURCE.url;
  const url = new URL(SUSANNE_TESTIMONY_SOURCE.url);
  url.searchParams.set("t", `${Math.max(0, Math.floor(seconds))}s`);
  return url.toString();
}

function confidenceFor(score: number | null): SusanneTestimonyPassage["confidence"] {
  if (score === null) return null;
  if (score >= 0.8) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

export function parseVectorStoreSearchResponse(
  value: unknown,
  maximumResults = 6,
): SusanneTestimonyPassage[] {
  const data = record(value)?.data;
  if (!Array.isArray(data)) return [];
  const passages: SusanneTestimonyPassage[] = [];

  const resultLimit = Math.max(0, Math.min(6, Math.floor(maximumResults)));
  for (const [resultIndex, rawResult] of data.slice(0, resultLimit).entries()) {
    const result = record(rawResult);
    if (!result || !Array.isArray(result.content)) continue;
    const text = cleanPassage(
      result.content
        .map((entry) => record(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .filter((entry) => entry.type === "text" && typeof entry.text === "string")
        .map((entry) => entry.text as string)
        .join("\n"),
    );
    if (!text) continue;

    const attributes = record(result.attributes);
    const score = finiteScore(result.score);
    if (
      !hasExpectedTestimonyAttributes(attributes) ||
      score === null ||
      score < SUSANNE_MINIMUM_GROUNDED_SCORE
    ) {
      continue;
    }
    const timestampSeconds = resultTimestamp(attributes, text) ?? null;
    const timestampLabel =
      timestampSeconds === null ? null : formatTestimonyTimestamp(timestampSeconds);
    const id = createHash("sha256")
      .update(String(result.filename ?? "testimony"))
      .update("\u0000")
      .update(String(resultIndex))
      .update("\u0000")
      .update(text)
      .digest("hex")
      .slice(0, 20);

    passages.push({
      id,
      text,
      score,
      confidence: confidenceFor(score),
      sourceTitle: SUSANNE_TESTIMONY_SOURCE.title,
      sourceUrl: testimonyUrlAt(timestampSeconds),
      timestampSeconds,
      timestampLabel,
      citationLabel: timestampLabel
        ? `Susanne testimony · ${timestampLabel}`
        : "Susanne testimony",
      untrusted: true,
    });
  }

  return passages;
}

export function testimonySearchPayload(
  query: string,
  passages: SusanneTestimonyPassage[] = [],
): SusanneTestimonySearchPayload {
  return {
    query,
    grounded: passages.length > 0,
    quote_approved: false,
    passages,
    sources: [SUSANNE_TESTIMONY_SOURCE],
    refusal: SUSANNE_UNSUPPORTED_REFUSAL,
  };
}

export function configuredSusanneVectorStoreId(): string | undefined {
  const id = process.env.SUSANNE_VECTOR_STORE_ID?.trim();
  return id && /^vs_[a-zA-Z0-9_-]{1,196}$/.test(id) ? id : undefined;
}

export async function searchSusanneVectorStore(input: {
  query: string;
  vectorStoreId: string;
  apiKey: string;
  fetcher?: typeof fetch;
}): Promise<{ ok: true; value: unknown } | { ok: false; status: number; retryAfter?: string }> {
  const fetcher = input.fetcher ?? fetch;
  try {
    const response = await fetcher(
      `https://api.openai.com/v1/vector_stores/${encodeURIComponent(input.vectorStoreId)}/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: input.query, max_num_results: 6 }),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        retryAfter: response.headers.get("retry-after") ?? undefined,
      };
    }
    return { ok: true, value: (await response.json()) as unknown };
  } catch {
    return { ok: false, status: 502 };
  }
}
