import { NextResponse } from "next/server";
import { z } from "zod";
import {
  internalAIUsage,
  runInternalArchiveTask,
} from "@/lib/ai/internal-provider";
import { checkPublicChatRateLimit } from "@/lib/chat/rate-limit";
import { answerFromPublishedCatalog } from "@/lib/chat/cited-answer";
import { readBoundedJson } from "@/lib/http/request";
import { getArchiveRepository } from "@/lib/repository";

const requestSchema = z.object({
  question: z.string().trim().min(2).max(600),
  locale: z.enum(["en", "es"]),
});
const MAX_BODY_BYTES = 4 * 1024;
const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const rateLimit = checkPublicChatRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "The public archive guide is busy. Please try again shortly." },
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
      { error: "The public archive question is too large." },
      { status: 413, headers: noStoreHeaders },
    );
  }
  const parsed = requestSchema.safeParse(json.ok ? json.value : null);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid question and locale are required." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const catalog = await getArchiveRepository().publicCatalog(parsed.data.locale);
  const grounded = answerFromPublishedCatalog(parsed.data.question, parsed.data.locale, catalog);
  let answer = grounded.answer;
  let provider: "mock" | "local_openai_compatible" = "mock";
  let aiUsage = internalAIUsage("mock", "not-needed");

  if (grounded.citations.length) {
    const result = await runInternalArchiveTask((internalProvider) =>
      internalProvider.answerPublishedChat({
        question: parsed.data.question,
        locale: parsed.data.locale,
        publishedContext: grounded.answer,
      }),
    );
    answer = result.result;
    provider = result.provider;
    aiUsage = result.usage;
  }

  return NextResponse.json(
    { ...grounded, answer, provider, aiUsage },
    {
      headers: {
        ...noStoreHeaders,
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    },
  );
}
