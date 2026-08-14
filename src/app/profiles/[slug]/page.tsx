import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageBanner } from "@/components/page-banner";
import { PublicShell } from "@/components/public-shell";
import { StatusPill } from "@/components/status-pill";
import { localeFrom, t } from "@/lib/i18n";
import { getArchiveRepository } from "@/lib/repository";

export const metadata: Metadata = { title: "Published profile / Perfil publicado" };

export default async function ProfilePage({ params, searchParams }: PageProps<"/profiles/[slug]">) {
  const locale = localeFrom((await searchParams).lang);
  const { slug } = await params;
  const catalog = await getArchiveRepository().publicCatalog(locale);
  const survivor = catalog.survivors.find((candidate) => candidate.slug === slug);
  if (!survivor) notFound();
  const items = catalog.archiveItems.filter((item) => item.survivorId === survivor.id);
  const releases = catalog.releases.filter((release) => release.entityId === survivor.id);
  const sources = catalog.sources.filter((source) =>
    releases.some((release) => release.sourceIds.includes(source.id)),
  );

  return (
    <PublicShell locale={locale} path={`/profiles/${slug}`}>
      <PageBanner
        eyebrow={locale === "es" ? "Perfil publicado" : "Published profile"}
        title={survivor.displayName[locale]}
        description={survivor.summary[locale]}
      />
      <section className="section">
        <div className="content-wrap grid-2">
          <article className="card">
            <div className="status-row">
              <StatusPill>{t(locale, "curatorReviewed")}</StatusPill>
              <StatusPill tone="pending">Demo</StatusPill>
            </div>
            <p className="notice">{t(locale, "demoNotice")}</p>
            <h2>{locale === "es" ? "Sobre este registro" : "About this record"}</h2>
            <p>{survivor.summary[locale]}</p>
            <dl>
              <dt className="field-label">{locale === "es" ? "Idioma original" : "Original language"}</dt>
              <dd>{survivor.originalLanguage.toLocaleUpperCase()}</dd>
              <dt className="field-label">{locale === "es" ? "Estado" : "Status"}</dt>
              <dd>{locale === "es" ? "Publicado con aprobación curatorial" : "Published with curator approval"}</dd>
            </dl>
          </article>
          <aside className="card">
            <p className="eyebrow">{locale === "es" ? "Procedencia" : "Provenance"}</p>
            <h2>{locale === "es" ? "Fuentes aprobadas" : "Approved sources"}</h2>
            <ol className="source-list">
              {sources.map((source) => (
                <li key={source.id}>
                  {source.url ? <a href={source.url}>{source.citation[locale]}</a> : source.citation[locale]}
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>
      <section className="section section-paper">
        <div className="content-wrap">
          <div className="section-heading">
            <div><p className="eyebrow">{locale === "es" ? "Objetos publicados" : "Published objects"}</p><h2>{locale === "es" ? "Material del perfil" : "Profile material"}</h2></div>
            <p>{t(locale, "onlyPublished")}</p>
          </div>
          {items.length ? items.map((item) => (
            <article className="card" key={item.id}>
              <StatusPill>{item.itemType}</StatusPill>
              <h3>{item.title}</h3>
              <p>{item.rightsStatement}</p>
            </article>
          )) : <p className="notice">{locale === "es" ? "No hay objetos publicados para este idioma." : "No objects are published for this language."}</p>}
        </div>
      </section>
    </PublicShell>
  );
}
