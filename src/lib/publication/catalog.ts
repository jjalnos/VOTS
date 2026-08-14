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

function publishedRelease(
  releases: PublicRelease[],
  entityType: PublicRelease["entityType"],
  entityId: string,
  locale: Locale,
): PublicRelease | undefined {
  return releases.find(
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
  const eligibleReleases = input.releases.filter(
    (release) =>
      release.locale === locale &&
      release.status === "published" &&
      Boolean(release.publishedAt) &&
      release.rightsSnapshot.trim().length > 0 &&
      release.sourceIds.length > 0 &&
      release.sourceIds.every((sourceId) => approvedSourceIds.has(sourceId)),
  );

  const survivors = input.survivors.filter(
    (survivor) =>
      survivor.reviewStatus === "approved" &&
      Boolean(publishedRelease(eligibleReleases, "survivor", survivor.id, locale)),
  );
  const archiveItems = input.archiveItems.filter(
    (item) =>
      item.reviewStatus === "approved" &&
      item.visibility === "public" &&
      item.rightsStatement.trim().length > 0 &&
      Boolean(publishedRelease(eligibleReleases, "archive_item", item.id, locale)),
  );
  const stories = input.stories.filter((story) => {
    const release = publishedRelease(eligibleReleases, "story", story.id, locale);
    if (!release || story.reviewStatus !== "approved" || !story.sourceIds.length) return false;
    return story.sourceIds.every(
      (sourceId) => approvedSourceIds.has(sourceId) && release.sourceIds.includes(sourceId),
    );
  });
  const timelineEvents = input.timelineEvents.filter((event) => {
    const release = publishedRelease(eligibleReleases, "timeline_event", event.id, locale);
    if (!release || event.reviewStatus !== "approved" || !event.sourceIds.length) return false;
    return event.sourceIds.every(
      (sourceId) => approvedSourceIds.has(sourceId) && release.sourceIds.includes(sourceId),
    );
  });
  const publishedEntityKeys = new Set([
    ...survivors.map((record) => `survivor:${record.id}`),
    ...archiveItems.map((record) => `archive_item:${record.id}`),
    ...stories.map((record) => `story:${record.id}`),
    ...timelineEvents.map((record) => `timeline_event:${record.id}`),
  ]);
  const releases = eligibleReleases.filter((release) =>
    publishedEntityKeys.has(`${release.entityType}:${release.entityId}`),
  );
  const referencedSourceIds = new Set(releases.flatMap((release) => release.sourceIds));

  return {
    survivors,
    archiveItems,
    stories,
    timelineEvents,
    sources: input.sources.filter(
      (source) => approvedSourceIds.has(source.id) && referencedSourceIds.has(source.id),
    ),
    releases,
  };
}
