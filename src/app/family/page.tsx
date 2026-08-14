import type { Metadata } from "next";
import { UploadForm } from "@/components/upload-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireFamilyAction } from "@/lib/auth/server-session";
import { seedArchiveItems, seedFamilies } from "@/lib/data/seed";
import { localeFrom } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Family contribution / Contribución familiar", robots: { index: false, follow: false } };

export default async function FamilyPage({ searchParams }: PageProps<"/family">) {
  const locale = localeFrom((await searchParams).lang);
  const actor = await requireFamilyAction("view_family_workspace", "/family");
  const family = seedFamilies.find((record) => record.id === actor.familyId);
  const items = seedArchiveItems.filter((item) => item.familyId === actor.familyId);
  return (
    <WorkspaceShell actor={actor} locale={locale} path="/family" title={locale === "es" ? "Contribución familiar" : "Family contribution"} description={locale === "es" ? `Acceso limitado al grupo invitado: ${family?.name ?? actor.familyId}.` : `Access is limited to the invited group: ${family?.name ?? actor.familyId}.`}>
      <section className="section"><div className="content-wrap workspace-shell">
        <aside className="workspace-rail"><p className="eyebrow">{locale === "es" ? "Su grupo" : "Your group"}</p><h3>{family?.name}</h3><p>{locale === "es" ? "No puede ver ni contribuir a ningún otro grupo familiar." : "You cannot view or contribute to any other family group."}</p><p><strong>{items.length}</strong> {locale === "es" ? "registros visibles para usted" : "records visible to you"}</p></aside>
        <div className="card"><h2>{locale === "es" ? "Enviar material" : "Contribute material"}</h2><p>{locale === "es" ? "Cada archivo comienza privado y pendiente de revisión curatorial." : "Every file begins private and pending curator review."}</p><UploadForm locale={locale} familyId={actor.familyId} /></div>
      </div></section>
    </WorkspaceShell>
  );
}
