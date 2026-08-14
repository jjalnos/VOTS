import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/policy";
import { getActor } from "@/lib/auth/server-session";
import { getInternalArchiveAIProvider } from "@/lib/ai/provider";
import { hasTrustedOrigin } from "@/lib/http/origin";

const schema = z.object({
  sourceText: z.string().min(1).max(30_000),
  sourceLocale: z.enum(["en", "es"]),
  targetLocale: z.enum(["en", "es"]),
});

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Cross-site AI requests are not accepted." }, { status: 403 });
  const actor = await getActor();
  if (!actor || !can(actor, "review_content")) return NextResponse.json({ error: "Curator access required." }, { status: actor ? 403 : 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.sourceLocale === parsed.data.targetLocale) return NextResponse.json({ error: "Valid source and target languages are required." }, { status: 400 });
  const provider = getInternalArchiveAIProvider();
  try {
    const suggestion = await provider.suggestTranslation(parsed.data);
    return NextResponse.json({ provider: provider.name, suggestion, publicationStatus: "not_published" });
  } catch {
    return NextResponse.json({ error: "Internal AI is unavailable and no translation was created." }, { status: 503 });
  }
}
