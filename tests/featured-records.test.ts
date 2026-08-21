import { describe, expect, it } from "vitest";
import { getPublicCatalog } from "@/lib/data/public-catalog";
import {
  FEATURED_RECORD_SLUGS,
  selectArchiveIndex,
  selectFeaturedRecords,
} from "@/lib/publication/featured-records";

describe("featured public records", () => {
  // The homepage order is declared in FEATURED_RECORD_SLUGS; the selection
  // must preserve it rather than fall back to catalog order.
  it("returns the featured survivors in their declared order", () => {
    const records = selectFeaturedRecords(getPublicCatalog("en"), "en");

    expect(records.map((record) => record.slug)).toEqual([...FEATURED_RECORD_SLUGS]);
    expect(records.every((record) => record.sourceUrl.startsWith("https://"))).toBe(true);
  });

  it("omits a record when its public release is unavailable", () => {
    const catalog = getPublicCatalog("en");
    const withoutStephanRelease = {
      ...catalog,
      releases: catalog.releases.filter(
        (release) => release.entityId !== "survivor-stephan-jalnos-demo",
      ),
    };

    const slugs = selectFeaturedRecords(withoutStephanRelease, "en").map((record) => record.slug);
    expect(slugs).not.toContain("stephan-jalnos");
    expect(slugs).toEqual(FEATURED_RECORD_SLUGS.filter((slug) => slug !== "stephan-jalnos"));
  });

  it("omits a record when its attached source is not approved", () => {
    const catalog = getPublicCatalog("en");
    const withPendingSamSource = {
      ...catalog,
      sources: catalog.sources.map((source) =>
        source.id === "source-sam-cohen-interview"
          ? { ...source, approvalStatus: "pending" as const }
          : source,
      ),
    };

    const slugs = selectFeaturedRecords(withPendingSamSource, "en").map((record) => record.slug);
    expect(slugs).not.toContain("sam-cohen");
    expect(slugs).toEqual(FEATURED_RECORD_SLUGS.filter((slug) => slug !== "sam-cohen"));
  });

  // Catalog order is whatever the database returns, so the index must impose
  // its own: a survivor who gains a portrait once drifted to the end of the
  // homepage because an UPDATE moved the row.
  it("files the index by family name, independent of catalog order", () => {
    const catalog = getPublicCatalog("en");
    const forward = selectArchiveIndex(catalog, "en").map((record) => record.name);
    const reversed = selectArchiveIndex(
      { ...catalog, survivors: [...catalog.survivors].reverse() },
      "en",
    ).map((record) => record.name);

    expect(forward).toEqual(reversed);
    expect(forward.length).toBeGreaterThan(0);

    const families = forward.map((name) => name.split(" ").at(-1)!);
    expect(families).toEqual([...families].sort((a, b) => a.localeCompare(b, "en")));
    // Relatives stay together: both Scharffs, both Haendels.
    expect(forward.filter((n) => n.endsWith("Scharff"))).toHaveLength(2);
    const scharffAt = forward.findIndex((n) => n.endsWith("Scharff"));
    expect(forward[scharffAt + 1]).toMatch(/Scharff$/);
  });

  it("never lists a survivor already given a full row", () => {
    const index = selectArchiveIndex(getPublicCatalog("en"), "en").map((r) => r.slug);
    for (const slug of FEATURED_RECORD_SLUGS) expect(index).not.toContain(slug);
  });
});
