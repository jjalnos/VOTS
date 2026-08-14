import { describe, expect, it } from "vitest";
import { getPublicCatalog } from "@/lib/data/public-catalog";
import {
  seedArchiveItems,
  seedPublicReleases,
  seedSources,
  seedStories,
  seedSurvivors,
  seedTimelineEvents,
} from "@/lib/data/seed";
import { buildPublicCatalog } from "@/lib/publication/catalog";

describe("public content isolation", () => {
  it("never exposes private or unapproved sentinels", () => {
    const serialized = JSON.stringify(getPublicCatalog("en"));
    expect(serialized).not.toContain("PRIVATE UPLOAD SENTINEL");
    expect(serialized).not.toContain("PRIVATE STORY SENTINEL");
    expect(serialized).not.toContain("PRIVATE UNAPPROVED SOURCE");
    expect(serialized).not.toContain("private-draft-never-public");
  });

  it("requires a locale-specific release", () => {
    const spanish = getPublicCatalog("es");
    expect(spanish.archiveItems).toHaveLength(0);
    expect(spanish.survivors).toHaveLength(2);
  });

  it("returns only sources referenced by an actually published entity", () => {
    const catalog = getPublicCatalog("en");
    expect(catalog.survivors.map((survivor) => survivor.displayName.en)).toEqual([
      "Sam Cohen",
      "Stephan Jalnos",
    ]);
    expect(catalog.sources.map((source) => source.id)).toEqual([
      "source-hmmsa-archive-policy",
      "source-sam-cohen-interview",
      "source-stephan-jalnos-series",
    ]);
    const publishedIds = new Set([
      ...catalog.survivors,
      ...catalog.archiveItems,
      ...catalog.stories,
      ...catalog.timelineEvents,
    ].map((record) => record.id));
    expect(catalog.releases.every((release) => publishedIds.has(release.entityId))).toBe(true);
  });

  it("rejects releases without a source or rights snapshot", () => {
    const catalog = buildPublicCatalog({
      survivors: seedSurvivors,
      archiveItems: seedArchiveItems,
      sources: seedSources,
      stories: seedStories,
      timelineEvents: seedTimelineEvents,
      releases: seedPublicReleases.map((release) =>
        release.entityType === "survivor"
          ? { ...release, sourceIds: [], rightsSnapshot: "" }
          : release,
      ),
    }, "en");
    expect(catalog.survivors).toHaveLength(0);
  });
});
