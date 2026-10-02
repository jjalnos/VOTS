import { describe, expect, it } from "vitest";
import {
  CSV_BYTE_ORDER_MARK,
  csvCell,
  guardCsvCell,
  serializeCsv,
} from "@/lib/survivor-registry/csv-writer";

describe("registry CSV writer", () => {
  it("starts with a UTF-8 byte-order mark so Excel reads accents and Hebrew", () => {
    const csv = serializeCsv([["Name"], ["José ז״ל"]]);
    expect(csv.startsWith(CSV_BYTE_ORDER_MARK)).toBe(true);
    const bytes = new TextEncoder().encode(csv);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toContain("José ז״ל");
  });

  it("ends every record, including the last, with CRLF", () => {
    const csv = serializeCsv([
      ["Last name", "First name"],
      ["Adler", "Ruth"],
      ["Baum", "Leo"],
    ]);
    expect(csv).toBe("﻿Last name,First name\r\nAdler,Ruth\r\nBaum,Leo\r\n");
    // No bare line feeds between records.
    expect(csv.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
  });

  it("writes only the header for an empty list and nothing but the mark for no rows", () => {
    expect(serializeCsv([["Last name"]])).toBe("﻿Last name\r\n");
    expect(serializeCsv([])).toBe("﻿");
  });

  it("quotes fields containing commas, quotes or line breaks, doubling the quotes", () => {
    expect(csvCell("San Antonio, TX")).toBe('"San Antonio, TX"');
    expect(csvCell('Ruth "Ruthie" Adler')).toBe('"Ruth ""Ruthie"" Adler"');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell("line one\r\nline two")).toBe('"line one\r\nline two"');
    expect(csvCell('"')).toBe('""""');
  });

  it("quotes fields with leading or trailing spaces so they are not trimmed away", () => {
    expect(csvCell(" padded ")).toBe('" padded "');
  });

  it("leaves ordinary text, empty cells and inner punctuation unquoted", () => {
    expect(csvCell("Adler")).toBe("Adler");
    expect(csvCell("")).toBe("");
    expect(csvCell("O'Brien")).toBe("O'Brien");
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("Bergen-Belsen")).toBe("Bergen-Belsen");
    expect(csvCell("name@example.org")).toBe("name@example.org");
    expect(csvCell("78209")).toBe("78209");
    expect(csvCell("02134")).toBe("02134");
  });

  it("keeps a row's column count when cells are empty", () => {
    expect(serializeCsv([["a", "", "c"], ["", "", ""]])).toBe("﻿a,,c\r\n,,\r\n");
  });

  it.each([
    ["=1+1", "'=1+1"],
    ["=HYPERLINK(\"http://evil.example\",\"click\")", "'=HYPERLINK(\"http://evil.example\",\"click\")"],
    ["+1+1", "'+1+1"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1:A2)", "'@SUM(A1:A2)"],
    ["\t=1+1", "'\t=1+1"],
    ["\r=1+1", "'\r=1+1"],
  ])("neutralises the formula trigger in %j", (value, guarded) => {
    expect(guardCsvCell(value)).toBe(guarded);
  });

  it("guards and then quotes, so a guarded value with a comma is still one field", () => {
    expect(csvCell('=HYPERLINK("http://evil.example","click")')).toBe(
      '"\'=HYPERLINK(""http://evil.example"",""click"")"',
    );
    expect(csvCell("\r=1+1")).toBe('"\'\r=1+1"');
    expect(csvCell("@cmd|' /C calc'!A0")).toBe("'@cmd|' /C calc'!A0");
  });

  it("keeps a phone number that begins with a plus sign whole and readable", () => {
    // Unguarded, Excel would evaluate "+1-210-555-0100" to -864.
    expect(csvCell("+1 210 555 0100")).toBe("'+1 210 555 0100");
    expect(csvCell("+1-210-555-0100")).toBe("'+1-210-555-0100");
    expect(csvCell("+49 (30) 1234-5678")).toBe("'+49 (30) 1234-5678");
    // A number that does not start with a trigger is left exactly as it is.
    expect(csvCell("(210) 555-0100")).toBe("(210) 555-0100");
    expect(csvCell("210-555-0100")).toBe("210-555-0100");
  });

  it("only looks at the first character", () => {
    expect(guardCsvCell("x=1+1")).toBe("x=1+1");
    expect(guardCsvCell(" =1+1")).toBe(" =1+1");
    expect(guardCsvCell("")).toBe("");
  });

  it("drops control characters before the formula guard, as the XLSX writer does", () => {
    expect(csvCell("\u0007Call first\u0000")).toBe("Call first");
    // Removal happens first, so the guard still sees the leading "=".
    expect(csvCell("\u0001=1+1")).toBe("'=1+1");
    expect(csvCell("\u001b[31mred\u001b[0m")).toBe("[31mred[0m");
    expect(csvCell("a￾b￿c")).toBe("abc");
    // Tab, line feed and carriage return are data, not noise.
    expect(csvCell("a\tb")).toBe("a\tb");
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("a\u007fb")).toBe("a\u007fb");

    const bytes = new TextEncoder().encode(serializeCsv([["Notes"], ["\u0007Call first\u0000"]]));
    expect(bytes).not.toContain(0x07);
    expect(bytes).not.toContain(0x00);
    expect(new TextDecoder().decode(bytes)).toContain("Call first\r\n");
  });
});
