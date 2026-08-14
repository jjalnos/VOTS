import type { Metadata } from "next";
import { PageBanner } from "@/components/page-banner";
import { PublicShell } from "@/components/public-shell";
import { StatusPill } from "@/components/status-pill";
import { localeFrom, t } from "@/lib/i18n";
import { getArchiveRepository } from "@/lib/repository";

export const metadata: Metadata = { title: "Timeline / Línea de tiempo" };

export default async function TimelinePage({ searchParams }: PageProps<"/timeline">) {
  const locale = localeFrom((await searchParams).lang);
  const catalog = await getArchiveRepository().publicCatalog(locale);
  return (
    <PublicShell locale={locale} path="/timeline">
      <PageBanner
        eyebrow={t(locale, "publicArchive")}
        title={locale === "es" ? "Línea de tiempo con fuentes" : "Sourced timeline"}
        description={locale === "es" ? "Cada fecha y descripción requiere una fuente aprobada y publicación explícita." : "Every date and description requires an approved source and explicit publication."}
      />
      <section className="section">
        <div className="content-wrap">
          <p className="notice">{t(locale, "demoNotice")}</p>
          <div className="timeline-list" style={{ marginTop: "2rem" }}>
            {catalog.timelineEvents.map((event) => (
              <article className="timeline-entry" id={event.id} key={event.id}>
                <div className="status-row"><StatusPill>{event.dateLabel[locale]}</StatusPill><StatusPill tone="pending">Demo</StatusPill></div>
                <h2>{event.title[locale]}</h2>
                <p>{event.description[locale]}</p>
                <ol className="source-list">
                  {catalog.sources.filter((source) => event.sourceIds.includes(source.id)).map((source) => (
                    <li key={source.id}>{source.url ? <a href={source.url}>{source.citation[locale]}</a> : source.citation[locale]}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
