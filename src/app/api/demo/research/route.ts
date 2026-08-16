import { NextResponse } from "next/server";
import { z } from "zod";
import { hasTrustedOrigin } from "@/lib/http/origin";
import { readBoundedJson } from "@/lib/http/request";
import {
  checkDemoResearchRateLimit,
  demoResearchClientKey,
} from "@/lib/research/demo-research-rate-limit";
import {
  APPROVED_RESEARCH_SURVIVORS,
  KNOWN_RESEARCH_SOURCE_IDS,
  KNOWN_RESEARCH_SOURCES,
  ResearchFetchError,
  runDemoWebResearch,
  type WebResearchDependencies,
} from "@/lib/research/web-research";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 4 * 1024;
const requestSchema = z
  .object({
    survivorName: z.enum(APPROVED_RESEARCH_SURVIVORS),
    sourceId: z.enum(KNOWN_RESEARCH_SOURCE_IDS).optional(),
    sourceUrl: z.string().trim().url().max(1_200).optional(),
    confirmed: z.literal(true),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.sourceId ? 1 : 0) + (value.sourceUrl ? 1 : 0) !== 1) {
      context.addIssue({
        code: "custom",
        message: "Choose one known source or provide one source URL.",
      });
    }
  });

export async function GET() {
  return NextResponse.json(
    {
      survivors: APPROVED_RESEARCH_SURVIVORS,
      sources: KNOWN_RESEARCH_SOURCES,
      allowedDomains: ["hmmsa.org", "www.hmmsa.org", "youtube.com", "www.youtube.com"],
      mode: "deterministic-no-credits",
    },
    { headers: noStoreHeaders },
  );
}

export async function handleDemoResearchPost(
  request: Request,
  dependencies: WebResearchDependencies = {},
) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-site research requests are not accepted." },
      { status: 403, headers: noStoreHeaders },
    );
  }

  const rateLimit = checkDemoResearchRateLimit(demoResearchClientKey(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "The research desk is busy. Please try again shortly." },
      {
        status: 429,
        headers: {
          ...noStoreHeaders,
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const json = await readBoundedJson(request, MAX_BODY_BYTES);
  if (!json.ok && json.reason === "too-large") {
    return NextResponse.json(
      { error: "The research request is too large." },
      { status: 413, headers: noStoreHeaders },
    );
  }

  const parsed = requestSchema.safeParse(json.ok ? json.value : null);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Choose Sam Cohen or Stephan Jalnos, confirm curator review, and submit one approved source or HTTPS source URL.",
      },
      {
        status: 400,
        headers: {
          ...noStoreHeaders,
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      },
    );
  }

  try {
    const result = await runDemoWebResearch(parsed.data, dependencies);
    return NextResponse.json(result, {
      headers: {
        ...noStoreHeaders,
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  } catch (error) {
    if (error instanceof ResearchFetchError) {
      const clientError = ["invalid_url", "blocked_url", "blocked_address"].includes(
        error.code,
      );
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status: clientError ? 400 : 502,
          headers: {
            ...noStoreHeaders,
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        },
      );
    }
    return NextResponse.json(
      { error: "The research run could not be completed." },
      { status: 502, headers: noStoreHeaders },
    );
  }
}

export async function POST(request: Request) {
  return handleDemoResearchPost(request);
}
