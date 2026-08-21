import Link from "next/link";
import type { Metadata } from "next";
import { PageBanner } from "@/components/page-banner";
import { PublicShell } from "@/components/public-shell";
import { StatusPill } from "@/components/status-pill";
import { localeFrom, t, withLocale } from "@/lib/i18n";
import { getArchiveRepository } from "@/lib/repository";

export const metadata: Metadata = { title: "Survivor directory / Directorio" };

/** Initials for the archival plate shown until a rights-cleared photograph exists. */
function monogram(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? "")
    .join("");
}

export default async function DirectoryPage({ searchParams }: PageProps<"/directory">) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const catalog = await getArchiveRepository().publicCatalog(locale);
  const records = catalog.survivors.filter((survivor) =>
    `${survivor.displayName[locale]} ${survivor.summary[locale]}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );

  return (
    <PublicShell locale={locale} path="/directory">
      <PageBanner
        eyebrow={t(locale, "publicArchive")}
        title={locale === "es" ? "Directorio de sobrevivientes" : "Survivor directory"}
        description={
          locale === "es"
            ? "Busque únicamente perfiles cuya publicación en este idioma fue aprobada por curaduría."
            : "Search only profiles whose publication in this language was approved by a curator."
        }
      />
      <section className="section">
        <div className="content-wrap">
          <form className="search-form" action="/directory" method="get">
            <input type="hidden" name="lang" value={locale} />
            <label className="sr-only" htmlFor="directory-search">
              {locale === "es" ? "Buscar perfiles publicados" : "Search published profiles"}
            </label>
            <input
              id="directory-search"
              name="q"
              type="search"
              defaultValue={query}
              placeholder={locale === "es" ? "Buscar perfiles publicados" : "Search published profiles"}
            />
            <button className="button" type="submit">{locale === "es" ? "Buscar" : "Search"}</button>
          </form>
          <p className="notice">{t(locale, "onlyPublished")}</p>
          <div className="record-grid" style={{ marginTop: "2rem" }}>
            {records.map((record) => (
              <article className="card record-card" key={record.id}>
                <div>
                  {record.portrait ? (
                    <figure className="record-portrait">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={record.portrait.url} alt={record.portrait.credit} />
                      <figcaption>{record.portrait.credit}</figcaption>
                    </figure>
                  ) : (
                    <div className="record-placeholder" aria-hidden="true">
                      <span className="record-monogram">{monogram(record.displayName[locale])}</span>
                      <span className="record-plate-note">
                        {locale === "es" ? "Fotografía pendiente de permiso" : "Photograph pending permission"}
                      </span>
                    </div>
                  )}
                  <div className="status-row">
                    <StatusPill>{t(locale, "curatorReviewed")}</StatusPill>
                  </div>
                  <h2>{record.displayName[locale]}</h2>
                  <p>{record.summary[locale]}</p>
                </div>
                <Link href={withLocale(`/profiles/${record.slug}`, locale)}>
                  {locale === "es" ? "Abrir perfil" : "Open profile"} →
                </Link>
              </article>
            ))}
          </div>
          {!records.length ? (
            <div className="card">
              <h2>{locale === "es" ? "Sin resultados publicados" : "No published results"}</h2>
              <p>{locale === "es" ? "Pruebe una búsqueda diferente." : "Try a different search."}</p>
            </div>
          ) : null}
        </div>
      </section>
    </PublicShell>
  );
}
