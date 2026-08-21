import { describe, expect, it } from "vitest";
import { seedSurvivors } from "@/lib/data/seed";
import { PUBLISHABLE_SLUGS } from "@/lib/publication/seed-catalog";
import { TESTIMONY, testimonyFor, testimonyVerb } from "@/lib/publication/testimony";

describe("testimony links", () => {
  it("only ever attaches testimony to a survivor the archive publishes", () => {
    for (const slug of Object.keys(TESTIMONY)) {
      expect(PUBLISHABLE_SLUGS.has(slug), `"${slug}" is not publishable`).toBe(true);
      expect(seedSurvivors.some((record) => record.slug === slug)).toBe(true);
    }
  });

  it("carries a usable link and both languages for every entry", () => {
    for (const [slug, entries] of Object.entries(TESTIMONY)) {
      expect(entries.length, slug).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.url, slug).toMatch(/^https:\/\//);
        expect(entry.label.en.trim().length, slug).toBeGreaterThan(0);
        expect(entry.label.es.trim().length, slug).toBeGreaterThan(0);
        expect(entry.label.en, `${slug} is untranslated`).not.toBe(entry.label.es);
        expect(testimonyVerb(entry.kind, "en")).toBeTruthy();
        expect(testimonyVerb(entry.kind, "es")).toBeTruthy();
      }
      // A survivor must never be given the same recording twice.
      const urls = entries.map((entry) => entry.url);
      expect(new Set(urls).size, `${slug} repeats a link`).toBe(urls.length);
    }
  });

  /*
   * The museum's page lists these links above the name they belong to, and two
   * survivors are both called Anna. The association was read out of the page's
   * structure rather than guessed from the wording, and these are the two that
   * a guess gets wrong.
   */
  it("keeps the two Annas' recordings apart", () => {
    const rado = testimonyFor("anna-rado");
    const levit = testimonyFor("anna-levit");
    expect(rado.some((entry) => entry.url.includes("hRlA_I-nL9c"))).toBe(true);
    expect(levit.some((entry) => entry.url.includes("jJw5NJYGyMw"))).toBe(true);
    expect(rado.map((entry) => entry.url)).not.toContain(levit[0].url);
  });

  it("gives the Scharffs their own written testimony", () => {
    const david = testimonyFor("david-scharff").map((entry) => entry.url);
    const golda = testimonyFor("golda-scharff").map((entry) => entry.url);
    expect(david.some((url) => url.includes("Testimony-David-Scharff"))).toBe(true);
    expect(golda.some((url) => url.includes("GOLDA-SCHARFF"))).toBe(true);
    expect(david).not.toContain(golda.find((url) => url.includes("GOLDA")));
  });

  it("returns nothing for a survivor with no published testimony", () => {
    expect(testimonyFor("oscar-ehrenberg")).toEqual([]);
    expect(testimonyFor("not-a-survivor")).toEqual([]);
  });
});
