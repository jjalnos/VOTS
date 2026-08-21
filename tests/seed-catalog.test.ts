import { describe, expect, it } from "vitest";
import {
  isSentinelRecord,
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
