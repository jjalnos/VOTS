import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/policy";
import { getActor } from "@/lib/auth/server-session";
import { getInternalArchiveAIProvider } from "@/lib/ai/provider";
import { hasTrustedOrigin } from "@/lib/http/origin";

const schema = z.object({
  archiveItemId: z.string().min(1).max(120),
  locale: z.enum(["en", "es"]),
  content: z.string().max(30_000).optional(),
  curatorPrompt: z.string().max(1_000).optional(),
});

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Cross-site AI requests are not accepted." }, { status: 403 });
  const actor = await getActor();
  if (!actor || !can(actor, "review_content")) return NextResponse.json({ error: "Curator access required." }, { status: actor ? 403 : 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid extraction request." }, { status: 400 });
  const provider = getInternalArchiveAIProvider();
  try {
    const suggestions = await provider.suggestExtraction(parsed.data);
    return NextResponse.json({ provider: provider.name, suggestions, publicationStatus: "not_published" });
  } catch {
    return NextResponse.json({ error: "Internal AI is unavailable and no suggestion was created." }, { status: 503 });
  }
}
