import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/policy";
import { getActor } from "@/lib/auth/server-session";
import { renderApprovedResearchPacket } from "@/lib/export/research-packet";
import { hasTrustedOrigin } from "@/lib/http/origin";
import { getArchiveRepository } from "@/lib/repository";

const requestSchema = z.object({
  survivorId: z.string().trim().min(1).max(180),
  locale: z.enum(["en", "es"]),
});

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Cross-site export requests are not accepted." }, { status: 403 });
  const actor = await getActor();
  if (!actor || !can(actor, "export_research_packet")) return NextResponse.json({ error: "Curator access required." }, { status: actor ? 403 : 401 });
  const formData = await request.formData();
  const parsed = requestSchema.safeParse({
    survivorId: formData.get("survivorId"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) return NextResponse.json({ error: "An approved record and locale are required." }, { status: 400 });
  const workspace = await getArchiveRepository().curatorWorkspace(actor);
  const survivor = workspace.survivors.find(
    (record) => record.id === parsed.data.survivorId && record.reviewStatus === "approved",
  );
  if (!survivor) return NextResponse.json({ error: "Approved record not found." }, { status: 404 });
  const relatedItemIds = new Set(
    workspace.archiveItems
      .filter((item) => item.survivorId === survivor.id)
      .map((item) => item.id),
  );
  const sourceIds = new Set(
    workspace.releases
      .filter(
        (release) =>
          release.status === "published" &&
          (release.entityId === survivor.id || relatedItemIds.has(release.entityId)),
      )
      .flatMap((release) => release.sourceIds),
  );
  const markdown = renderApprovedResearchPacket({
    survivor,
    locale: parsed.data.locale,
    facts: workspace.facts.filter(
      (fact) => relatedItemIds.has(fact.archiveItemId) && fact.status === "approved",
    ),
    sources: workspace.sources.filter(
      (source) => sourceIds.has(source.id) && source.approvalStatus === "approved",
    ),
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
