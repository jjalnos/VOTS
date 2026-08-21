import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/policy";
import { getActor } from "@/lib/auth/server-session";
import {
  ExternalResearchGovernanceError,
  runGovernedExternalResearch,
} from "@/lib/ai/external-governance";
import { EXTERNAL_RESEARCH_COST_ACKNOWLEDGEMENT } from "@/lib/ai/types";
import { hasTrustedOrigin } from "@/lib/http/origin";

export const runtime = "nodejs";

const researchSchema = z.object({
  query: z.string().trim().min(10).max(800),
  locale: z.enum(["en", "es"]),
  confirmed: z.literal(true),
  costAcknowledgement: z.literal(EXTERNAL_RESEARCH_COST_ACKNOWLEDGEMENT),
});

const museumCandidateDomains = [
  "hmmsa.org",
  "ushmm.org",
  "yadvashem.org",
  "fortunoff.library.yale.edu",
  "sfi.usc.edu",
];
const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Cross-site research requests are not accepted." }, { status: 403, headers: noStoreHeaders });
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStoreHeaders });
  if (!can(actor, "run_external_research")) return NextResponse.json({ error: "Curator MFA and permission are required." }, { status: 403, headers: noStoreHeaders });
  const parsed = researchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "An explicit curator research request is required." }, { status: 400, headers: noStoreHeaders });
  try {
    const result = await runGovernedExternalResearch({
      query: parsed.data.query,
      locale: parsed.data.locale,
      allowedDomains: museumCandidateDomains,
      initiatedByUserId: actor.userId,
      curatorConfirmed: true,
      costAcknowledgement: parsed.data.costAcknowledgement,
    });
    const suggestion = { ...result.suggestion };
    delete suggestion.providerUsage;
    return NextResponse.json(
      { ...suggestion, usage: result.usage },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof ExternalResearchGovernanceError) {
      return NextResponse.json(
        { error: error.message, ...(error.usage ? { usage: error.usage } : {}) },
        { status: error.httpStatus, headers: noStoreHeaders },
      );
    }
    return NextResponse.json(
      { error: "The external research provider could not complete the request." },
      { status: 502, headers: noStoreHeaders },
    );
  }
}
