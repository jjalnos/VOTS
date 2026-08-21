import { describe, expect, it } from "vitest";
import {
  isSentinelRecord,
  PORTRAITS,
  PUBLISHED_IDENTITY_CORRECTIONS,
  PUBLISHABLE_SLUGS,
} from "@/lib/publication/seed-catalog";
import { seedSources, seedStories, seedSurvivors } from "@/lib/data/seed";

describe("public catalog publication guards", () => {
  // Asserting the invariant rather than the roster: the list grows every time
  // the curator publishes someone, and a test that has to be edited for each
  // new survivor stops guarding anything.
  it("publishes only survivor records that exist and are reviewed", () => {
    expect(PUBLISHABLE_SLUGS.size).toBeGreaterThan(0);
    for (const slug of PUBLISHABLE_SLUGS) {
      const survivor = seedSurvivors.find((record) => record.slug === slug);
      expect(survivor, `no seeded survivor for publishable slug "${slug}"`).toBeDefined();
      expect(survivor!.reviewStatus).toBe("approved");
      expect(isSentinelRecord(slug)).toBe(false);
      expect(survivor!.isDemonstration).toBe(false);
    }
  });

  // The seeder's INSERT never writes a portrait — portraits reach the database
  // only through syncPortraitsFromCode reading PORTRAITS. A fixture portrait
  // with no PORTRAITS entry therefore ships invisibly, which is exactly what
  // happened to seven survivors on 2026-08-21.
  it("carries every fixture portrait in the map that actually reaches the database", () => {
    for (const survivor of seedSurvivors) {
      if (!survivor.portrait || !PUBLISHABLE_SLUGS.has(survivor.slug)) continue;
      const mapped = PORTRAITS[survivor.slug];
      expect(mapped, `no PORTRAITS entry for "${survivor.slug}"`).toBeDefined();
      expect(mapped.url).toBe(survivor.portrait.url);
      expect(mapped.credit).toBe(survivor.portrait.credit);
      expect(mapped.rights).toBe(survivor.portrait.rights);
    }
  });

  // A real person's sourced record must never be labelled demonstration data:
  // the profile page renders that notice straight off this flag.
  it("marks no published survivor as demonstration data", () => {
    for (const slug of PUBLISHABLE_SLUGS) {
      const survivor = seedSurvivors.find((record) => record.slug === slug)!;
      expect(survivor.isDemonstration, `"${slug}" is flagged as demonstration data`).toBe(false);
    }
  });

  it("keeps the family-confirmed Susanne name aligned with the seed", () => {
    const susanne = seedSurvivors.find((record) => record.slug === "susanne-jalnos")!;
    const correction = PUBLISHED_IDENTITY_CORRECTIONS["susanne-jalnos"];
    expect(susanne.displayName).toEqual(correction.displayName);
    expect(susanne.displayName.en).toContain("Zsuzsi");
    expect(susanne.displayName.en).toContain("Weisz");
  });

  it("refuses every private sentinel fixture", () => {
    const sentinelSurvivor = seedSurvivors.find((s) => s.slug === "private-draft-never-public")!;
    const sentinelStory = seedStories.find((s) => s.slug === "private-story")!;
    const sentinelSource = seedSources.find((s) => s.approvalStatus !== "approved")!;

    expect(PUBLISHABLE_SLUGS.has(sentinelSurvivor.slug)).toBe(false);
    expect(isSentinelRecord(sentinelSurvivor.slug)).toBe(true);
    expect(isSentinelRecord(sentinelStory.slug)).toBe(true);
    expect(isSentinelRecord(sentinelSource.title)).toBe(true);
  });

  it("keeps the two publishable records approved and sourced", () => {
    for (const slug of PUBLISHABLE_SLUGS) {
      const survivor = seedSurvivors.find((s) => s.slug === slug);
      expect(survivor, `${slug} must exist`).toBeDefined();
      expect(survivor!.reviewStatus).toBe("approved");
      expect(isSentinelRecord(slug)).toBe(false);
    }
  });
});
