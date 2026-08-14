import type { Metadata } from "next";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireAction } from "@/lib/auth/server-session";
import { localeFrom } from "@/lib/i18n";
import { getArchiveRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review queue", robots: { index: false, follow: false } };

export default async function CuratorReviewPage({ searchParams }: PageProps<"/curator/review">) {
  const locale = localeFrom((await searchParams).lang);
  const actor = await requireAction("review_content", "/curator/review");
  const workspace = await getArchiveRepository().curatorWorkspace(actor);
  const queue = [
    ...workspace.archiveItems.filter((item) => item.reviewStatus !== "approved").map((item) => ({ id: item.id, kind: "archive item", title: item.title, status: item.reviewStatus })),
    ...workspace.stories.filter((story) => story.reviewStatus !== "approved").map((story) => ({ id: story.id, kind: "story", title: story.title[locale], status: story.reviewStatus })),
    ...workspace.sources.filter((source) => source.approvalStatus !== "approved").map((source) => ({ id: source.id, kind: "source", title: source.title, status: source.approvalStatus })),
  ];
  return <WorkspaceShell actor={actor} locale={locale} path="/curator/review" title={locale === "es" ? "Cola de revisión" : "Review queue"} description={locale === "es" ? "Toda extracción, coincidencia, traducción e investigación digital permanece como sugerencia hasta una decisión curatorial." : "Every digital extraction, match, translation, and research result remains a suggestion until a curator decides."}><section className="section"><div className="content-wrap"><p className="notice private">{locale === "es" ? "Aprobar una sugerencia no publica el registro. La publicación es un paso separado." : "Approving a suggestion does not publish the record. Publication is a separate step."}</p><div className="data-table-wrap" style={{ marginTop: "2rem" }}><table className="data-table"><thead><tr><th>{locale === "es" ? "Tipo" : "Type"}</th><th>{locale === "es" ? "Registro" : "Record"}</th><th>{locale === "es" ? "Estado" : "Status"}</th><th>{locale === "es" ? "Decisión" : "Decision"}</th></tr></thead><tbody>{queue.map((record) => <tr key={record.id}><td>{record.kind}</td><td><strong>{record.title}</strong><br /><small>{record.id}</small></td><td><StatusPill tone="pending">{record.status}</StatusPill></td><td><button className="button secondary" type="button" disabled>{locale === "es" ? "Abrir revisión" : "Open review"}</button></td></tr>)}</tbody></table></div></div></section></WorkspaceShell>;
}
