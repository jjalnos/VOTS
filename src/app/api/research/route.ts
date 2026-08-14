import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/policy";
import { getActor } from "@/lib/auth/server-session";
import { getExternalResearchProvider } from "@/lib/ai/provider";

const researchSchema = z.object({
  query: z.string().trim().min(10).max(800),
  locale: z.enum(["en", "es"]),
  confirmed: z.literal(true),
});

const museumCandidateDomains = [
  "hmmsa.org",
  "ushmm.org",
  "yadvashem.org",
  "fortunoff.library.yale.edu",
  "sfi.usc.edu",
];

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!can(actor, "run_external_research")) return NextResponse.json({ error: "Curator MFA and permission are required." }, { status: 403 });
  const parsed = researchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "An explicit curator research request is required." }, { status: 400 });
  try {
    const suggestion = await getExternalResearchProvider().research({
      query: parsed.data.query,
      locale: parsed.data.locale,
      allowedDomains: museumCandidateDomains,
      initiatedByUserId: actor.userId,
    });
    return NextResponse.json(suggestion, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The external research provider could not complete the request." }, { status: 502 });
  }
}
