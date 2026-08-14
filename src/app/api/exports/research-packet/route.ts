import { NextResponse } from "next/server";
import { can } from "@/lib/auth/policy";
import { getActor } from "@/lib/auth/server-session";
import { seedSources, seedSurvivors } from "@/lib/data/seed";
import { renderApprovedResearchPacket } from "@/lib/export/research-packet";

export async function POST() {
  const actor = await getActor();
  if (!actor || !can(actor, "export_research_packet")) return NextResponse.json({ error: "Curator access required." }, { status: actor ? 403 : 401 });
  const survivor = seedSurvivors.find((record) => record.id === "survivor-demo-published");
  if (!survivor) return NextResponse.json({ error: "Approved record not found." }, { status: 404 });
  const markdown = renderApprovedResearchPacket({
    survivor,
    locale: "en",
    facts: [],
    sources: seedSources,
    approvedBy: actor.displayName,
  });
  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": "attachment; filename=hmmsa-approved-research-packet.md",
      "Cache-Control": "no-store",
    },
  });
}
