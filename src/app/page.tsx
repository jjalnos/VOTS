import Link from "next/link";
import { ComingSoon } from "@/components/coming-soon";
import { PublicShell } from "@/components/public-shell";
import { StatusPill } from "@/components/status-pill";
import { getPublicCatalog } from "@/lib/data/public-catalog";
import { localeFrom, t, withLocale } from "@/lib/i18n";

export default async function Home({ searchParams }: PageProps<"/">) {
  const locale = localeFrom((await searchParams).lang);
  if (process.env.NEXT_PUBLIC_COMING_SOON !== "false") {
    return <ComingSoon locale={locale} />;
  }
  const catalog = getPublicCatalog(locale);
  const profile = catalog.survivors[0];

  return (
    <PublicShell locale={locale} path="/">
      <section className="hero">
        <div className="content-wrap hero-inner">
          <div>
            <p className="eyebrow">{locale === "es" ? "Memoria · Testimonio · Fuente" : "Memory · Testimony · Source"}</p>
            <h1>{locale === "es" ? "Las voces permanecen." : "The voices remain."}</h1>
            <p className="hero-lead">
              {locale === "es"
                ? "Un archivo bilingüe, cuidadoso y con fuentes para historias aprobadas por el museo y sus familias."
                : "A careful, bilingual, source-led archive for stories approved by the museum and its families."}
            </p>
            <div className="button-row">
              <Link className="button light" href={withLocale("/directory", locale)}>
                {locale === "es" ? "Explorar el archivo" : "Browse the archive"}
              </Link>
              <Link className="button ghost-light" href={withLocale("/chat", locale)}>
                {t(locale, "navChat")}
              </Link>
            </div>
          </div>
          <aside className="hero-note" aria-label={locale === "es" ? "Política pública" : "Public access policy"}>
            <p className="eyebrow">{locale === "es" ? "Promesa pública" : "Public promise"}</p>
            <p>{t(locale, "onlyPublished")}</p>
            <p>{t(locale, "sourceRequired")}</p>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="content-wrap">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{locale === "es" ? "El archivo" : "The archive"}</p>
              <h2>{locale === "es" ? "Preservado con cuidado humano" : "Preserved with human care"}</h2>
            </div>
            <p>
              {locale === "es"
                ? "Las sugerencias digitales nunca se publican por sí solas. Curadores revisan identidad, derechos, traducción, fuentes y contexto."
                : "Digital suggestions never publish themselves. Curators review identity, rights, translation, sources, and context."}
            </p>
          </div>
          <div className="grid-3">
            {[
              [locale === "es" ? "Privado al cargar" : "Private on upload", locale === "es" ? "Cada contribución comienza visible solo para el grupo familiar invitado y el equipo curatorial." : "Every contribution begins visible only to the invited family group and curatorial team."],
              [locale === "es" ? "Revisión curatorial" : "Curatorial review", locale === "es" ? "Las sugerencias de extracción, investigación y traducción requieren una decisión humana documentada." : "Extraction, research, and translation suggestions require a documented human decision."],
              [locale === "es" ? "Publicación con fuentes" : "Sourced publication", locale === "es" ? "Los perfiles, relatos y respuestas públicas se limitan a material aprobado y citado." : "Public profiles, stories, and answers are limited to approved, cited material."],
            ].map(([title, copy]) => (
              <article className="card" key={title}>
                <div className="card-rule" />
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-paper">
        <div className="content-wrap">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{locale === "es" ? "Vista previa publicada" : "Published preview"}</p>
              <h2>{locale === "es" ? "Conozca el formato" : "Meet the format"}</h2>
            </div>
            <p>{t(locale, "demoNotice")}</p>
          </div>
          {profile ? (
            <div className="record-grid">
              <article className="card record-card">
                <div>
                  <div className="record-placeholder" aria-hidden="true">01</div>
                  <div className="status-row">
                    <StatusPill>{t(locale, "curatorReviewed")}</StatusPill>
                    <StatusPill tone="pending">Demo</StatusPill>
                  </div>
                  <h3>{profile.displayName[locale]}</h3>
                  <p>{profile.summary[locale]}</p>
                </div>
                <Link href={withLocale(`/profiles/${profile.slug}`, locale)}>
                  {locale === "es" ? "Ver perfil y fuentes" : "View profile and sources"} →
                </Link>
              </article>
              <article className="card">
                <p className="eyebrow">{locale === "es" ? "Historias" : "Stories"}</p>
                <h3>{catalog.stories[0]?.title[locale]}</h3>
                <p>{catalog.stories[0]?.dek[locale]}</p>
                <Link href={withLocale("/stories", locale)}>{t(locale, "navStories")} →</Link>
              </article>
              <article className="card">
                <p className="eyebrow">{locale === "es" ? "Pregunte con citas" : "Ask with citations"}</p>
                <h3>{locale === "es" ? "Una guía, no una autoridad" : "A guide, not an authority"}</h3>
                <p>
                  {locale === "es"
                    ? "El chat se niega a inventar una respuesta cuando el archivo publicado no contiene respaldo."
                    : "The chat declines to invent an answer when the published archive contains no support."}
                </p>
                <Link href={withLocale("/chat", locale)}>{t(locale, "navChat")} →</Link>
              </article>
            </div>
          ) : null}
        </div>
      </section>

      <section className="section compact">
        <div className="content-wrap metric-grid" aria-label={locale === "es" ? "Estado de demostración" : "Demonstration status"}>
          <div className="metric"><strong>{catalog.survivors.length}</strong>{locale === "es" ? "perfil de demostración publicado" : "published demonstration profile"}</div>
          <div className="metric"><strong>{catalog.sources.length}</strong>{locale === "es" ? "fuente aprobada" : "approved source"}</div>
          <div className="metric"><strong>0</strong>{locale === "es" ? "cargas privadas expuestas" : "private uploads exposed"}</div>
        </div>
      </section>
    </PublicShell>
  );
}
