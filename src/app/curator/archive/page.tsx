import type { Metadata } from "next";
import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireAction } from "@/lib/auth/server-session";
import type { Actor } from "@/lib/auth/policy";
import {
  archivePageHref,
  paginateArchiveItems,
  parseArchiveQuery,
} from "@/lib/archive/pagination";
import type { ArchiveItem, Locale, ReviewStatus } from "@/lib/domain/types";
import { localeFrom, withLocale } from "@/lib/i18n";
import { getArchiveRepository } from "@/lib/repository";
import styles from "./archive.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Curator archive", robots: { index: false, follow: false } };

const itemTypeLabels: Record<ArchiveItem["itemType"], Record<Locale, string>> = {
  document: { en: "Document", es: "Documento" },
  photograph: { en: "Photograph", es: "Fotografía" },
  audio: { en: "Audio", es: "Audio" },
  video: { en: "Video", es: "Video" },
  artifact: { en: "Artifact", es: "Objeto" },
  other: { en: "Other", es: "Otro" },
};

/** The register doubles as the review queue: these two statuses still need a decision. */
const awaitingReview = new Set<ReviewStatus>(["pending", "in_review"]);

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

function displayUploader(item: ArchiveItem, actor: Actor, locale: Locale): string {
  if (item.uploadedBy === actor.userId) {
    return `${actor.displayName} · ${locale === "es" ? "usted" : "you"}`;
  }
  if (item.uploadedBy === "user-curator-demo") {
    return locale === "es" ? "Robin · curadora de demostración" : "Robin · demo curator";
  }
  return locale === "es" ? "Colaborador del museo" : "Museum contributor";
}

export default async function CuratorArchivePage({ searchParams }: PageProps<"/curator/archive">) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const actor = await requireAction("view_archive_workspace", "/curator/archive");
  const workspace = await getArchiveRepository().curatorWorkspace(actor);
  const archivePage = paginateArchiveItems(workspace.archiveItems, parseArchiveQuery(params));
  const hasFilters = Boolean(
    archivePage.query.q || archivePage.query.type !== "all" || archivePage.query.status !== "all",
  );
  const pendingCount = workspace.archiveItems.filter((item) =>
    awaitingReview.has(item.reviewStatus),
  ).length;
  const clearHref = archivePageHref({ q: "", type: "all", status: "all" }, 1, locale);
  const pendingHref = archivePageHref({ q: "", type: "all", status: "pending" }, 1, locale);

  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/curator/archive"
      title={locale === "es" ? "Archivo curatorial" : "Curatorial archive"}
      description={
        locale === "es"
          ? "Cada carga permanece visible, rastreable y privada mientras avanza por la revisión."
          : "Every upload remains visible, traceable, and private while it moves through review."
      }
    >
      <section className={styles.section} aria-labelledby="archive-register-title">
        <div className="content-wrap">
          <header className={styles.introduction}>
            <div>
              <p className={styles.kicker}>{locale === "es" ? "Registro de ingreso" : "Intake register"}</p>
              <h2 id="archive-register-title">
                {locale === "es" ? "Todo lo que ha llegado al archivo." : "Everything that has entered the archive."}
              </h2>
              <p>
                {locale === "es"
                  ? "Busque por título, colaborador o asociación. Los filtros nunca cambian la privacidad ni el estado de publicación de un registro."
                  : "Search by title, contributor, or association. Filters never change a record’s privacy or publication state."}
              </p>
            </div>
            <dl className={styles.totals} aria-label={locale === "es" ? "Resumen del archivo" : "Archive summary"}>
              <div>
                <dt>{locale === "es" ? "Cargas" : "Uploads"}</dt>
                <dd>{workspace.archiveItems.length}</dd>
              </div>
              <div>
                <dt>{locale === "es" ? "Esperan revisión" : "Awaiting review"}</dt>
                <dd>
                  {pendingCount ? (
                    <Link className={styles.pendingLink} href={pendingHref}>
                      {pendingCount}
                    </Link>
                  ) : (
                    pendingCount
                  )}
                </dd>
              </div>
              <div>
                <dt>{locale === "es" ? "Coincidencias" : "Matches"}</dt>
                <dd>{archivePage.total}</dd>
              </div>
            </dl>
          </header>

          <form className={styles.filters} action="/curator/archive" method="get" role="search" aria-label={locale === "es" ? "Filtrar cargas" : "Filter uploads"}>
            <input type="hidden" name="lang" value={locale} />
            <div className={styles.searchField}>
              <label htmlFor="archive-query">{locale === "es" ? "Buscar en el registro" : "Search the register"}</label>
              <input
                id="archive-query"
                name="q"
                type="search"
                maxLength={180}
                defaultValue={archivePage.query.q}
                placeholder={locale === "es" ? "Título, colaborador o familia" : "Title, contributor, or family"}
              />
            </div>
            <div>
              <label htmlFor="archive-type">{locale === "es" ? "Formato" : "Format"}</label>
              <select id="archive-type" name="type" defaultValue={archivePage.query.type}>
                <option value="all">{locale === "es" ? "Todos los formatos" : "All formats"}</option>
                {Object.entries(itemTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label[locale]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="archive-status">{locale === "es" ? "Revisión" : "Review"}</label>
              <select id="archive-status" name="status" defaultValue={archivePage.query.status}>
                <option value="all">{locale === "es" ? "Todos los estados" : "All statuses"}</option>
                {Object.entries(reviewLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label[locale]}</option>
                ))}
              </select>
            </div>
            <div className={styles.filterActions}>
              <button type="submit">{locale === "es" ? "Aplicar" : "Apply"}</button>
              {hasFilters ? <Link href={clearHref}>{locale === "es" ? "Borrar" : "Clear"}</Link> : null}
            </div>
          </form>

          <div className={styles.resultsHeading}>
            <p aria-live="polite">
              {archivePage.total
                ? locale === "es"
                  ? `Mostrando ${archivePage.firstResult}–${archivePage.lastResult} de ${archivePage.total}`
                  : `Showing ${archivePage.firstResult}–${archivePage.lastResult} of ${archivePage.total}`
                : locale === "es" ? "No hay cargas que coincidan" : "No matching uploads"}
            </p>
            <p>{locale === "es" ? `Página ${archivePage.page} de ${archivePage.pageCount}` : `Page ${archivePage.page} of ${archivePage.pageCount}`}</p>
          </div>

          {archivePage.items.length ? (
            <ol className={styles.register} start={archivePage.firstResult}>
              {archivePage.items.map((item) => (
                <li key={item.id}>
                  <article className={styles.record}>
                    <div className={styles.recordLead}>
                      <p className={styles.recordKind}>{itemTypeLabels[item.itemType][locale]}</p>
                      <h3>
                        <Link
                          className={styles.recordLink}
                          href={withLocale(`/curator/archive/${item.id}`, locale)}
                        >
                          {item.title}
                        </Link>
                      </h3>
                      <p className={styles.recordId}>{item.id}</p>
                    </div>
                    <dl className={styles.recordDetails}>
                      <div>
                        <dt>{locale === "es" ? "Cargado por" : "Uploaded by"}</dt>
                        <dd>{displayUploader(item, actor, locale)}</dd>
                      </div>
                      <div>
                        <dt>{locale === "es" ? "Recibido" : "Received"}</dt>
                        <dd><time dateTime={item.createdAt}>{displayDate(item.createdAt, locale)}</time></dd>
                      </div>
                      <div>
                        <dt>{locale === "es" ? "Asociación" : "Association"}</dt>
                        <dd>{item.familyId ?? item.survivorId ?? (locale === "es" ? "Sin asignar" : "Unassigned")}</dd>
                      </div>
                    </dl>
                    <div className={styles.recordState}>
                      <span className={`${styles.status} ${styles[item.reviewStatus]}`}>{reviewLabels[item.reviewStatus][locale]}</span>
                      <span className={styles.privateLabel}>{locale === "es" ? "No público" : "Not public"}</span>
                      <Link className={styles.openRecord} href={withLocale(`/curator/archive/${item.id}`, locale)}>
                        {awaitingReview.has(item.reviewStatus)
                          ? locale === "es" ? "Revisar" : "Review"
                          : locale === "es" ? "Abrir" : "Open"}
                        <span aria-hidden="true"> →</span>
                      </Link>
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <div className={styles.emptyState} role="status">
              <h3>{locale === "es" ? "No encontramos una coincidencia." : "No record matches these filters."}</h3>
              <p>{locale === "es" ? "Borre un filtro o pruebe una búsqueda más amplia." : "Clear a filter or try a broader search."}</p>
              <Link href={clearHref}>{locale === "es" ? "Ver todas las cargas" : "View every upload"}</Link>
            </div>
          )}

          <nav className={styles.pagination} aria-label={locale === "es" ? "Páginas del archivo" : "Archive pages"}>
            {archivePage.page > 1 ? (
              <Link href={archivePageHref(archivePage.query, archivePage.page - 1, locale)} rel="prev">
                <span aria-hidden="true">←</span> {locale === "es" ? "Anterior" : "Previous"}
              </Link>
            ) : (
              <span aria-disabled="true"><span aria-hidden="true">←</span> {locale === "es" ? "Anterior" : "Previous"}</span>
            )}
            <strong aria-current="page">{archivePage.page} / {archivePage.pageCount}</strong>
            {archivePage.page < archivePage.pageCount ? (
              <Link href={archivePageHref(archivePage.query, archivePage.page + 1, locale)} rel="next">
                {locale === "es" ? "Siguiente" : "Next"} <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <span aria-disabled="true">{locale === "es" ? "Siguiente" : "Next"} <span aria-hidden="true">→</span></span>
            )}
          </nav>
        </div>
      </section>
    </WorkspaceShell>
  );
}
