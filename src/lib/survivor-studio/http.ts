import { NextResponse } from "next/server";
import { hasTrustedOrigin } from "@/lib/http/origin";
import {
  checkSurvivorStudioRateLimit,
  survivorStudioClientKey,
} from "@/lib/survivor-studio/rate-limit";

export const SURVIVOR_STUDIO_NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Vary: "Origin",
};

const SURVIVOR_STUDIO_MAX_BODY_BYTES = 12_000;

async function readLimitedBody(
  request: Request,
): Promise<{ ok: true; text: string } | { ok: false }> {
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > SURVIVOR_STUDIO_MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch {
    return { ok: true, text: "" };
  } finally {
    reader.releaseLock();
  }
}

export async function prepareSurvivorStudioPost(
  request: Request,
  endpoint: "cite" | "persona",
): Promise<
  | { ok: true; body: unknown; remaining: number }
  | { ok: false; response: NextResponse }
> {
  if (!hasTrustedOrigin(request)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Cross-site Survivor Studio requests are not accepted." },
        { status: 403, headers: SURVIVOR_STUDIO_NO_STORE_HEADERS },
      ),
    };
  }

  const rateLimit = checkSurvivorStudioRateLimit(
    survivorStudioClientKey(request, endpoint),
  );
  if (!rateLimit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "The Survivor Studio assistant is busy. Please try again shortly." },
        {
          status: 429,
          headers: {
            ...SURVIVOR_STUDIO_NO_STORE_HEADERS,
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "X-RateLimit-Remaining": "0",
          },
        },
      ),
    };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > SURVIVOR_STUDIO_MAX_BODY_BYTES
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "The Survivor Studio request is too large." },
        { status: 413, headers: SURVIVOR_STUDIO_NO_STORE_HEADERS },
      ),
    };
  }

  const body = await readLimitedBody(request);
  if (!body.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "The Survivor Studio request is too large." },
        { status: 413, headers: SURVIVOR_STUDIO_NO_STORE_HEADERS },
      ),
    };
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body.text);
  } catch {
    parsedBody = null;
  }
  return { ok: true, body: parsedBody, remaining: rateLimit.remaining };
}
