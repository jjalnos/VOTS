import Link from "next/link";
import styles from "./coming-soon.module.css";
import type { Locale } from "@/lib/domain/types";
import { t, withLocale } from "@/lib/i18n";
import type { FeaturedRecord } from "@/lib/publication/featured-records";

const copy = {
  en: {
    preview: "Private staging preview",
    previewNote: "Demonstration content only",
    demoLink: "Open Robin’s workspace demo",
    eyebrow: "Bilingual digital archive · Coming soon",
    headline: "So a voice is not lost between generations.",
    lead: "Shape testimony into a family record without separating a memory from the person who entrusted it to us.",
    learnMore: "How the archive is being built",
    signIn: "Family & staff sign in",
    trust: "Only permissioned, museum-reviewed material is made public.",
    collectionLabel: "A living record",
    collectionTitle: "From generation to generation.",
    collectionNote: "One testimony. Four generations. A record still growing.",
    imageCredit: "Family photograph supplied for this project preview",
    recordsEyebrow: "A first look at the archive",
    recordsTitle: "Begin with the source.",
    recordsLead: "Two concise demonstration records show how a public story can remain connected to the testimony and museum source that support it.",
    recordKinds: {
      "sam-cohen": "Recorded testimony",
      "stephan-jalnos": "A story shared by a descendant",
    },
    viewRecord: "View sourced record",
    viewSource: "Original source",
    processEyebrow: "A careful path to publication",
    processTitle: "Care is part of the archive.",
    processLead: "Every contribution moves through a documented, human review before it can become part of the public record.",
    steps: [
      {
        title: "Contribute privately",
        body: "Family material begins in an invited workspace, visible only to the people entrusted with its care.",
      },
      {
        title: "Review together",
        body: "Families and museum curators confirm names, rights, translation, sources, and context.",
      },
      {
        title: "Publish with permission",
        body: "Only explicitly approved, source-connected material enters the public archive.",
      },
    ],
    spacesEyebrow: "Behind the public archive",
    spacesTitle: "Built for people, not just records.",
    spacesLead: "Two connected private spaces help the museum and families shape testimony without losing consent, context, or source connections.",
    spaces: [
      {
        index: "01",
        title: "Source-led writing studio",
        body: "Shape stories from recorded testimony while keeping quotations, facts, translations, and review decisions connected.",
      },
      {
        index: "02",
        title: "Family & descendant network",
        body: "Connect generations while keeping consent, contact preferences, and family relationships clear.",
      },
    ],
    footerLine: "Memory deserves care.",
    collaboration: "A project of HMMSA, developed in collaboration with Clicksmith.",
  },
  es: {
    preview: "Vista previa privada",
    previewNote: "Solo contenido de demostración",
    demoLink: "Abrir la demostración de Robin",
    eyebrow: "Archivo digital bilingüe · Próximamente",
    headline: "Para que una voz no se pierda entre generaciones.",
    lead: "Damos forma al testimonio como registro familiar sin separar un recuerdo de la persona que nos lo confió.",
    learnMore: "Cómo se está creando el archivo",
    signIn: "Acceso para familias y personal",
    trust: "Solo se publica material autorizado y revisado por el museo.",
    collectionLabel: "Un registro vivo",
    collectionTitle: "De generación en generación.",
    collectionNote: "Un testimonio. Cuatro generaciones. Un registro que sigue creciendo.",
    imageCredit: "Fotografía familiar proporcionada para esta vista previa del proyecto",
    recordsEyebrow: "Una primera mirada al archivo",
    recordsTitle: "Comenzar con la fuente.",
    recordsLead: "Dos registros breves de demostración muestran cómo una historia pública puede permanecer vinculada al testimonio y a la fuente del museo que la respaldan.",
    recordKinds: {
      "sam-cohen": "Testimonio grabado",
      "stephan-jalnos": "Una historia compartida por un descendiente",
    },
    viewRecord: "Ver registro con fuentes",
    viewSource: "Fuente original",
    processEyebrow: "Un camino cuidadoso hacia la publicación",
    processTitle: "El cuidado forma parte del archivo.",
    processLead: "Cada contribución pasa por una revisión humana documentada antes de formar parte del registro público.",
    steps: [
      {
        title: "Contribuir en privado",
        body: "El material familiar comienza en un espacio por invitación, visible solo para las personas encargadas de cuidarlo.",
      },
      {
        title: "Revisar juntos",
        body: "Las familias y los curadores del museo confirman nombres, derechos, traducciones, fuentes y contexto.",
      },
      {
        title: "Publicar con permiso",
        body: "Solo el material expresamente aprobado y vinculado a sus fuentes entra en el archivo público.",
      },
    ],
    spacesEyebrow: "Detrás del archivo público",
    spacesTitle: "Creado para las personas, no solo para los registros.",
    spacesLead: "Dos espacios privados conectados ayudan al museo y a las familias a dar forma a los testimonios sin perder el consentimiento, el contexto ni las fuentes.",
    spaces: [
      {
        index: "01",
        title: "Estudio de escritura con fuentes",
        body: "Dé forma a historias basadas en testimonios grabados, manteniendo conectadas las citas, los datos, las traducciones y las decisiones de revisión.",
      },
      {
        index: "02",
        title: "Red de familias y descendientes",
        body: "Conecte generaciones y mantenga claros el consentimiento, las preferencias de contacto y los vínculos familiares.",
      },
    ],
    footerLine: "La memoria merece cuidado.",
    collaboration: "Un proyecto de HMMSA, desarrollado en colaboración con Clicksmith.",
  },
} satisfies Record<Locale, Record<string, unknown>>;

export function ComingSoon({
  locale,
  featuredRecords,
}: {
  locale: Locale;
  featuredRecords: FeaturedRecord[];
}) {
  const content = copy[locale];

  return (
    <div className={styles.page} lang={locale}>
      <div className={styles.previewBar}>
        <span className={styles.previewStatus}>
          <span className={styles.previewDot} aria-hidden="true" />
          {content.preview}
        </span>
        <span>{content.previewNote}</span>
        <Link href="/demo/robin">
          {content.demoLink} <span aria-hidden="true">→</span>
        </Link>
      </div>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">HM</span>
            <span className={styles.brandText}>
              <span className={styles.brandName}>{t(locale, "institutionName")}</span>
              <span className={styles.brandSubtitle}>{t(locale, "archiveName")}</span>
            </span>
          </div>
          <div className={styles.headerActions}>
            <nav className={styles.languages} aria-label={t(locale, "languageLabel")}>
              <Link
                href="/?lang=en"
                hrefLang="en"
                lang="en"
                aria-label="English"
                aria-current={locale === "en" ? "page" : undefined}
              >
                EN
              </Link>
              <Link
                href="/?lang=es"
                hrefLang="es"
                lang="es"
                aria-label="Español"
                aria-current={locale === "es" ? "page" : undefined}
              >
                ES
              </Link>
            </nav>
            <Link className={styles.headerSignIn} href={withLocale("/login", locale)}>
              {content.signIn}
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="archive-introduction">
          <div className={styles.heroInner}>
            <div className={styles.introduction}>
              <p className={styles.eyebrow}>{content.eyebrow}</p>
              <h1 id="archive-introduction">{content.headline}</h1>
              <p className={styles.lead}>{content.lead}</p>
              <div className={styles.actions}>
                <a className={styles.primaryAction} href="#archive-process">
                  {content.learnMore}
                  <span aria-hidden="true">↓</span>
                </a>
                <Link className={styles.secondaryAction} href={withLocale("/login", locale)}>
                  {content.signIn}
                </Link>
              </div>
              <p className={styles.trustLine}>
                <span className={styles.trustMark} aria-hidden="true">✓</span>
                {content.trust}
              </p>
            </div>

            <aside className={styles.collection} aria-label={content.collectionLabel}>
              <div className={styles.collectionContent}>
                <p lang="he" dir="rtl">לְדוֹר וָדוֹר</p>
                <h2>{content.collectionTitle}</h2>
                <small>{content.collectionNote}</small>
              </div>
              <span className={styles.imageCredit}>{content.imageCredit}</span>
            </aside>
          </div>
        </section>

        {featuredRecords.length ? (
          <section className={styles.records} aria-labelledby="featured-records-title">
            <div className={styles.sectionInner}>
              <div className={styles.recordsHeader}>
                <div>
                  <p className={styles.eyebrow}>{content.recordsEyebrow}</p>
                  <h2 id="featured-records-title">{content.recordsTitle}</h2>
                </div>
                <p>{content.recordsLead}</p>
              </div>
              <div className={styles.recordsGrid}>
                {featuredRecords.map((record) => (
                  <article className={styles.recordPreview} key={record.slug}>
                    <p className={styles.recordKind}>{content.recordKinds[record.slug]}</p>
                    <h3>{record.name}</h3>
                    <p className={styles.recordSummary}>{record.summary}</p>
                    <p className={styles.recordCitation}>{record.citation}</p>
                    <div className={styles.recordLinks}>
                      <Link href={withLocale(`/profiles/${record.slug}`, locale)}>
                        {content.viewRecord} <span aria-hidden="true">→</span>
                      </Link>
                      <a href={record.sourceUrl} target="_blank" rel="noreferrer">
                        {content.viewSource} <span aria-hidden="true">↗</span>
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section id="archive-process" className={styles.process} aria-labelledby="process-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>{content.processEyebrow}</p>
                <h2 id="process-title">{content.processTitle}</h2>
              </div>
              <p>{content.processLead}</p>
            </div>
            <div className={styles.processGrid}>
              {content.steps.map((step, index) => (
                <article className={styles.processCard} key={step.title}>
                  <span className={styles.cardIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.spaces} aria-labelledby="spaces-title">
          <div className={styles.sectionInner}>
            <div className={styles.spacesIntro}>
              <p className={styles.eyebrow}>{content.spacesEyebrow}</p>
              <h2 id="spaces-title">{content.spacesTitle}</h2>
              <p>{content.spacesLead}</p>
            </div>
            <div className={styles.spacesGrid}>
              {content.spaces.map((space) => (
                <article className={styles.spaceCard} key={space.title}>
                  <span>{space.index}</span>
                  <div>
                    <h3>{space.title}</h3>
                    <p>{space.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <strong>{content.footerLine}</strong>
          <span>{content.collaboration}</span>
        </div>
      </footer>
    </div>
  );
}
