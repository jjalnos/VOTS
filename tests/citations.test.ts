import { describe, expect, it } from "vitest";
import { answerFromPublishedCatalog } from "@/lib/chat/cited-answer";
import { getPublicCatalog } from "@/lib/data/public-catalog";

describe("cited chat behavior", () => {
  it("returns a citation only when published material supports the answer", () => {
    const result = answerFromPublishedCatalog("How does publication review protect the archive?", "en", getPublicCatalog("en"));
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations.every((citation) => citation.sourceId === "source-hmmsa-archive-policy")).toBe(true);
  });

  it("declines unsupported questions without fabricating citations", () => {
    const result = answerFromPublishedCatalog("Tell me a private person's address", "en", getPublicCatalog("en"));
    expect(result.answer).toContain("cannot find");
    expect(result.citations).toEqual([]);
    expect(result.scopeNotice).toContain("No private uploads");
  });
});
