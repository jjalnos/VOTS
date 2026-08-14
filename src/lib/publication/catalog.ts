import type {
  ArchiveItem,
  Locale,
  PublicCatalog,
  PublicRelease,
  Source,
  Story,
  Survivor,
  TimelineEvent,
} from "@/lib/domain/types";

export interface CatalogInput {
  survivors: Survivor[];
  archiveItems: ArchiveItem[];
  stories: Story[];
  timelineEvents: TimelineEvent[];
  sources: Source[];
  releases: PublicRelease[];
}

function hasPublishedRelease(
  releases: PublicRelease[],
  entityType: PublicRelease["entityType"],
  entityId: string,
  locale: Locale,
): boolean {
  return releases.some(
    (release) =>
      release.entityType === entityType &&
      release.entityId === entityId &&
      release.locale === locale &&
      release.status === "published" &&
      Boolean(release.publishedAt),
  );
}

export function buildPublicCatalog(input: CatalogInput, locale: Locale): PublicCatalog {
  const approvedSourceIds = new Set(
    input.sources.filter((source) => source.approvalStatus === "approved").map((source) => source.id),
  );
  const releases = input.releases.filter(
    (release) =>
      release.locale === locale &&
      release.status === "published" &&
      Boolean(release.publishedAt) &&
      release.sourceIds.every((sourceId) => approvedSourceIds.has(sourceId)),
  );

  return {
    survivors: input.survivors.filter(
      (survivor) =>
        survivor.reviewStatus === "approved" &&
        hasPublishedRelease(releases, "survivor", survivor.id, locale),
    ),
    archiveItems: input.archiveItems.filter(
      (item) =>
        item.reviewStatus === "approved" &&
        item.visibility === "public" &&
        hasPublishedRelease(releases, "archive_item", item.id, locale),
    ),
    stories: input.stories.filter(
      (story) =>
        story.reviewStatus === "approved" &&
        story.sourceIds.every((sourceId) => approvedSourceIds.has(sourceId)) &&
        hasPublishedRelease(releases, "story", story.id, locale),
    ),
    timelineEvents: input.timelineEvents.filter(
      (event) =>
        event.reviewStatus === "approved" &&
        event.sourceIds.every((sourceId) => approvedSourceIds.has(sourceId)) &&
        hasPublishedRelease(releases, "timeline_event", event.id, locale),
    ),
    sources: input.sources.filter((source) => approvedSourceIds.has(source.id)),
    releases,
  };
}
