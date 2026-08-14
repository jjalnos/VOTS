import type { Metadata } from "next";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireAction } from "@/lib/auth/server-session";
import { seedArchiveItems, seedSurvivors } from "@/lib/data/seed";
import { localeFrom } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Curator archive", robots: { index: false, follow: false } };

export default async function CuratorArchivePage({ searchParams }: PageProps<"/curator/archive">) {
  const locale = localeFrom((await searchParams).lang);
  const actor = await requireAction("view_archive_workspace", "/curator/archive");
  return (
    <WorkspaceShell actor={actor} locale={locale} path="/curator/archive" title={locale === "es" ? "Archivo curatorial" : "Curatorial archive"} description={locale === "es" ? "Crear y revisar registros privados antes de considerar una publicación." : "Create and review private records before any publication is considered."}>
      <section className="section"><div className="content-wrap">
        <div className="metric-grid" style={{ marginBottom: "2rem" }}><div className="metric"><strong>{seedSurvivors.length}</strong>{locale === "es" ? "registros de sobrevivientes" : "survivor records"}</div><div className="metric"><strong>{seedArchiveItems.filter((item) => item.visibility === "private").length}</strong>{locale === "es" ? "objetos privados" : "private objects"}</div><div className="metric"><strong>{seedArchiveItems.filter((item) => item.reviewStatus === "pending").length}</strong>{locale === "es" ? "pendientes" : "pending review"}</div></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{locale === "es" ? "Título" : "Title"}</th><th>{locale === "es" ? "Familia" : "Family"}</th><th>{locale === "es" ? "Visibilidad" : "Visibility"}</th><th>{locale === "es" ? "Revisión" : "Review"}</th><th>{locale === "es" ? "Derechos" : "Rights"}</th></tr></thead><tbody>{seedArchiveItems.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><br /><small>{item.id}</small></td><td>{item.familyId}</td><td><StatusPill tone={item.visibility === "private" ? "private" : "approved"}>{item.visibility}</StatusPill></td><td><StatusPill tone={item.reviewStatus === "pending" ? "pending" : "approved"}>{item.reviewStatus}</StatusPill></td><td>{item.consentRights}</td></tr>)}</tbody></table></div>
      </div></section>
    </WorkspaceShell>
  );
}
