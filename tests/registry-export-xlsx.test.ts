import { describe, expect, it } from "vitest";
import { readWorkbook } from "@/lib/survivor-registry/xlsx-reader";
import {
  sanitizeXmlText,
  writeWorkbook,
  XLSX_MAX_CELL_CHARACTERS,
} from "@/lib/survivor-registry/xlsx-writer";
import { unzipEntries } from "./support/unzip";

function values(bytes: Uint8Array): string[][] {
  const workbook = readWorkbook(bytes);
  return workbook.sheets[0].rows.map((row) => row.map((cell) => cell.value));
}

describe("registry XLSX writer", () => {
  it("produces a workbook the registry's own reader opens, with every value intact", () => {
    const rows = [
      ["Last name", "First name", "ZIP", "Phone", "Notes"],
      ["Adler ז״ל", "José Ñandú", "02134", "+1 (210) 555-0100", '<Tom & "Jerry"> \'x\''],
      ["Baum", "Lea", "78209", "=HYPERLINK(\"http://evil.example\",\"click\")", "line one\nline two"],
      ["Ćwik", "Ewa", "00501", "-210-555-0100", "@mention"],
    ];
    const bytes = writeWorkbook({ sheetName: "Survivor registry", rows });
    const workbook = readWorkbook(bytes);

    expect(workbook.sheets).toHaveLength(1);
    expect(workbook.sheets[0].name).toBe("Survivor registry");
    expect(values(bytes)).toEqual(rows);
    // The header is bold, never red: red marks a deceased person on import.
    expect(workbook.sheets[0].rows.flat().some((cell) => cell.red)).toBe(false);
  });

  it("stores every cell as a shared string and never as a number or a formula", () => {
    const bytes = writeWorkbook({
      sheetName: "Registro",
      rows: [
        ["ZIP", "Phone", "Formula"],
        ["02134", "+1 210 555 0100", "=1+1"],
        ["1e5", "3.0", "TRUE"],
      ],
    });
    const parts = unzipEntries(bytes);
    const sheet = parts.get("xl/worksheets/sheet1.xml") ?? "";
    const cells = [...sheet.matchAll(/<c\b[^>]*>/g)].map((match) => match[0]);
    expect(cells).toHaveLength(9);
    for (const cell of cells) expect(cell).toMatch(/\bt="s"/);
    expect(sheet).not.toContain("<f");
    expect(sheet).not.toContain("<is>");
    // Values live in sharedStrings.xml and come back exactly as written.
    expect(values(bytes)).toEqual([
      ["ZIP", "Phone", "Formula"],
      ["02134", "+1 210 555 0100", "=1+1"],
      ["1e5", "3.0", "TRUE"],
    ]);
  });

  it("contains the parts a spreadsheet application expects, each well-formed", () => {
    const parts = unzipEntries(writeWorkbook({ sheetName: "S", rows: [["a"], ["b"]] }));
    expect([...parts.keys()].sort()).toEqual(
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/worksheets/sheet1.xml",
        "xl/styles.xml",
        "xl/sharedStrings.xml",
      ].sort(),
    );
    for (const [name, xml] of parts) {
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'), name).toBe(true);
    }
    expect(parts.get("[Content_Types].xml")).toContain("/xl/worksheets/sheet1.xml");
    expect(parts.get("[Content_Types].xml")).toContain("/xl/sharedStrings.xml");
    expect(parts.get("[Content_Types].xml")).toContain("/xl/styles.xml");
    expect(parts.get("_rels/.rels")).toContain('Target="xl/workbook.xml"');
    expect(parts.get("xl/workbook.xml")).toMatch(/<sheet name="S" sheetId="1" r:id="rId1"\/>/);
    expect(parts.get("xl/_rels/workbook.xml.rels")).toContain('Target="worksheets/sheet1.xml"');
    expect(parts.get("xl/styles.xml")).toContain("<b/>");
    expect(parts.get("xl/sharedStrings.xml")).toMatch(/<sst [^>]*count="2" uniqueCount="2"/);
  });

  it("escapes XML specials and the _xHHHH_ escape sequence so Excel shows them literally", () => {
    const bytes = writeWorkbook({
      sheetName: "S",
      rows: [["<a&b>", 'say "hi"', "_x0041_ and _X0041_ and _x00zz_"]],
    });
    const shared = unzipEntries(bytes).get("xl/sharedStrings.xml") ?? "";
    expect(shared).toContain("&lt;a&amp;b&gt;");
    expect(shared).toContain("&quot;hi&quot;");
    expect(shared).toContain("_x005F_x0041_");
    expect(shared).not.toMatch(/(?<!_x005F)_x0041_/);
    expect(shared).toContain("_X0041_");
    expect(shared).toContain("_x00zz_");
    // Excel, Numbers and LibreOffice decode _x005F_ back to the underscore, so
    // the person sees "_x0041_" rather than "A". The registry's own reader does
    // not implement that decoding and returns the stored text as written.
    expect(values(bytes)).toEqual([
      ["<a&b>", 'say "hi"', "_x005F_x0041_ and _X0041_ and _x00zz_"],
    ]);
  });

  it("strips characters XML 1.0 cannot carry and normalises line endings", () => {
    expect(sanitizeXmlText("a\u0000b\u0007c\u001Fd")).toBe("abcd");
    expect(sanitizeXmlText("a￾b￿c")).toBe("abc");
    expect(sanitizeXmlText("lone \uD800 surrogate")).toBe("lone  surrogate");
    expect(sanitizeXmlText("keep\ttab\nand nbsp")).toBe("keep\ttab\nand nbsp");
    expect(sanitizeXmlText("one\r\ntwo\rthree")).toBe("one\ntwo\nthree");
    expect(sanitizeXmlText("astral \u{1F54E} kept")).toBe("astral \u{1F54E} kept");

    const bytes = writeWorkbook({
      sheetName: "S",
      rows: [["ctrl\u0000\u0007char", "crlf\r\nline", "\u{1F54E} ז״ל"]],
    });
    expect(values(bytes)).toEqual([["ctrlchar", "crlf\nline", "\u{1F54E} ז״ל"]]);
  });

  it("truncates a cell to Excel's limit", () => {
    const long = "x".repeat(XLSX_MAX_CELL_CHARACTERS + 10);
    const [[cell]] = values(writeWorkbook({ sheetName: "S", rows: [[long]] }));
    expect(cell).toHaveLength(XLSX_MAX_CELL_CHARACTERS);
  });

  it("omits empty cells but keeps column positions and ragged rows", () => {
    const bytes = writeWorkbook({
      sheetName: "S",
      rows: [
        ["A", "B", "C"],
        ["", "", "c"],
        ["a"],
        [],
      ],
    });
    const sheet = unzipEntries(bytes).get("xl/worksheets/sheet1.xml") ?? "";
    expect(sheet).toContain('r="C2"');
    expect(sheet).not.toContain('r="A2"');
    expect(sheet).toContain('<dimension ref="A1:C4"/>');
    expect(values(bytes)).toEqual([["A", "B", "C"], ["", "", "c"], ["a"], []]);
  });

  it("writes only a header row for an empty list", () => {
    const bytes = writeWorkbook({ sheetName: "S", rows: [["Last name", "First name"]] });
    expect(values(bytes)).toEqual([["Last name", "First name"]]);
  });

  it("keeps the sheet name legal for Excel", () => {
    const sheetName = 'Bad: name [with] * every ? illegal / char \\ and far too long for Excel';
    const bytes = writeWorkbook({ sheetName, rows: [["a"]] });
    const name = readWorkbook(bytes).sheets[0].name;
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[[\]:*?/\\]/);
    expect(readWorkbook(writeWorkbook({ sheetName: "   ", rows: [["a"]] })).sheets[0].name).toBe(
      "Sheet1",
    );
  });

  it("refuses to write more columns than a worksheet can hold", () => {
    expect(() =>
      writeWorkbook({ sheetName: "S", rows: [Array.from({ length: 16_385 }, () => "x")] }),
    ).toThrow(RangeError);
  });

  it("returns bytes with their own buffer so they can be sent as a response body", () => {
    const bytes = writeWorkbook({ sheetName: "S", rows: [["a"]] });
    expect(bytes.byteOffset).toBe(0);
    expect(bytes.buffer.byteLength).toBe(bytes.byteLength);
    // Standard zip signature.
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});
