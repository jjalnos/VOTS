import { z } from "zod";
import { authorizeSusanneOwner, susanneAiEnabled } from "@/lib/ai/susanne-access";
import { checkSusanneRateLimit } from "@/lib/ai/susanne-rate-limit";
import {
  configuredSusanneVectorStoreId,
  parseVectorStoreSearchResponse,
  searchSusanneVectorStore,
  testimonySearchPayload,
} from "@/lib/ai/susanne-testimony";
import { hasTrustedOrigin } from "@/lib/http/origin";
import { readBoundedJson } from "@/lib/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  query: z.string().trim().min(2).max(600),
}).strict();
const MAX_BODY_BYTES = 4 * 1024;
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

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return errorResponse("Cross-site testimony searches are not accepted.", 403);
  }

  const authorization = await authorizeSusanneOwner(request);
  if (!authorization.ok) {
    return errorResponse(authorization.error, authorization.status);
  }
  if (!susanneAiEnabled()) {
    return errorResponse("The private AI conversation is currently disabled.", 503);
  }

  const rateLimit = checkSusanneRateLimit("search", request, authorization.actor.userId);
  if (!rateLimit.allowed) {
    return errorResponse("Too many testimony searches. Please try again shortly.", 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
      "X-RateLimit-Remaining": "0",
    });
  }

  const json = await readBoundedJson(request, MAX_BODY_BYTES, {
    requireJsonContentType: true,
  });
  if (!json.ok) {
    if (json.reason === "too-large") {
      return errorResponse("The testimony search request is too large.", 413);
    }
    if (json.reason === "unsupported-media-type") {
      return errorResponse("Use application/json for testimony searches.", 415);
    }
    return errorResponse("A valid testimony search query is required.", 400);
  }
  const parsed = requestSchema.safeParse(json.value);
  if (!parsed.success) {
    return errorResponse("A testimony search query between 2 and 600 characters is required.", 400);
  }

  const configuredVectorStoreValue = process.env.SUSANNE_VECTOR_STORE_ID?.trim();
  const vectorStoreId = configuredSusanneVectorStoreId();
  if (configuredVectorStoreValue && !vectorStoreId) {
    return errorResponse("The private testimony search is not configured correctly.", 503);
  }
  if (!vectorStoreId) {
    return Response.json(testimonySearchPayload(parsed.data.query), {
      headers: {
        ...PRIVATE_HEADERS,
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return errorResponse("The private testimony search is not configured.", 503);
  }
  const result = await searchSusanneVectorStore({
    query: parsed.data.query,
    vectorStoreId,
    apiKey,
  });
  if (!result.ok) {
    if (result.status === 429) {
      return errorResponse("The testimony search service is busy. Please try again shortly.", 429);
    }
    return errorResponse("The private testimony search is temporarily unavailable.", 502);
  }

  const passages = parseVectorStoreSearchResponse(result.value);
  return Response.json(testimonySearchPayload(parsed.data.query, passages), {
    headers: {
      ...PRIVATE_HEADERS,
      "X-RateLimit-Remaining": String(rateLimit.remaining),
    },
  });
}
