import Link from "next/link";
import styles from "./archive-home.module.css";
import type { Locale } from "@/lib/domain/types";
import { withLocale } from "@/lib/i18n";
import type { FeaturedRecord } from "@/lib/publication/featured-records";

interface HomeCopy {
  heroTitle: string;
  heroLead: string;
  heroAction: string;
  survivorsEyebrow: Record<string, string>;
  readStory: string;
  namesLabel: string;
  photographsLabel: string;
  recordsLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchAction: string;
  browseAll: (count: number | null) => string;
  photoAlt: string;
}

function copyFor(locale: Locale): HomeCopy {
  if (locale === "es") {
    return {
      heroTitle: "Cuatro generaciones sobrevivieron para hablar.",
      heroLead:
        "Este archivo preserva las voces, los rostros y los registros de las familias de la Shoá en San Antonio.",
      heroAction: "Conocer a los sobrevivientes",
      survivorsEyebrow: {
        "sam-cohen": "Testimonio grabado",
        "stephan-jalnos": "Compartido por un descendiente",
      },
      readStory: "Leer su historia",
      namesLabel: "Nombres en el registro",
      photographsLabel: "Fotografías familiares",
      recordsLabel: "Registros publicados",
      searchLabel: "Buscar en el archivo por nombre",
      searchPlaceholder: "Buscar un nombre…",
      searchAction: "Buscar",
      browseAll: (count) => (count ? `Ver los ${count} nombres` : "Ver todos los nombres"),
      photoAlt: "Cuatro generaciones de una familia sobreviviente, fotografiadas juntas",
    };
  }
  return {
    heroTitle: "Four generations survived to speak.",
    heroLead:
      "This archive preserves the voices, faces, and records of the survivor families of San Antonio.",
    heroAction: "Meet the survivors",
    survivorsEyebrow: {
      "sam-cohen": "Recorded testimony",
      "stephan-jalnos": "Shared by a descendant",
    },
    readStory: "Read their story",
    namesLabel: "Names in the registry",
    photographsLabel: "Family photographs",
    recordsLabel: "Published records",
    searchLabel: "Search the archive by name",
    searchPlaceholder: "Search for a name…",
    searchAction: "Search",
    browseAll: (count) => (count ? `Browse all ${count} names` : "Browse all names"),
    photoAlt: "Four generations of a survivor family, photographed together",
  };
}

export interface ArchiveCounts {
  names: number | null;
  photographs: number;
  records: number;
}

export function ArchiveHome({
  locale,
  featuredRecords,
  counts,
  signedIn = false,
}: {
  locale: Locale;
  featuredRecords: FeaturedRecord[];
  counts: ArchiveCounts;
  signedIn?: boolean;
}) {
  const content = copyFor(locale);
  void signedIn;

  return (
    <div className={styles.page}>
      {/* Viewport 1 — split hero. The photograph gets its own zone; no text
          ever sits on it. It is the one full-color image on the site. */}
      <section className={styles.hero} aria-labelledby="archive-introduction">
        <div className={styles.heroPanel}>
          <div className={styles.heroPanelInner}>
            <h1 id="archive-introduction">{content.heroTitle}</h1>
            <p>{content.heroLead}</p>
            <Link className={styles.heroAction} href={withLocale("/directory", locale)}>
              {content.heroAction}
            </Link>
          </div>
        </div>
        <div className={styles.heroPhoto}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/generation-to-generation-family.png" alt={content.photoAlt} />
        </div>
      </section>

      {/* Viewport 2 — the survivors as editorial rows. Whitespace is the card. */}
      {featuredRecords.map((record, index) => (
        <section
          key={record.slug}
          className={index % 2 ? styles.survivorRowTint : styles.survivorRow}
          aria-labelledby={`survivor-${record.slug}`}
        >
          <div className={index % 2 ? styles.rowInnerReversed : styles.rowInner}>
            <div className={`memorial-photo ${styles.rowPhoto}`} data-slug={record.slug}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={record.slug === "sam-cohen" ? "/sam-cohen-family.jpg" : "/generation-to-generation-family.png"}
                alt={record.name}
              />
            </div>
            <div className={styles.rowText}>
              <p className="eyebrow">{content.survivorsEyebrow[record.slug] ?? ""}</p>
              <h2 id={`survivor-${record.slug}`}>{record.name}</h2>
              <p className={styles.rowSummary}>{record.summary}</p>
              <p className={styles.rowCitation}>{record.citation}</p>
              <Link className={styles.rowLink} href={withLocale(`/profiles/${record.slug}`, locale)}>
                {content.readStory} →
              </Link>
            </div>
          </div>
        </section>
      ))}

      {/* Viewport 3 — the registry made real: scale, then a way in. */}
      <section className={styles.registryBand} aria-label={content.searchLabel}>
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
        <form className={styles.search} action={withLocale("/directory", locale).split("?")[0]} method="get" role="search">
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
          {content.browseAll(counts.names)} →
        </Link>
      </section>
    </div>
  );
}
