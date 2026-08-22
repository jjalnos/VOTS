import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArchiveHome } from "@/components/archive-home";
import { getPublicCatalog } from "@/lib/data/public-catalog";
import { selectFeaturedRecords } from "@/lib/publication/featured-records";

describe("archive home", () => {
  it.each([
    ["en", "This archive is looking for funding.", "The registry"],
    ["es", "Este archivo busca financiamiento.", "El registro"],
  ] as const)(
    "hides the funding section in %s while preserving the registry",
    (locale, fundingTitle, registryTitle) => {
      const html = renderToStaticMarkup(
        createElement(ArchiveHome, {
          locale,
          featuredRecords: [],
          counts: { names: 342, photographs: 12, records: 2 },
        }),
      );

      expect(html).not.toContain(fundingTitle);
      expect(html).not.toContain("portal.clicksmith.net/donate/voices-of-the-shoah");
      expect(html).toContain(registryTitle);
    },
  );

  it.each([
    ["en", "View all survivors", "/directory?lang=en"],
    ["es", "Ver a todos los sobrevivientes", "/directory?lang=es"],
  ] as const)(
    "shows three survivor previews followed by the directory action in %s",
    (locale, actionLabel, directoryHref) => {
      const featuredRecords = selectFeaturedRecords(getPublicCatalog(locale), locale);
      expect(featuredRecords).toHaveLength(4);

      const html = renderToStaticMarkup(
        createElement(ArchiveHome, {
          locale,
          featuredRecords,
          counts: { names: 342, photographs: 12, records: 24 },
        }),
      );

      expect(html.match(/data-slug=/g)).toHaveLength(3);
      expect(html).not.toContain(featuredRecords[3].name);
      expect(html).toContain(`href="${directoryHref}"`);
      expect(html).toContain(actionLabel);

      const thirdPreviewAt = html.indexOf(`data-slug="${featuredRecords[2].slug}"`);
      const directoryActionAt = html.indexOf(actionLabel);
      const missionAt = html.indexOf('id="mission-title"');
      expect(directoryActionAt).toBeGreaterThan(thirdPreviewAt);
      expect(directoryActionAt).toBeLessThan(missionAt);
    },
  );
});
