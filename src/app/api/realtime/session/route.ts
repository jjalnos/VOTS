import { authorizeSusanneOwner, susanneAiEnabled } from "@/lib/ai/susanne-access";
import {
  reserveSusanneRealtimeBudget,
  settleSusanneRealtimeSetupFailure,
} from "@/lib/ai/susanne-budget";
import { checkSusanneRateLimit } from "@/lib/ai/susanne-rate-limit";
import {
  privacyPreservingSafetyIdentifier,
  readBoundedSdp,
  susanneRealtimeSessionConfiguration,
} from "@/lib/ai/susanne-realtime";
import { configuredSusanneVectorStoreId } from "@/lib/ai/susanne-testimony";
import { hasTrustedOrigin } from "@/lib/http/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Security-Policy": "default-src 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie, Origin",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(
  error: string,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(
    { error },
    { status, headers: { ...PRIVATE_HEADERS, ...extraHeaders } },
  );
}

function safeRetryAfter(value: string | undefined): string | undefined {
  if (!value || !/^\d{1,5}$/.test(value)) return undefined;
  return String(Math.max(1, Math.min(Number(value), 3_600)));
}

interface SafeUpstreamError {
  code?: string;
  param?: string;
  type?: string;
}

function safeUpstreamDiagnosticValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^[A-Za-z0-9_.:[\]-]{1,96}$/.test(value) ? value : undefined;
}

async function safeUpstreamError(response: Response): Promise<SafeUpstreamError> {
  try {
    const payload = await response.json() as {
      error?: { code?: unknown; param?: unknown; type?: unknown };
    };
    return {
      code: safeUpstreamDiagnosticValue(payload.error?.code),
      param: safeUpstreamDiagnosticValue(payload.error?.param),
      type: safeUpstreamDiagnosticValue(payload.error?.type),
    };
  } catch {
    return {};
  }
}

function rejectedRealtimeMessage(
  status: number,
  diagnostic: SafeUpstreamError,
): string {
  if (status === 401) {
    return "The OpenAI production key was rejected by the realtime service.";
  }
  if (status === 403 || status === 404) {
    return "The OpenAI project does not currently permit this realtime model.";
  }
  if (status === 400) {
    const code = diagnostic.code ?? diagnostic.type;
    const suffix = [code, diagnostic.param ? `at ${diagnostic.param}` : undefined]
      .filter(Boolean)
      .join(" ");
    return suffix
      ? `The realtime configuration was rejected (${suffix}).`
      : "The realtime configuration was rejected by OpenAI.";
  }
  return status >= 500
    ? "The realtime voice service is temporarily unavailable."
    : "The realtime voice service is not available for this private experience.";
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return errorResponse("Cross-site realtime session requests are not accepted.", 403);
  }

  const authorization = await authorizeSusanneOwner(request);
  if (!authorization.ok) {
    return errorResponse(authorization.error, authorization.status);
  }
  if (!susanneAiEnabled()) {
    return errorResponse("The private AI conversation is currently disabled.", 503);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return errorResponse("The private AI conversation is not configured.", 503);
  }
  if (!configuredSusanneVectorStoreId()) {
    return errorResponse("The private testimony source is not configured.", 503);
  }

  const rateLimit = checkSusanneRateLimit(
    "realtime",
    request,
    authorization.actor.userId,
  );
  if (!rateLimit.allowed) {
    return errorResponse("Too many conversation starts. Please try again shortly.", 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
      "X-RateLimit-Remaining": "0",
    });
  }

  const body = await readBoundedSdp(request);
  if (!body.ok) {
    if (body.reason === "unsupported-media-type") {
      return errorResponse("Use application/sdp for the WebRTC offer.", 415);
    }
    if (body.reason === "too-large") {
      return errorResponse("The WebRTC offer is too large.", 413);
    }
    return errorResponse("A valid WebRTC SDP audio offer is required.", 400);
  }

  const form = new FormData();
  form.set("sdp", body.sdp);
  form.set("session", JSON.stringify(susanneRealtimeSessionConfiguration()));
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  const safetyIdentifier = privacyPreservingSafetyIdentifier(authorization.actor.userId);
  if (safetyIdentifier) headers["OpenAI-Safety-Identifier"] = safetyIdentifier;

  const budget = await reserveSusanneRealtimeBudget(authorization.actor.userId);
  if (!budget.ok) {
    return budget.reason === "limit-reached"
      ? errorResponse(
          "The private conversation limit has been reached. Please try again later.",
          429,
        )
      : errorResponse("The private conversation usage controls are unavailable.", 503);
  }

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers,
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    await settleSusanneRealtimeSetupFailure(budget.value);
    return errorResponse("The realtime voice service could not be reached.", 502);
  }

  if (!upstream.ok) {
    await settleSusanneRealtimeSetupFailure(budget.value);
    const retryAfter = safeRetryAfter(upstream.headers.get("retry-after") ?? undefined);
    if (upstream.status === 429) {
      return errorResponse(
        "The realtime voice service is busy. Please try again shortly.",
        429,
        retryAfter ? { "Retry-After": retryAfter } : {},
      );
    }
    const diagnostic = await safeUpstreamError(upstream);
    return errorResponse(
      rejectedRealtimeMessage(upstream.status, diagnostic),
      upstream.status >= 500 ? 502 : 503,
    );
  }

  let answer: string;
  try {
    answer = await upstream.text();
  } catch {
    await settleSusanneRealtimeSetupFailure(budget.value);
    return errorResponse("The realtime voice service returned an invalid answer.", 502);
  }
  if (
    answer.length < 20 ||
    answer.length > 256 * 1024 ||
    answer.includes("\u0000") ||
    !/(?:^|\r?\n)v=0(?:\r?\n|$)/.test(answer)
  ) {
    await settleSusanneRealtimeSetupFailure(budget.value);
    return errorResponse("The realtime voice service returned an invalid answer.", 502);
  }

  // A browser-held Realtime session has no trustworthy final usage callback in
  // this request. Leave the durable reservation pending so the ledger promotes
  // it to the full configured charge after its existing 15-minute lifetime.

  return new Response(answer, {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/sdp",
      "X-RateLimit-Remaining": String(rateLimit.remaining),
    },
  });
}
