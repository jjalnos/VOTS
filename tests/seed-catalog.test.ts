import { describe, expect, it } from "vitest";
import {
  isSentinelRecord,
  PUBLISHABLE_SLUGS,
} from "@/lib/publication/seed-catalog";
import { seedSources, seedStories, seedSurvivors } from "@/lib/data/seed";

describe("public catalog publication guards", () => {
  it("publishes only the two reviewed survivor records", () => {
    expect([...PUBLISHABLE_SLUGS].sort()).toEqual(["sam-cohen", "stephan-jalnos"]);
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
