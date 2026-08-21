import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArchiveHome } from "@/components/archive-home";

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
});
