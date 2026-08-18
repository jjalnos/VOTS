import Link from "next/link";
import styles from "./archive-home.module.css";
import type { Locale } from "@/lib/domain/types";
import { withLocale } from "@/lib/i18n";
import type { FeaturedRecord } from "@/lib/publication/featured-records";

interface HomeCopy {
  eyebrow: string;
  headline: string;
  lead: string;
  browse: string;
  signIn: string;
  openWorkspace: string;
  trust: string;
  collectionLabel: string;
  collectionTitle: string;
  collectionNote: string;
  imageCredit: string;
  recordsEyebrow: string;
  recordsTitle: string;
  recordsLead: string;
  recordKind: (slug: string) => string;
  viewRecord: string;
  viewSource: string;
  processEyebrow: string;
  processTitle: string;
  processLead: string;
  steps: Array<{ title: string; body: string }>;
}

const RECORD_KINDS: Record<Locale, Record<string, string>> = {
  en: {
    "sam-cohen": "Recorded testimony",
    "stephan-jalnos": "A story shared by a descendant",
  },
  es: {
    "sam-cohen": "Testimonio grabado",
    "stephan-jalnos": "Una historia compartida por un descendiente",
  },
};

function copyFor(locale: Locale): HomeCopy {
  if (locale === "es") {
    return {
      eyebrow: "Archivo digital bilingüe",
      headline: "Para que una voz no se pierda entre generaciones.",
      lead: "Damos forma al testimonio como registro familiar sin separar un recuerdo de la persona que nos lo confió.",
      browse: "Conocer a los sobrevivientes",
      signIn: "Acceso para familias y personal",
      openWorkspace: "Abrir el espacio privado",
      trust: "Solo se publica material autorizado y revisado por el museo.",
      collectionLabel: "Un registro vivo",
      collectionTitle: "De generación en generación.",
      collectionNote: "Un testimonio. Cuatro generaciones. Un registro que sigue creciendo.",
      imageCredit: "Fotografía familiar, cuatro generaciones",
      recordsEyebrow: "Del archivo",
      recordsTitle: "Comenzar con la fuente.",
      recordsLead:
        "Cada historia publicada permanece vinculada al testimonio y a la fuente del museo que la respaldan.",
      recordKind: (slug) => RECORD_KINDS.es[slug] ?? "Registro del archivo",
      viewRecord: "Ver registro con fuentes",
      viewSource: "Fuente original",
      processEyebrow: "Un camino cuidadoso hacia la publicación",
      processTitle: "El cuidado forma parte del archivo.",
      processLead:
        "Cada contribución pasa por una revisión humana documentada antes de formar parte del registro público.",
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
    };
  }
  return {
    eyebrow: "Bilingual digital archive",
    headline: "So a voice is not lost between generations.",
    lead: "Shape testimony into a family record without separating a memory from the person who entrusted it to us.",
    browse: "Meet the survivors",
    signIn: "Family & staff sign in",
    openWorkspace: "Open the private workspace",
    trust: "Only permissioned, museum-reviewed material is made public.",
    collectionLabel: "A living record",
    collectionTitle: "From generation to generation.",
    collectionNote: "One testimony. Four generations. A record still growing.",
    imageCredit: "Family photograph, four generations",
    recordsEyebrow: "From the archive",
    recordsTitle: "Begin with the source.",
    recordsLead:
      "Every published story stays connected to the testimony and museum source that support it.",
    recordKind: (slug) => RECORD_KINDS.en[slug] ?? "Archive record",
    viewRecord: "View sourced record",
    viewSource: "Original source",
    processEyebrow: "A careful path to publication",
    processTitle: "Care is part of the archive.",
    processLead:
      "Every contribution moves through a documented, human review before it can become part of the public record.",
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
  };
}

export function ArchiveHome({
  locale,
  featuredRecords,
  signedIn = false,
}: {
  locale: Locale;
  featuredRecords: FeaturedRecord[];
  signedIn?: boolean;
}) {
  const content = copyFor(locale);

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="archive-introduction">
        <div className={styles.heroInner}>
          <div className={styles.introduction}>
            <p className={styles.eyebrow}>{content.eyebrow}</p>
            <h1 id="archive-introduction">{content.headline}</h1>
            <p className={styles.lead}>{content.lead}</p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href={withLocale("/directory", locale)}>
                {content.browse}
                <span aria-hidden="true">→</span>
              </Link>
              <Link
                className={styles.secondaryAction}
                href={withLocale(signedIn ? "/curator/survivors" : "/login", locale)}
              >
                {signedIn ? content.openWorkspace : content.signIn}
              </Link>
            </div>
            <p className={styles.trustLine}>
              <span className={styles.trustMark} aria-hidden="true">
                ✓
              </span>
              {content.trust}
            </p>
          </div>

          <aside className={styles.collection} aria-label={content.collectionLabel}>
            <div className={styles.collectionContent}>
              <p lang="he" dir="rtl">
                לְדוֹר וָדוֹר
              </p>
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
                  <p className={styles.recordKind}>{content.recordKind(record.slug)}</p>
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
    </div>
  );
}
