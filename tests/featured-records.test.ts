import { describe, expect, it } from "vitest";
import { getPublicCatalog } from "@/lib/data/public-catalog";
import { selectFeaturedRecords } from "@/lib/publication/featured-records";

describe("featured public records", () => {
  it("returns Sam Cohen and Stephan Jalnos in a deliberate order", () => {
    const records = selectFeaturedRecords(getPublicCatalog("en"), "en");

    expect(records.map((record) => record.slug)).toEqual([
      "sam-cohen",
      "stephan-jalnos",
    ]);
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

    expect(selectFeaturedRecords(withoutStephanRelease, "en").map((record) => record.slug))
      .toEqual(["sam-cohen"]);
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

    expect(selectFeaturedRecords(withPendingSamSource, "en").map((record) => record.slug))
      .toEqual(["stephan-jalnos"]);
  });
});
