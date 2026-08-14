import { buildPublicCatalog } from "@/lib/publication/catalog";
import type { Locale } from "@/lib/domain/types";
import {
  seedArchiveItems,
  seedPublicReleases,
  seedSources,
  seedStories,
  seedSurvivors,
  seedTimelineEvents,
} from "@/lib/data/seed";

export function getPublicCatalog(locale: Locale) {
  return buildPublicCatalog(
    {
      survivors: seedSurvivors,
      archiveItems: seedArchiveItems,
      stories: seedStories,
      timelineEvents: seedTimelineEvents,
      sources: seedSources,
      releases: seedPublicReleases,
    },
    locale,
  );
}
