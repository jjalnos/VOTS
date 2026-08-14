import type { Metadata } from "next";
import { PageBanner } from "@/components/page-banner";
import { PublicShell } from "@/components/public-shell";
import { StatusPill } from "@/components/status-pill";
import { getPublicCatalog } from "@/lib/data/public-catalog";
import { localeFrom, t } from "@/lib/i18n";

export const metadata: Metadata = { title: "Stories / Historias" };

export default async function StoriesPage({ searchParams }: PageProps<"/stories">) {
  const locale = localeFrom((await searchParams).lang);
  const catalog = getPublicCatalog(locale);
  return (
    <PublicShell locale={locale} path="/stories">
      <PageBanner
        eyebrow={t(locale, "publicArchive")}
        title={locale === "es" ? "Historias revisadas" : "Reviewed stories"}
        description={locale === "es" ? "Narrativas publicadas con fuentes y una decisión curatorial registrada." : "Narratives published with sources and a recorded curator decision."}
      />
      <section className="section">
        <div className="content-wrap">
          {catalog.stories.map((story) => (
            <article className="card" id={story.slug} key={story.id} style={{ marginBottom: "1rem" }}>
              <div className="status-row"><StatusPill>{t(locale, "curatorReviewed")}</StatusPill><StatusPill tone="pending">Demo</StatusPill></div>
              <p className="eyebrow">{locale === "es" ? "Historia del archivo" : "Archive story"}</p>
              <h2>{story.title[locale]}</h2>
              <p className="hero-lead" style={{ color: "var(--ink-soft)" }}>{story.dek[locale]}</p>
              <p>{story.body[locale]}</p>
              <h3>{locale === "es" ? "Fuentes" : "Sources"}</h3>
              <ol className="source-list">
                {catalog.sources.filter((source) => story.sourceIds.includes(source.id)).map((source) => (
                  <li key={source.id}>{source.url ? <a href={source.url}>{source.citation[locale]}</a> : source.citation[locale]}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
