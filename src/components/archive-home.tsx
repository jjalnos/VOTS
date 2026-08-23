import Link from "next/link";
import styles from "./archive-home.module.css";
import type { Locale } from "@/lib/domain/types";
import { withLocale } from "@/lib/i18n";
import { testimonyFor, testimonyVerb } from "@/lib/publication/testimony";
import type { FeaturedRecord, FeaturedRecordSlug } from "@/lib/publication/featured-records";

const DONATE_URL = "https://portal.clicksmith.net/donate/voices-of-the-shoah";
const SUPPORT_EMAIL = "support@clicksmith.net";
const SHOW_FUNDING = false;
const HOME_SURVIVOR_LIMIT = 3;

interface RoadmapStop {
  title: string;
  detail: string;
  status: "done" | "now" | "ahead";
}

interface HomeCopy {
  heroEyebrow: string;
  heroTitle: string;
  heroLead: string;
  heroAction: string;
  heroSecondary: string;
  galleryAlt: string;
  galleryCaption: string;
  survivorsEyebrow: Record<FeaturedRecordSlug, string>;
  photoAlts: Record<FeaturedRecordSlug, string | null>;
  photoCredit: Record<FeaturedRecordSlug, string | null>;
  platePending: string;
  rowTestimony: string;
  readStory: string;
  survivorDirectoryAction: string;
  missionEyebrow: string;
  missionTitle: string;
  missionBody: string[];
  armbandAlt: string;
  armbandCaption: string;
  armbandCaptionLinkLabel: string;
  roadmapEyebrow: string;
  roadmapTitle: string;
  roadmapStops: RoadmapStop[];
  statusLabels: Record<RoadmapStop["status"], string>;
  fundingEyebrow: string;
  fundingTitle: string;
  fundingBody: string;
  fundingAction: string;
  fundingDisclosure: string;
  fundingContact: string;
  registryHeading: string;
  registryNote: string;
  namesLabel: string;
  photographsLabel: string;
  recordsLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchAction: string;
  browseAll: string;
}

function copyFor(locale: Locale, names: number | null): HomeCopy {
  if (locale === "es") {
    const nombres = names ? `${names} nombres` : "más de trescientos nombres";
    return {
      heroEyebrow: "Museo Conmemorativo del Holocausto de San Antonio",
      heroTitle: "Sobrevivieron. Cuatro generaciones hablan.",
      heroLead:
        "Este archivo preserva las voces, los rostros y los registros de las familias de la Shoá en San Antonio.",
      heroAction: "Conocer a los sobrevivientes",
      heroSecondary: "Conocer el proyecto",
      galleryAlt:
        "Las galerías del Museo Conmemorativo del Holocausto de San Antonio, con sus paneles de exposición en perspectiva",
      galleryCaption: "Las galerías del museo, San Antonio, Texas",
      survivorsEyebrow: {
        "sam-cohen": "Testimonio grabado",
        "susanne-jalnos": "Relatado por su hijo",
        "stephan-jalnos": "Compartido por un descendiente",
        "rose-williams": "Autora de sus memorias",
      },
      photoAlts: {
        "sam-cohen":
          "Retrato de Sam Cohen de joven, de la colección del Museo Conmemorativo del Holocausto de San Antonio",
        "susanne-jalnos":
          "Retrato de Susanne Jalnos, publicado por el Museo Conmemorativo del Holocausto de San Antonio para su serie de conferencias de sobrevivientes",
        "stephan-jalnos": "Fotografía de la familia Jalnos: una pareja joven con su bebé",
        "rose-williams": null,
      },
      photoCredit: {
        "sam-cohen": "Fotografía: Museo Conmemorativo del Holocausto de San Antonio",
        "susanne-jalnos": "Fotografía: detalle de un anuncio del Museo Conmemorativo del Holocausto de San Antonio",
        "stephan-jalnos": "Fotografía: cortesía de la familia Jalnos",
        "rose-williams": null,
      },
      platePending: "Se busca una fotografía",
      rowTestimony: "En sus propias palabras",
      readStory: "Leer su historia",
      survivorDirectoryAction: "Ver a todos los sobrevivientes",
      missionEyebrow: "El proyecto",
      missionTitle: "Cada sobreviviente deja documentos, fotografías y una voz. Este es el lugar donde se guardan.",
      missionBody: [
        "Voices of the Shoah es un comité de voluntarios del Museo Conmemorativo del Holocausto de San Antonio. Estamos construyendo el archivo digital permanente de la comunidad de sobrevivientes del museo: cada testimonio, cada documento y cada fotografía, organizados por sobreviviente y por familia.",
        `La curadora del museo ya trabaja en este archivo. El registro reúne ${nombres} a lo largo de cuatro generaciones, y los primeros perfiles publicados muestran lo que será cada historia: verificada y citada.`,
      ],
      armbandAlt:
        "Brazalete con la estrella de David sobre tablas de madera desgastada, de la colección del museo",
      armbandCaption: "Brazalete con la estrella de David — colección del Museo Conmemorativo del Holocausto de San Antonio · ",
      armbandCaptionLinkLabel: "hmmsa.org",
      roadmapEyebrow: "Hacia dónde vamos",
      roadmapTitle: "Un archivo se construye por etapas.",
      roadmapStops: [
        {
          title: "El registro de sobrevivientes",
          detail: `${nombres.charAt(0).toUpperCase() + nombres.slice(1)}, organizados por familia y generación, al cuidado de la curadora del museo.`,
          status: "done",
        },
        {
          title: "El repositorio de documentos",
          detail: "Cartas, fotografías, grabaciones y objetos, digitalizados y vinculados a la persona a la que pertenecen.",
          status: "now",
        },
        {
          title: "El asistente de investigación",
          detail: "La meta: preguntas en lenguaje natural sobre toda la colección, donde cada respuesta remite a su fuente.",
          status: "ahead",
        },
        {
          title: "El archivo público",
          detail: "Historias que cada familia revisará y aprobará antes de abrirse a estudiantes e investigadores.",
          status: "ahead",
        },
        {
          title: "Un quiosco en el museo",
          detail: "Las voces del archivo, presentes en las salas adonde San Antonio acude a recordar.",
          status: "ahead",
        },
        {
          title: "El sitio web público del museo",
          detail: "Por definir junto con el museo: este archivo puede sumarse a hmmsa.org, o incluso convertirse en el sitio del museo, conservando todo lo ya publicado.",
          status: "ahead",
        },
      ],
      statusLabels: { done: "En línea", now: "En construcción", ahead: "Previsto" },
      fundingEyebrow: "Apoye este trabajo",
      fundingTitle: "Este archivo busca financiamiento.",
      fundingBody:
        "Voices of the Shoah se construye con trabajo voluntario y donaciones. Su aporte financia el desarrollo del archivo: el registro, el repositorio de documentos y las herramientas de investigación.",
      fundingAction: "Apoyar el archivo",
      fundingDisclosure:
        "Las donaciones financian el trabajo de desarrollo del comité y las procesa Clicksmith, el desarrollador web del proyecto. No son donativos deducibles de impuestos al Museo Conmemorativo del Holocausto de San Antonio.",
      fundingContact: `Preguntas y propuestas: ${SUPPORT_EMAIL}`,
      registryHeading: "El registro",
      registryNote: "El registro completo se conserva de forma privada, al cuidado de la curadora del museo.",
      namesLabel: "Nombres en el registro",
      photographsLabel: "Fotografías publicadas",
      recordsLabel: "Registros publicados",
      searchLabel: "Buscar por nombre en el archivo publicado",
      searchPlaceholder: "Buscar un nombre…",
      searchAction: "Buscar",
      browseAll: "Ver los registros publicados",
    };
  }
  const nameCount = names ? `${names} names` : "more than three hundred names";
  return {
    heroEyebrow: "The Holocaust Memorial Museum of San Antonio",
    heroTitle: "They survived. Four generations speak.",
    heroLead:
      "This archive preserves the voices, faces, and records of the survivor families of San Antonio.",
    heroAction: "Meet the survivors",
    heroSecondary: "About the project",
    galleryAlt:
      "The galleries of the Holocaust Memorial Museum of San Antonio, exhibit panels receding in perspective",
    galleryCaption: "The museum galleries, San Antonio, Texas",
    survivorsEyebrow: {
      "sam-cohen": "Recorded testimony",
      "susanne-jalnos": "Shared by her son",
      "stephan-jalnos": "Shared by a descendant",
      "rose-williams": "Author of her own memoir",
    },
    photoAlts: {
      "sam-cohen":
        "Portrait of Sam Cohen as a young man, from the collection of the Holocaust Memorial Museum of San Antonio",
      "susanne-jalnos":
        "Portrait of Susanne Jalnos, published by the Holocaust Memorial Museum of San Antonio for its Survivor Speakers Series announcement",
      "stephan-jalnos": "A Jalnos family photograph: a young couple with their baby",
      "rose-williams": null,
    },
    photoCredit: {
      "sam-cohen": "Photograph: Holocaust Memorial Museum of San Antonio",
      "susanne-jalnos": "Photograph: detail from a Holocaust Memorial Museum of San Antonio announcement",
      "stephan-jalnos": "Photograph: courtesy of the Jalnos family",
      "rose-williams": null,
    },
    platePending: "A photograph is being sought",
    rowTestimony: "In their own words",
    readStory: "Read their story",
    survivorDirectoryAction: "View all survivors",
    missionEyebrow: "The project",
    missionTitle: "Every survivor leaves documents, photographs, and a voice. This is where they are kept.",
    missionBody: [
      "Voices of the Shoah is a volunteer committee of the Holocaust Memorial Museum of San Antonio. We are building the permanent digital archive of the museum's survivor community — every testimony, document, and photograph, organized by survivor and by family.",
      `The museum's curator already works in this archive. The registry holds ${nameCount} across four generations, and the first published profiles show what every story will become: verified and cited.`,
    ],
    armbandAlt:
      "Star of David armband resting on weathered wooden boards, from the museum's collection",
    armbandCaption: "Star of David armband — collection of the Holocaust Memorial Museum of San Antonio · ",
    armbandCaptionLinkLabel: "hmmsa.org",
    roadmapEyebrow: "Where this is going",
    roadmapTitle: "An archive is built in stages.",
    roadmapStops: [
      {
        title: "The survivor registry",
        detail: `${nameCount.charAt(0).toUpperCase() + nameCount.slice(1)}, organized by family and generation, in the care of the museum's curator.`,
        status: "done",
      },
      {
        title: "The document repository",
        detail: "Letters, photographs, recordings, and artifacts, digitized and joined to the person they belong to.",
        status: "now",
      },
      {
        title: "The research assistant",
        detail: "The aim: plain-language questions across the whole collection, with every answer traced back to its source.",
        status: "ahead",
      },
      {
        title: "The public archive",
        detail: "Stories to be reviewed and approved by each family before they open to students and researchers.",
        status: "ahead",
      },
      {
        title: "A kiosk in the museum",
        detail: "The archive's voices, present in the rooms where San Antonio comes to remember.",
        status: "ahead",
      },
      {
        title: "The museum's public website",
        detail: "To be shaped with the museum: this archive can join hmmsa.org, or even become the museum's website — with everything already published carried over.",
        status: "ahead",
      },
    ],
    statusLabels: { done: "Live today", now: "In progress", ahead: "Planned" },
    fundingEyebrow: "Support this work",
    fundingTitle: "This archive is looking for funding.",
    fundingBody:
      "Voices of the Shoah is built by volunteers and funded by donations. Your support pays for the development of the archive itself — the registry, the document repository, and the research tools.",
    fundingAction: "Support the archive",
    fundingDisclosure:
      "Donations fund the committee's development work and are processed by Clicksmith, the project's web developer. They are not tax-deductible gifts to the Holocaust Memorial Museum of San Antonio.",
    fundingContact: `Questions and proposals: ${SUPPORT_EMAIL}`,
    registryHeading: "The registry",
    registryNote: "The full registry is held privately, in the care of the museum's curator.",
    namesLabel: "Names in the registry",
    photographsLabel: "Photographs published",
    recordsLabel: "Published records",
    searchLabel: "Search the published archive by name",
    searchPlaceholder: "Search for a name…",
    searchAction: "Search",
    browseAll: "Browse the published records",
  };
}

export interface ArchiveCounts {
  names: number | null;
  photographs: number;
  records: number;
}

/* Typed by slug so adding a featured survivor fails the build until a real
   portrait is supplied. There is deliberately no fallback image: showing one
   family's photograph under another survivor's name is the one mistake this
   page must make impossible. */
const ROW_PHOTOS: Record<FeaturedRecordSlug, string | null> = {
  "sam-cohen": "/sam-cohen-portrait.jpg",
  "susanne-jalnos": "/susanne-jalnos-portrait.jpg",
  "stephan-jalnos": "/generation-to-generation-family.png",
  // The museum holds no photograph of Rose Williams at a size worth
  // publishing. An archival plate says so rather than borrowing one.
  "rose-williams": null,
};

/** Initials for the plate that stands in for an absent photograph. */
function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 3)
    .join("");
}

const STATUS_CLASS: Record<RoadmapStop["status"], string> = {
  done: styles.done,
  now: styles.now,
  ahead: styles.ahead,
};

export function ArchiveHome({
  locale,
  featuredRecords,
  counts,
}: {
  locale: Locale;
  featuredRecords: FeaturedRecord[];
  counts: ArchiveCounts;
}) {
  const content = copyFor(locale, counts.names);

  return (
    <div className={styles.page}>
      {/* Movement 1 — the overture. Type alone on paper, at full scale, then
          the museum's own gallery edge to edge beneath it. No text ever sits
          on a photograph. */}
      <section className={styles.hero} aria-labelledby="archive-introduction">
        <div className={styles.heroInner}>
          <p className={styles.heroEyebrow}>{content.heroEyebrow}</p>
          <h1 id="archive-introduction">{content.heroTitle}</h1>
          <p className={styles.heroLead}>{content.heroLead}</p>
          <div className={styles.heroActions}>
            <Link className={styles.heroAction} href={withLocale("/directory", locale)}>
              {content.heroAction}
            </Link>
            <a className={styles.heroSecondary} href="#mission-title">
              {content.heroSecondary}
            </a>
          </div>
        </div>
      </section>
      <figure className={styles.heroPlate}>
        <div className="memorial-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hmmsa-exhibit-hall.jpg" alt={content.galleryAlt} />
        </div>
        <figcaption>{content.galleryCaption}</figcaption>
      </figure>

      {/* Movement 2 — the survivors as editorial rows. Whitespace is the card. */}
      {featuredRecords.slice(0, HOME_SURVIVOR_LIMIT).map((record, index) => (
        <section
          key={record.slug}
          className={index % 2 ? styles.survivorRowTint : styles.survivorRow}
          aria-labelledby={`survivor-${record.slug}`}
        >
          <div className={index % 2 ? styles.rowInnerReversed : styles.rowInner}>
            {ROW_PHOTOS[record.slug] ? (
              <div className={`memorial-photo ${styles.rowPhoto}`} data-slug={record.slug}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ROW_PHOTOS[record.slug]!}
                  alt={content.photoAlts[record.slug] ?? record.name}
                />
              </div>
            ) : (
              <div className={styles.rowPlate} data-slug={record.slug}>
                <span className={styles.plateMonogram} aria-hidden="true">
                  {monogram(record.name)}
                </span>
                <span className={styles.plateNote}>{content.platePending}</span>
              </div>
            )}
            <div className={styles.rowText}>
              <p className="eyebrow">{content.survivorsEyebrow[record.slug]}</p>
              <h2 id={`survivor-${record.slug}`}>{record.name}</h2>
              <p className={styles.rowSummary}>{record.summary}</p>
              <p className={styles.rowCitation}>
                {record.citation}
                {content.photoCredit[record.slug] ? (
                  <>
                    <br />
                    {content.photoCredit[record.slug]}
                  </>
                ) : null}
              </p>
              {testimonyFor(record.slug).length ? (
                <div className={styles.rowTestimony}>
                  <p className="eyebrow">{content.rowTestimony}</p>
                  <ul className="testimony-list">
                    {testimonyFor(record.slug).map((entry) => (
                      <li key={entry.url + entry.kind}>
                        <a href={entry.url} rel="noreferrer">
                          <span className="testimony-verb">{testimonyVerb(entry.kind, locale)}</span>
                          {entry.label[locale]}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <Link className={styles.rowLink} href={withLocale(`/profiles/${record.slug}`, locale)}>
                {content.readStory} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>
      ))}

      {/* Movement 2b — the complete catalog stays on the survivor directory. */}
      <div className={styles.survivorDirectoryAction}>
        <Link
          className={styles.survivorDirectoryLink}
          href={withLocale("/directory", locale)}
        >
          {content.survivorDirectoryAction} <span aria-hidden="true">→</span>
        </Link>
      </div>

      {/* Movement 3 — why this exists. Museum wall text, not marketing. */}
      <section className={styles.mission} aria-labelledby="mission-title">
        <div className={styles.missionInner}>
          <p className="eyebrow">{content.missionEyebrow}</p>
          <h2 id="mission-title">{content.missionTitle}</h2>
          <div className={styles.missionBody}>
            {content.missionBody.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      {/* Movement 4 — an artifact from the museum's collection, shown whole,
          under the same memorial treatment as every photograph of the era. */}
      <figure className={styles.artifact}>
        <div className="memorial-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hmmsa-armband.jpg" alt={content.armbandAlt} />
        </div>
        <figcaption>
          {content.armbandCaption}
          <a href="https://www.hmmsa.org">{content.armbandCaptionLinkLabel}</a>
        </figcaption>
      </figure>

      {/* Movement 5 — the road ahead, told as intention, staged honestly. */}
      <section className={styles.roadmap} aria-labelledby="roadmap-title">
        <div className={styles.roadmapInner}>
          <p className="eyebrow">{content.roadmapEyebrow}</p>
          <h2 id="roadmap-title">{content.roadmapTitle}</h2>
          {/* role="list" restores list semantics that list-style: none strips
              in Safari/VoiceOver — the order is the point of this section. */}
          <ol className={styles.roadmapList} role="list">
            {content.roadmapStops.map((stop, index) => (
              <li key={stop.title} className={STATUS_CLASS[stop.status]}>
                <span className={styles.roadmapNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <p className={styles.roadmapStatus}>{content.statusLabels[stop.status]}</p>
                  <h3>{stop.title}</h3>
                  <p className={styles.roadmapDetail}>{stop.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {SHOW_FUNDING ? (
        /* Movement 6 — the ask, plainly, with the recipient named. */
        <section className={styles.funding} aria-labelledby="funding-title">
          <div className={styles.fundingInner}>
            <p className={styles.fundingEyebrow}>{content.fundingEyebrow}</p>
            <h2 id="funding-title">{content.fundingTitle}</h2>
            <p className={styles.fundingBody}>{content.fundingBody}</p>
            <a className={styles.fundingAction} href={DONATE_URL}>
              {content.fundingAction}
            </a>
            <p className={styles.fundingDisclosure}>{content.fundingDisclosure}</p>
            <p className={styles.fundingContact}>
              <a href={`mailto:${SUPPORT_EMAIL}`}>{content.fundingContact}</a>
            </p>
          </div>
        </section>
      ) : null}

      {/* Movement 7 — the registry made real: scale, then a way in. */}
      <section className={styles.registryBand} aria-labelledby="registry-heading">
        <h2 className="sr-only" id="registry-heading">
          {content.registryHeading}
        </h2>
        <div className={styles.counters}>
          {counts.names ? (
            <div>
              <strong>{counts.names}</strong>
              <span>{content.namesLabel}</span>
            </div>
          ) : null}
          <div>
            <strong>{counts.photographs}</strong>
            <span>{content.photographsLabel}</span>
          </div>
          <div>
            <strong>{counts.records}</strong>
            <span>{content.recordsLabel}</span>
          </div>
        </div>
        <p className={styles.registryNote}>{content.registryNote}</p>
        {/* GET submits drop the action URL's query string, so the locale rides
            in the hidden input — the action stays the bare path. */}
        <form className={styles.search} action="/directory" method="get" role="search">
          <input type="hidden" name="lang" value={locale} />
          <label className="sr-only" htmlFor="home-search">
            {content.searchLabel}
          </label>
          <input
            id="home-search"
            name="q"
            type="search"
            placeholder={content.searchPlaceholder}
            autoComplete="off"
          />
          <button type="submit">{content.searchAction}</button>
        </form>
        <Link className={styles.browseAll} href={withLocale("/directory", locale)}>
          {content.browseAll} <span aria-hidden="true">→</span>
        </Link>
      </section>
    </div>
  );
}
