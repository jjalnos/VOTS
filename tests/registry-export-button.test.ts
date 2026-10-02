import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  pointOutsideBox,
  RegistryExportButton,
  type RegistryExportCopy,
} from "@/components/registry-export-button";

const copy: RegistryExportCopy = {
  button: "Download",
  title: "Download the register",
  question: "Which format would you like? The file will include all 3 people matching the current search and filters.",
  csvLabel: "CSV file",
  csvHint: "Plain text that any spreadsheet or database can import.",
  xlsxLabel: "Excel workbook (.xlsx)",
  xlsxHint: "Opens directly in Excel, Numbers, or Google Sheets.",
  cancel: "Cancel",
};

const csvHref = "/api/curator/registry/export?format=csv&q=Adler&status=living&lang=en";
const xlsxHref = "/api/curator/registry/export?format=xlsx&q=Adler&status=living&lang=en";

describe("RegistryExportButton", () => {
  const html = renderToStaticMarkup(createElement(RegistryExportButton, { copy, csvHref, xlsxHref }));

  it("renders a button that announces its dialog", () => {
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-haspopup="dialog"[^>]*>Download<\/button>/);
  });

  it("renders a labelled native dialog that is closed until opened", () => {
    const dialog = /<dialog([^>]*)>/.exec(html);
    expect(dialog).not.toBeNull();
    expect(dialog![1]).not.toContain(" open");
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(dialog![1])![1];
    const describedBy = /aria-describedby="([^"]+)"/.exec(dialog![1])![1];
    expect(html).toContain(`id="${labelledBy}"`);
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain(">Download the register<");
    expect(html).toContain("all 3 people matching");
  });

  it("offers both formats as plain links carrying the page's filters and language", () => {
    expect(html).toContain(`href="${csvHref.replaceAll("&", "&amp;")}"`);
    expect(html).toContain(`href="${xlsxHref.replaceAll("&", "&amp;")}"`);
    expect(html).toContain(">CSV file<");
    expect(html).toContain(">Excel workbook (.xlsx)<");
    expect(html).toContain(">Plain text that any spreadsheet or database can import.<");
    expect(html).toContain(">Opens directly in Excel, Numbers, or Google Sheets.<");
    // The browser must follow the link itself; nothing prefetches an export.
    expect(html).not.toContain('rel="prefetch"');
    expect(html).not.toContain("download=");
  });

  it("has a cancel button", () => {
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Cancel<\/button>/);
  });

  it("keeps the choices announced as a list even where list styling is removed", () => {
    // Safari/VoiceOver drops list semantics from a list with list-style: none
    // unless the role is stated explicitly.
    expect(html).toMatch(/<ul[^>]*role="list"[^>]*>/);
    expect(html.match(/<li>/g)).toHaveLength(2);
  });
});

describe("backdrop hit test", () => {
  const box = { left: 100, top: 50, right: 400, bottom: 350 };

  it("treats the dialog's own border and edges as inside the dialog", () => {
    expect(pointOutsideBox(box, 100, 50)).toBe(false);
    expect(pointOutsideBox(box, 400, 350)).toBe(false);
    expect(pointOutsideBox(box, 100, 200)).toBe(false);
    expect(pointOutsideBox(box, 400, 200)).toBe(false);
    expect(pointOutsideBox(box, 250, 50)).toBe(false);
    expect(pointOutsideBox(box, 250, 350)).toBe(false);
    expect(pointOutsideBox(box, 250, 200)).toBe(false);
  });

  it("treats only the backdrop around the dialog as outside", () => {
    expect(pointOutsideBox(box, 99, 200)).toBe(true);
    expect(pointOutsideBox(box, 401, 200)).toBe(true);
    expect(pointOutsideBox(box, 250, 49)).toBe(true);
    expect(pointOutsideBox(box, 250, 351)).toBe(true);
    expect(pointOutsideBox(box, 0, 0)).toBe(true);
  });
});
