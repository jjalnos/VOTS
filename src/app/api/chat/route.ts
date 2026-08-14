import { NextResponse } from "next/server";
import { z } from "zod";
import { getInternalArchiveAIProvider } from "@/lib/ai/provider";
import { answerFromPublishedCatalog } from "@/lib/chat/cited-answer";
import { getArchiveRepository } from "@/lib/repository";

const requestSchema = z.object({
  question: z.string().trim().min(2).max(600),
  locale: z.enum(["en", "es"]),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid question and locale are required." }, { status: 400 });
  }

  const catalog = await getArchiveRepository().publicCatalog(parsed.data.locale);
  const grounded = answerFromPublishedCatalog(parsed.data.question, parsed.data.locale, catalog);
  let answer = grounded.answer;
  let provider: "mock" | "local_openai_compatible" = "mock";

  if (grounded.citations.length) {
    const internalProvider = getInternalArchiveAIProvider();
    provider = internalProvider.name;
    try {
      answer = await internalProvider.answerPublishedChat({
        question: parsed.data.question,
        locale: parsed.data.locale,
        publishedContext: grounded.answer,
      });
    } catch {
      answer = grounded.answer;
      provider = "mock";
    }
  }

  return NextResponse.json(
    { ...grounded, answer, provider },
    { headers: { "Cache-Control": "no-store" } },
  );
}
