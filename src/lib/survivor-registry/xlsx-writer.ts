import { deflateRawSync } from "node:zlib";

/**
 * A write-only counterpart to xlsx-reader.ts: the smallest OOXML package that
 * Excel, Numbers, Google Sheets and LibreOffice open without a repair prompt.
 * Like the reader it exists instead of a spreadsheet dependency (see the note
 * at the top of xlsx-reader.ts).
 *
 * Every cell is written as a shared string (t="s") with the Text number
 * format. Nothing is ever a formula or a number, so a ZIP code keeps its
 * leading zero, a phone number keeps its plus sign, and a value such as
 * "=SUM(A1)" is shown as typed rather than evaluated. Shared strings are used
 * instead of inline strings because some non-Excel readers handle inline
 * strings poorly; the registry importer reads both.
 */

const SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Excel refuses a cell longer than this and reports the workbook as damaged. */
export const XLSX_MAX_CELL_CHARACTERS = 32_767;
/** The worksheet grid's hard limits. */
const XLSX_MAX_ROWS = 1_048_576;
const XLSX_MAX_COLUMNS = 16_384;

const BODY_STYLE = 1;
const HEADER_STYLE = 2;

export interface WorkbookWriteInput {
  /** Tab name; reduced to what a sheet name may contain (31 characters, no []:*?/\). */
  sheetName: string;
  /** Rows of text cells. The first row is the header and is written in bold. */
  rows: readonly (readonly string[])[];
}

/**
 * Removes everything XML 1.0 cannot carry (control characters other than tab
 * and newline, lone surrogates, U+FFFE/U+FFFF). Carriage returns become line
 * feeds because an XML parser would normalise them anyway.
 */
export function sanitizeXmlText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[^\u0009\u000A -퟿-�\u{10000}-\u{10FFFF}]/gu, "");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Cell text as it appears inside <t>. SpreadsheetML reads "_x0041_" as an
 * escaped character, so a literal underscore that would start such a sequence
 * is itself escaped to keep the text exactly as stored.
 */
function cellText(value: string): string {
  let clean = sanitizeXmlText(value);
  if (clean.length > XLSX_MAX_CELL_CHARACTERS) {
    // A cut between the two halves of a surrogate pair leaves a lone half
    // behind; sanitising once more removes it.
    clean = sanitizeXmlText(clean.slice(0, XLSX_MAX_CELL_CHARACTERS));
  }
  return escapeXml(clean.replace(/_(?=x[0-9A-Fa-f]{4}_)/g, "_x005F_"));
}

function columnLetters(index: number): string {
  let letters = "";
  for (let remaining = index + 1; remaining > 0; remaining = Math.floor((remaining - 1) / 26)) {
    letters = String.fromCharCode(65 + ((remaining - 1) % 26)) + letters;
  }
  return letters;
}

function safeSheetName(value: string): string {
  const cleaned = sanitizeXmlText(value)
    .replace(/[\[\]:*?/\\\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .slice(0, 31)
    .trim();
  return cleaned || "Sheet1";
}

function columnWidths(rows: readonly (readonly string[])[], columnCount: number): number[] {
  const widths = new Array<number>(columnCount).fill(0);
  for (const row of rows) {
    for (let column = 0; column < columnCount; column += 1) {
      const value = row[column] ?? "";
      let longestLine = 0;
      for (const line of value.split("\n")) longestLine = Math.max(longestLine, line.length);
      if (longestLine > widths[column]) widths[column] = longestLine;
    }
  }
  return widths.map((length) => Math.min(60, Math.max(10, length + 2)));
}

function contentTypesXml(): string {
  return (
    XML_DECLARATION +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    "</Types>"
  );
}

function packageRelationshipsXml(): string {
  return (
    XML_DECLARATION +
    `<Relationships xmlns="${PACKAGE_RELATIONSHIPS_NS}">` +
    `<Relationship Id="rId1" Type="${RELATIONSHIPS_NS}/officeDocument" Target="xl/workbook.xml"/>` +
    "</Relationships>"
  );
}

function workbookXml(sheetName: string): string {
  return (
    XML_DECLARATION +
    `<workbook xmlns="${SPREADSHEET_NS}" xmlns:r="${RELATIONSHIPS_NS}">` +
    "<bookViews><workbookView/></bookViews>" +
    `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    "</workbook>"
  );
}

function workbookRelationshipsXml(): string {
  return (
    XML_DECLARATION +
    `<Relationships xmlns="${PACKAGE_RELATIONSHIPS_NS}">` +
    `<Relationship Id="rId1" Type="${RELATIONSHIPS_NS}/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="${RELATIONSHIPS_NS}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId3" Type="${RELATIONSHIPS_NS}/sharedStrings" Target="sharedStrings.xml"/>` +
    "</Relationships>"
  );
}

/**
 * Three cell formats: the default, body text (number format 49, "Text") and a
 * bold header. The Text format keeps a ZIP code a ZIP code when someone later
 * retypes it in the downloaded file.
 */
function stylesXml(): string {
  return (
    XML_DECLARATION +
    `<styleSheet xmlns="${SPREADSHEET_NS}">` +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    "</fonts>" +
    '<fills count="2">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    "</fills>" +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>"
  );
}

interface SheetParts {
  sheet: string;
  sharedStrings: string;
}

function sheetParts(rows: readonly (readonly string[])[]): SheetParts {
  const columnCount = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  const stringIndexes = new Map<string, number>();
  const strings: string[] = [];
  let references = 0;

  let sheetData = "";
  rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const style = rowIndex === 0 ? HEADER_STYLE : BODY_STYLE;
    let cells = "";
    row.forEach((value, columnIndex) => {
      const text = cellText(value);
      // An empty cell is simply absent, as in a workbook saved by Excel.
      if (!text) return;
      let index = stringIndexes.get(text);
      if (index === undefined) {
        index = strings.length;
        strings.push(text);
        stringIndexes.set(text, index);
      }
      references += 1;
      cells += `<c r="${columnLetters(columnIndex)}${rowNumber}" s="${style}" t="s"><v>${index}</v></c>`;
    });
    sheetData += `<row r="${rowNumber}">${cells}</row>`;
  });

  const lastCell = `${columnLetters(Math.max(columnCount, 1) - 1)}${Math.max(rows.length, 1)}`;
  const cols = columnCount
    ? `<cols>${columnWidths(rows, columnCount)
        .map(
          (width, index) =>
            `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
        )
        .join("")}</cols>`
    : "";

  const sheet =
    XML_DECLARATION +
    `<worksheet xmlns="${SPREADSHEET_NS}">` +
    `<dimension ref="A1:${lastCell}"/>` +
    // The header row stays in view while the list scrolls.
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' +
    "</sheetView></sheetViews>" +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${sheetData}</sheetData>` +
    "</worksheet>";

  const sharedStrings =
    XML_DECLARATION +
    `<sst xmlns="${SPREADSHEET_NS}" count="${references}" uniqueCount="${strings.length}">` +
    strings.map((text) => `<si><t xml:space="preserve">${text}</t></si>`).join("") +
    "</sst>";

  return { sheet, sharedStrings };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipPart {
  name: string;
  content: string;
}

// 1980-01-01 00:00, the earliest timestamp the format can hold. A fixed value
// keeps the output identical for identical input.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const DEFLATE = 8;
const VERSION_NEEDED = 20;

function zip(parts: readonly ZipPart[]): Buffer {
  const localChunks: Buffer[] = [];
  const directoryChunks: Buffer[] = [];
  let offset = 0;

  for (const part of parts) {
    const name = Buffer.from(part.name, "utf8");
    const raw = Buffer.from(part.content, "utf8");
    const compressed = deflateRawSync(raw);
    const checksum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(DEFLATE, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localChunks.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION_NEEDED, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(DEFLATE, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    directoryChunks.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const directory = Buffer.concat(directoryChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, directory, end]);
}

/** Builds a single-sheet .xlsx workbook of text cells with a bold, frozen header row. */
export function writeWorkbook(input: WorkbookWriteInput): Uint8Array<ArrayBuffer> {
  if (input.rows.length > XLSX_MAX_ROWS) {
    throw new RangeError("A worksheet cannot hold this many rows.");
  }
  if (input.rows.some((row) => row.length > XLSX_MAX_COLUMNS)) {
    throw new RangeError("A worksheet cannot hold this many columns.");
  }
  const { sheet, sharedStrings } = sheetParts(input.rows);
  const archive = zip([
    { name: "[Content_Types].xml", content: contentTypesXml() },
    { name: "_rels/.rels", content: packageRelationshipsXml() },
    { name: "xl/workbook.xml", content: workbookXml(safeSheetName(input.sheetName)) },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelationshipsXml() },
    { name: "xl/worksheets/sheet1.xml", content: sheet },
    { name: "xl/styles.xml", content: stylesXml() },
    { name: "xl/sharedStrings.xml", content: sharedStrings },
  ]);
  // A copy with its own ArrayBuffer: the Buffer above may be a view onto
  // Node's shared allocation pool.
  const bytes = new Uint8Array(archive.byteLength);
  bytes.set(archive);
  return bytes;
}
