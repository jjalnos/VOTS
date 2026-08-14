import { describe, expect, it } from "vitest";
import { getPublicCatalog } from "@/lib/data/public-catalog";

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
    expect(spanish.survivors).toHaveLength(1);
  });
});
