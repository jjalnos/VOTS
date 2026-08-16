import { NextResponse } from "next/server";
import { z } from "zod";
import { getInternalArchiveAIProvider } from "@/lib/ai/internal-provider";
import { can } from "@/lib/auth/policy";
import { getActorFromRequest } from "@/lib/auth/server-session";
import {
  answerPrivateArchiveQuestion,
  ARCHIVE_ASSISTANT_MAX_HISTORY,
  ARCHIVE_ASSISTANT_MAX_HISTORY_MESSAGE_LENGTH,
  ARCHIVE_ASSISTANT_MAX_QUESTION_LENGTH,
} from "@/lib/demo-archive/assistant";
import {
  DemoArchiveStoreUnavailableError,
  getDemoArchiveStore,
} from "@/lib/demo-archive/store";
import { hasTrustedOrigin } from "@/lib/http/origin";
import {
  readBoundedJson,
  trustedProxyClientAddress,
} from "@/lib/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 20 * 1024;
const RATE_WINDOW_SECONDS = 10 * 60;
const RATE_MAXIMUM = 24;
const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  Vary: "Cookie, Origin",
};

const requestSchema = z.object({
  question: z.string().trim().min(1).max(ARCHIVE_ASSISTANT_MAX_QUESTION_LENGTH),
  history: z
    .array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().trim().min(1).max(ARCHIVE_ASSISTANT_MAX_HISTORY_MESSAGE_LENGTH),
    }))
    .max(ARCHIVE_ASSISTANT_MAX_HISTORY)
    .default([]),
}).strict();

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-site Archive Assistant requests are not accepted." },
      { status: 403, headers: RESPONSE_HEADERS },
    );
  }

  const actor = await getActorFromRequest(request);
  if (!actor || !can(actor, "view_archive_workspace")) {
    return NextResponse.json(
      { error: actor ? "Curator access is required." : "Archive sign-in is required." },
      { status: actor ? 403 : 401, headers: RESPONSE_HEADERS },
    );
  }

  try {
    const store = await getDemoArchiveStore();
    const address = trustedProxyClientAddress(request);
    const rateKeys = [
      `archive-assistant:actor:${actor.userId}`,
      ...(address === "unknown" ? [] : [`archive-assistant:ip:${address}`]),
    ];
    const rateLimit = await store.consumeUploadLimit(
      rateKeys,
      new Date(),
      RATE_WINDOW_SECONDS,
      RATE_MAXIMUM,
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "The Archive Assistant is pausing briefly after too many questions." },
        {
          status: 429,
          headers: { ...RESPONSE_HEADERS, "Retry-After": String(rateLimit.retryAfter) },
        },
      );
    }

    const json = await readBoundedJson(request, MAX_BODY_BYTES, {
      requireJsonContentType: true,
    });
    if (!json.ok) {
      const status = json.reason === "too-large"
        ? 413
        : json.reason === "unsupported-media-type"
          ? 415
          : 400;
      const error = json.reason === "too-large"
        ? "The Archive Assistant request is too large."
        : json.reason === "unsupported-media-type"
          ? "Use a JSON request for the Archive Assistant."
          : "The Archive Assistant request is not valid JSON.";
      return NextResponse.json(
        { error },
        { status, headers: RESPONSE_HEADERS },
      );
    }
    const parsed = requestSchema.safeParse(json.value);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ask one concise question and include no more than eight recent messages." },
        { status: 400, headers: RESPONSE_HEADERS },
      );
    }

    const corpus = await store.corpus(actor.userId, 250);
    const configuredProvider = getInternalArchiveAIProvider();
    const result = await answerPrivateArchiveQuestion({
      ...parsed.data,
      corpus,
      localProvider:
        configuredProvider.name === "local_openai_compatible"
          ? configuredProvider
          : undefined,
    });
    return NextResponse.json(result, { headers: RESPONSE_HEADERS });
  } catch (error) {
    const unavailable = error instanceof DemoArchiveStoreUnavailableError;
    return NextResponse.json(
      {
        error: unavailable
          ? "The private archive database is not configured."
          : "The Archive Assistant could not open the private corpus.",
      },
      { status: 503, headers: RESPONSE_HEADERS },
    );
  }
}
