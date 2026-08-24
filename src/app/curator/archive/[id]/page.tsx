import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveDecision } from "@/components/archive-decision";
import { WorkspaceShell } from "@/components/workspace-shell";
import { can } from "@/lib/auth/policy";
import { requireAction } from "@/lib/auth/server-session";
import type { ArchiveItem, FileVersion, Locale, ReviewStatus } from "@/lib/domain/types";
import { localeFrom, withLocale } from "@/lib/i18n";
import { getArchiveRepository } from "@/lib/repository";
import styles from "./record.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Archive record",
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

const rightsLabels: Record<ArchiveItem["consentRights"], Record<Locale, string>> = {
  owned: { en: "Held by the contributor", es: "En poder del colaborador" },
  permission: { en: "Used with permission", es: "Usado con permiso" },
  documented_restriction: {
    en: "Documented restriction",
    es: "Restricción documentada",
  },
};

function displayDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function displaySize(bytes: number, locale: Locale): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", {
    maximumFractionDigits: 1,
  }).format(value)} ${units[unit]}`;
}

/** Only what a sandboxed frame renders safely gets an inline preview. */
function previewKind(mediaType: string): "image" | "pdf" | "text" | "none" {
  const type = mediaType.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  if (type === "text/plain") return "text";
  return "none";
}

export default async function ArchiveRecordPage({ params, searchParams }: PageProps<"/curator/archive/[id]">) {
  const { id } = await params;
  const locale = localeFrom((await searchParams).lang);
  const actor = await requireAction("view_archive_workspace", `/curator/archive/${id}`);
  const detail = await getArchiveRepository().archiveItemDetail(actor, id);
  if (!detail) notFound();

  const es = locale === "es";
  const { item, fileVersions, decisions } = detail;
  const original: FileVersion | undefined = fileVersions[0];
  const contentHref = `/api/archive/items/${item.id}/content`;
  const preview = original ? previewKind(original.mediaType) : "none";
  const canReview = can(actor, "review_content");

  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/curator/archive"
      title={item.title}
      description={
        es
          ? "El registro completo, su original y la decisión curatorial, en un solo lugar."
          : "The whole record, its original, and the curatorial decision, in one place."
      }
    >
      <section className={styles.section}>
        <div className="content-wrap">
          <Link className={styles.back} href={withLocale("/curator/archive", locale)}>
            <span aria-hidden="true">←</span> {es ? "Volver al registro" : "Back to the register"}
          </Link>

          <div className={styles.headline}>
            <div>
              <p className={styles.kind}>{itemTypeLabels[item.itemType][locale]}</p>
              <h2>{item.title}</h2>
              <p className={styles.recordId}>{item.id}</p>
            </div>
            <div className={styles.state}>
              <span className={`${styles.status} ${styles[item.reviewStatus]}`}>
                {reviewLabels[item.reviewStatus][locale]}
              </span>
              <span className={styles.privateLabel}>{es ? "No público" : "Not public"}</span>
            </div>
          </div>

          <div className={styles.layout}>
            <div className={styles.previewColumn}>
              <h3 className={styles.columnHeading}>{es ? "El original" : "The original"}</h3>
              {original ? (
                <>
                  <figure className={styles.preview}>
                    {preview === "image" ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- a private,
                         no-store original that must never reach the image optimizer's cache. */
                      <img src={contentHref} alt={item.title} className={styles.previewImage} />
                    ) : preview === "pdf" || preview === "text" ? (
                      <iframe
                        src={contentHref}
                        title={item.title}
                        className={styles.previewFrame}
                        sandbox=""
                      />
                    ) : (
                      <div className={styles.previewFallback}>
                        <p>
                          {es
                            ? "Este formato no se puede previsualizar aquí."
                            : "This format cannot be previewed here."}
                        </p>
                      </div>
                    )}
                  </figure>
                  <dl className={styles.fileFacts}>
                    <div>
                      <dt>{es ? "Archivo" : "File"}</dt>
                      <dd>{original.originalFilename}</dd>
                    </div>
                    <div>
                      <dt>{es ? "Formato" : "Format"}</dt>
                      <dd>{original.mediaType}</dd>
                    </div>
                    <div>
                      <dt>{es ? "Tamaño" : "Size"}</dt>
                      <dd>{displaySize(original.byteSize, locale)}</dd>
                    </div>
                    <div>
                      <dt>{es ? "Suma de verificación" : "Checksum"}</dt>
                      <dd className={styles.checksum}>{original.checksumSha256}</dd>
                    </div>
                  </dl>
                  <a className={styles.download} href={contentHref} download={original.originalFilename}>
                    {es ? "Descargar el original" : "Download the original"}
                  </a>
                </>
              ) : (
                <div className={styles.previewFallback}>
                  <p>{es ? "No hay un original guardado." : "No original is stored for this record."}</p>
                </div>
              )}
            </div>

            <div className={styles.detailColumn}>
              <h3 className={styles.columnHeading}>{es ? "El registro" : "The record"}</h3>
              <dl className={styles.facts}>
                <div>
                  <dt>{es ? "Colaborador" : "Contributor"}</dt>
                  <dd>{item.sourceContributor}</dd>
                </div>
                <div>
                  <dt>{es ? "Recibido" : "Received"}</dt>
                  <dd>
                    <time dateTime={item.createdAt}>{displayDate(item.createdAt, locale)}</time>
                  </dd>
                </div>
                <div>
                  <dt>{es ? "Asociación" : "Association"}</dt>
                  <dd>{item.familyId ?? item.survivorId ?? (es ? "Sin asignar" : "Unassigned")}</dd>
                </div>
                <div>
                  <dt>{es ? "Idioma original" : "Original language"}</dt>
                  <dd>{item.originalLanguage}</dd>
                </div>
                <div>
                  <dt>{es ? "Derechos" : "Rights"}</dt>
                  <dd>{rightsLabels[item.consentRights][locale]}</dd>
                </div>
              </dl>
              <div className={styles.rights}>
                <h4>{es ? "Declaración de derechos" : "Rights statement"}</h4>
                <p>{item.rightsStatement}</p>
              </div>

              {canReview ? (
                <ArchiveDecision itemId={item.id} reviewStatus={item.reviewStatus} locale={locale} />
              ) : (
                <p className={styles.readOnly}>
                  {es
                    ? "Su cuenta puede ver este registro pero no decidir sobre él."
                    : "This account can view this record but not decide on it."}
                </p>
              )}

              {decisions.length ? (
                <div className={styles.history}>
                  <h4>{es ? "Historial de decisiones" : "Decision history"}</h4>
                  <ol>
                    {decisions.map((decision) => (
                      <li key={decision.id}>
                        <p className={styles.historyHead}>
                          {decision.decision === "approve"
                            ? es ? "Aprobado" : "Approved"
                            : es ? "Devuelto" : "Returned"}
                          <time dateTime={decision.decidedAt}>
                            {displayDate(decision.decidedAt, locale)}
                          </time>
                        </p>
                        <p className={styles.historyReason}>{decision.rationale}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </WorkspaceShell>
  );
}
