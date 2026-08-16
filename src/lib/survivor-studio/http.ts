import { NextResponse } from "next/server";
import { hasTrustedOrigin } from "@/lib/http/origin";
import { readBoundedJson } from "@/lib/http/request";
import {
  checkSurvivorStudioRateLimit,
  survivorStudioClientKey,
} from "@/lib/survivor-studio/rate-limit";

export const SURVIVOR_STUDIO_NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Vary: "Origin",
};

const SURVIVOR_STUDIO_MAX_BODY_BYTES = 12_000;

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

  const body = await readBoundedJson(request, SURVIVOR_STUDIO_MAX_BODY_BYTES);
  if (!body.ok && body.reason === "too-large") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "The Survivor Studio request is too large." },
        { status: 413, headers: SURVIVOR_STUDIO_NO_STORE_HEADERS },
      ),
    };
  }
  return {
    ok: true,
    body: body.ok ? body.value : null,
    remaining: rateLimit.remaining,
  };
}
