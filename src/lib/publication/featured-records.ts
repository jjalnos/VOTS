import type { Locale, PublicCatalog } from "@/lib/domain/types";

export const FEATURED_RECORD_SLUGS = ["sam-cohen", "susanne-jalnos", "stephan-jalnos"] as const;

export type FeaturedRecordSlug = (typeof FEATURED_RECORD_SLUGS)[number];

export interface FeaturedRecord {
  slug: FeaturedRecordSlug;
  name: string;
  summary: string;
  citation: string;
  sourceTitle: string;
  sourceUrl: string;
}

export function selectFeaturedRecords(
  catalog: PublicCatalog,
  locale: Locale,
): FeaturedRecord[] {
  return FEATURED_RECORD_SLUGS.flatMap((slug) => {
    const survivor = catalog.survivors.find((record) => record.slug === slug);
    if (!survivor) return [];

    const release = catalog.releases.find(
      (candidate) =>
        candidate.entityType === "survivor" &&
        candidate.entityId === survivor.id &&
        candidate.locale === locale &&
        candidate.status === "published" &&
        Boolean(candidate.publishedAt),
    );
    if (!release) return [];

    const source = catalog.sources.find(
      (candidate) =>
        release.sourceIds.includes(candidate.id) &&
        candidate.approvalStatus === "approved" &&
        Boolean(candidate.url),
    );
    if (!source?.url) return [];

    return [{
      slug,
      name: survivor.displayName[locale],
      summary: survivor.summary[locale],
      citation: source.citation[locale],
      sourceTitle: source.title,
      sourceUrl: source.url,
    }];
  });
}
