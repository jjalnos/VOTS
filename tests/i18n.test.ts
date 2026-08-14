import { describe, expect, it } from "vitest";
import { dictionary, t } from "@/lib/i18n";

describe("English and Spanish UI", () => {
  it("keeps translation keys in parity", () => {
    expect(Object.keys(dictionary.es).sort()).toEqual(Object.keys(dictionary.en).sort());
  });

  it("renders core navigation in both languages", () => {
    expect(t("en", "navChat")).toBe("Ask the archive");
    expect(t("es", "navChat")).toBe("Consultar el archivo");
    expect(t("en", "onlyPublished")).not.toBe(t("es", "onlyPublished"));
  });
});
