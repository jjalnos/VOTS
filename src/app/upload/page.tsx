import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UploadForm, type UploadFormMode } from "@/components/upload-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import { can } from "@/lib/auth/policy";
import { getActor } from "@/lib/auth/server-session";
import type { ArchiveItem, Locale, ReviewStatus, Survivor } from "@/lib/domain/types";
import { localeFrom } from "@/lib/i18n";
import { getArchiveRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Archive upload / Cargar al archivo",
  robots: { index: false, follow: false },
};

const itemTypeLabels: Record<ArchiveItem["itemType"], Record<Locale, string>> = {
  document: { en: "Document", es: "Documento" },
  photograph: { en: "Photograph", es: "Fotografía" },
  audio: { en: "Audio", es: "Audio" },
  video: { en: "Video", es: "Video" },
  artifact: { en: "Artifact", es: "Objeto" },
  other: { en: "Other", es: "Otro" },
};

const reviewLabels: Record<ReviewStatus, Record<Locale, string>> = {
  pending: { en: "Pending review", es: "Revisión pendiente" },
  in_review: { en: "In review", es: "En revisión" },
  approved: { en: "Approved", es: "Aprobado" },
  rejected: { en: "Returned", es: "Devuelto" },
};

function displayDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function survivorOptions(survivors: Survivor[], locale: Locale) {
  return survivors.map((survivor) => ({
    id: survivor.id,
    familyId: survivor.familyId,
    name: survivor.displayName[locale] || survivor.displayName.en,
  }));
}

function RecentUploads({ items, locale }: { items: ArchiveItem[]; locale: Locale }) {
  const spanish = locale === "es";
  if (items.length === 0) return null;
  return (
    <section className="section upload-recent" aria-labelledby="recent-uploads-title">
      <div className="content-wrap">
        <h2 id="recent-uploads-title">
          {spanish ? "Sus cargas recientes" : "Your recent uploads"}
        </h2>
        <ul className="upload-recent-list">
          {items.map((item) => (
            <li key={item.id}>
              <span className="upload-recent-title">{item.title}</span>
              <span className="upload-recent-meta">
                {itemTypeLabels[item.itemType][locale]} · {displayDate(item.createdAt, locale)} ·{" "}
                {reviewLabels[item.reviewStatus][locale]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * The archive upload page. It faces administrators and invited family
 * contributors only: an administrator associates an original with any family
 * group, a family contributor is locked to the group that invited them, and
 * everyone else is sent to the workspace they do have — or to sign in.
 */
export default async function UploadPage({ searchParams }: PageProps<"/upload">) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const spanish = locale === "es";
  const actor = await getActor();
  if (!actor) {
    redirect(spanish ? "/login?returnTo=%2Fupload&lang=es" : "/login?returnTo=%2Fupload");
  }

  const repository = getArchiveRepository();
  let mode: UploadFormMode;
  let recentUploads: ArchiveItem[];
  let railBody: React.ReactNode;

  if (can(actor, "upload_original")) {
    const context = await repository.uploadContext(actor);
    mode = {
      kind: "admin",
      families: context.families.map((family) => ({ id: family.id, name: family.name })),
      survivors: survivorOptions(context.survivors, locale),
    };
    recentUploads = context.recentUploads;
    railBody = (
      <>
        <p className="eyebrow">{spanish ? "Antes de cargar" : "Before you upload"}</p>
        <h3>{spanish ? "Cada original lleva su historia" : "Every original carries its history"}</h3>
        <ul className="upload-rail-list">
          <li>
            {spanish
              ? "Asocie el material con el grupo familiar correcto."
              : "Associate the material with the correct family group."}
          </li>
          <li>
            {spanish
              ? "Anote de quién proviene y quién autorizó compartirlo."
              : "Note where it came from and who agreed to share it."}
          </li>
          <li>
            {spanish
              ? "Registre cualquier restricción de uso por escrito."
              : "Record any restriction on its use in writing."}
          </li>
          <li>
            {spanish
              ? "Nada se publica desde esta página: todo queda privado hasta una decisión curatorial."
              : "Nothing publishes from this page: everything stays private until a curatorial decision."}
          </li>
        </ul>
      </>
    );
  } else if (actor.familyId && can(actor, "contribute_upload", actor.familyId)) {
    const workspace = await repository.familyWorkspace(actor);
    if (!workspace) redirect("/unauthorized");
    mode = {
      kind: "family",
      familyId: workspace.family.id,
      familyName: workspace.family.name,
      survivors: survivorOptions(workspace.survivors, locale),
    };
    recentUploads = workspace.archiveItems
      .filter((item) => item.uploadedBy === actor.userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8);
    railBody = (
      <>
        <p className="eyebrow">{spanish ? "Su grupo" : "Your group"}</p>
        <h3>{workspace.family.name}</h3>
        <p>
          {spanish
            ? "Su acceso está limitado al grupo que lo invitó. No puede ver ni contribuir a ningún otro grupo familiar."
            : "Your access is limited to the group that invited you. You cannot view or contribute to any other family group."}
        </p>
        <p>
          <strong>{workspace.archiveItems.length}</strong>{" "}
          {spanish ? "registros visibles para usted" : "records visible to you"}
        </p>
      </>
    );
  } else if (can(actor, "view_archive_workspace")) {
    // Curators review and publish; contributions arrive from administrators
    // and families. Send them to the register where uploads land.
    redirect(spanish ? "/curator/archive?lang=es" : "/curator/archive");
  } else {
    redirect("/unauthorized");
  }

  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/upload"
      title={spanish ? "Cargar al archivo" : "Archive upload"}
      description={
        spanish
          ? "Entregue originales al archivo con su procedencia y sus derechos documentados. Todo comienza privado."
          : "Place originals in the archive with their provenance and rights documented. Everything begins private."
      }
    >
      <section className="section">
        <div className="content-wrap workspace-shell">
          <aside className="workspace-rail">{railBody}</aside>
          <div className="card">
            <h2>{spanish ? "Enviar material" : "Contribute material"}</h2>
            <p>
              {spanish
                ? "Cada archivo comienza privado y pendiente de revisión curatorial."
                : "Every file begins private and pending curator review."}
            </p>
            <UploadForm locale={locale} mode={mode} />
          </div>
        </div>
      </section>
      <RecentUploads items={recentUploads} locale={locale} />
    </WorkspaceShell>
  );
}
