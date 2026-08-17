import { inflateRawSync } from "node:zlib";

/**
 * A bounded reader for the small subset of the XLSX format this archive needs:
 * sheet values, shared strings, and font colour per cell. It exists instead of
 * a spreadsheet dependency because workbook uploads are untrusted input and the
 * npm-published SheetJS builds carry a prototype-pollution advisory
 * (CVE-2023-30533). Everything here is read-only string handling.
 */

export const XLSX_MAX_BYTES = 12 * 1024 * 1024;
const MAX_ENTRIES = 512;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_ROWS = 20_000;
const MAX_COLUMNS = 64;

export class WorkbookFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkbookFormatError";
  }
}

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function readZipEntries(buffer: Buffer): Map<string, ZipEntry> {
  const EOCD_SIGNATURE = 0x06054b50;
  let eocd = -1;
  const scanFloor = Math.max(0, buffer.length - 66_000);
  for (let offset = buffer.length - 22; offset >= scanFloor; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new WorkbookFormatError("This file is not a readable .xlsx workbook.");

  const entryCount = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount > MAX_ENTRIES) {
    throw new WorkbookFormatError("This workbook contains more parts than the importer accepts.");
  }

  const entries = new Map<string, ZipEntry>();
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (uncompressedSize <= MAX_ENTRY_BYTES) {
      entries.set(name, {
        name,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      });
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntryText(buffer: Buffer, entry: ZipEntry | undefined): string {
  if (!entry) return "";
  const header = entry.localHeaderOffset;
  if (header + 30 > buffer.length || buffer.readUInt32LE(header) !== 0x04034b50) return "";
  const nameLength = buffer.readUInt16LE(header + 26);
  const extraLength = buffer.readUInt16LE(header + 28);
  const start = header + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > buffer.length) return "";
  const raw = buffer.subarray(start, end);
  if (entry.compressionMethod === 0) return raw.toString("utf8");
  if (entry.compressionMethod !== 8) return "";
  try {
    return inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES }).toString("utf8");
  } catch {
    return "";
  }
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXmlText(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

function readSharedStrings(xml: string): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  // The attribute class is lazy so a self-closing tag cannot consume its own
  // slash and then swallow the following element's contents.
  for (const match of xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) {
    const inner = match[1] ?? "";
    let text = "";
    for (const piece of inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
      text += decodeXmlText(piece[1]);
    }
    strings.push(text);
  }
  return strings;
}

/** Style indexes whose font colour is one of the workbook's red inks. */
function readRedStyleIndexes(xml: string): Set<number> {
  const red = new Set<number>();
  if (!xml) return red;
  const REDS = new Set(["FFC00000", "FFFF0000", "FFEA4335", "FFD00000", "FFCC0000"]);
  const fontBlocks = xml.match(/<font\/>|<font>[\s\S]*?<\/font>/g) ?? [];
  const redFonts = new Set<number>();
  fontBlocks.forEach((font, index) => {
    const colour = /<color[^>]*\brgb="([0-9A-Fa-f]{8})"/.exec(font);
    const struck = /<strike\b/.test(font);
    if (struck || (colour && REDS.has(colour[1].toUpperCase()))) redFonts.add(index);
  });
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!cellXfs) return red;
  const xfs = cellXfs[1].match(/<xf\b[^>]*\/?>/g) ?? [];
  xfs.forEach((xf, index) => {
    const fontId = /\bfontId="(\d+)"/.exec(xf);
    if (fontId && redFonts.has(Number(fontId[1]))) red.add(index);
  });
  return red;
}

/** Style indexes formatted as a date, so serial numbers can be read as dates. */
function readDateStyleIndexes(xml: string): Set<number> {
  const dateStyles = new Set<number>();
  if (!xml) return dateStyles;
  const BUILT_IN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  const customDateFormats = new Set<number>();
  for (const match of xml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const code = decodeXmlText(match[2]).toLowerCase();
    const stripped = code.replace(/\[[^\]]*\]/g, "").replace(/"[^"]*"/g, "");
    if (/[dmyh]/.test(stripped) && !/^[^dmy]*$/.test(stripped)) {
      customDateFormats.add(Number(match[1]));
    }
  }
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!cellXfs) return dateStyles;
  const xfs = cellXfs[1].match(/<xf\b[^>]*\/?>/g) ?? [];
  xfs.forEach((xf, index) => {
    const numFmtId = /\bnumFmtId="(\d+)"/.exec(xf);
    if (!numFmtId) return;
    const id = Number(numFmtId[1]);
    if (BUILT_IN_DATES.has(id) || customDateFormats.has(id)) dateStyles.add(index);
  });
  return dateStyles;
}

/** Excel serial day number to an ISO date, accounting for the 1900 leap-year bug. */
export function excelSerialToIsoDate(serial: number): string {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 2_958_465) return "";
  const whole = Math.floor(serial);
  const adjusted = whole > 60 ? whole - 1 : whole;
  const epoch = Date.UTC(1899, 11, 31);
  const date = new Date(epoch + adjusted * 86_400_000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function columnIndexFromReference(reference: string): number {
  const letters = /^([A-Za-z]+)/.exec(reference);
  if (!letters) return -1;
  let index = 0;
  for (const character of letters[1].toUpperCase()) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index - 1;
}

export interface WorkbookCell {
  value: string;
  /** True when the cell's font is one of the workbook's red inks or struck through. */
  red: boolean;
}

export interface WorkbookSheet {
  name: string;
  rows: WorkbookCell[][];
}

const EMPTY_CELL: WorkbookCell = { value: "", red: false };

function parseSheet(
  xml: string,
  sharedStrings: string[],
  redStyles: Set<number>,
  dateStyles: Set<number>,
): WorkbookCell[][] {
  const rows: WorkbookCell[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    if (rows.length >= MAX_ROWS) break;
    const cells: WorkbookCell[] = [];
    const inner = rowMatch[1] ?? "";
    for (const cellMatch of inner.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const reference = /\br="([A-Z]+\d+)"/i.exec(attributes);
      const column = reference ? columnIndexFromReference(reference[1]) : cells.length;
      if (column < 0 || column >= MAX_COLUMNS) continue;
      const styleMatch = /\bs="(\d+)"/.exec(attributes);
      const styleIndex = styleMatch ? Number(styleMatch[1]) : -1;
      const typeMatch = /\bt="([^"]+)"/.exec(attributes);
      const type = typeMatch ? typeMatch[1] : "n";

      let value = "";
      if (type === "inlineStr") {
        for (const piece of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
          value += decodeXmlText(piece[1]);
        }
      } else {
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
        const rawValue = raw ? decodeXmlText(raw[1]) : "";
        if (type === "s") {
          const index = Number(rawValue);
          value = Number.isInteger(index) ? (sharedStrings[index] ?? "") : "";
        } else if (type === "b") {
          value = rawValue === "1" ? "TRUE" : "FALSE";
        } else if (rawValue && dateStyles.has(styleIndex) && /^-?\d+(\.\d+)?$/.test(rawValue)) {
          value = excelSerialToIsoDate(Number(rawValue));
        } else {
          // Some writers store whole numbers as "78255.0"; a ZIP code should not
          // gain a decimal point on the way in. Only an all-zero fraction is
          // dropped, so genuine decimals survive untouched.
          value = rawValue.replace(/^(-?\d+)\.0+$/, "$1");
        }
      }

      while (cells.length < column) cells.push(EMPTY_CELL);
      cells[column] = { value: value.trim(), red: redStyles.has(styleIndex) };
    }
    rows.push(cells);
  }
  return rows;
}

export interface ReadWorkbookResult {
  sheets: WorkbookSheet[];
}

export function readWorkbook(input: Uint8Array): ReadWorkbookResult {
  if (input.byteLength > XLSX_MAX_BYTES) {
    throw new WorkbookFormatError("This workbook is larger than the importer accepts.");
  }
  const buffer = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const entries = readZipEntries(buffer);
  if (!entries.has("xl/workbook.xml")) {
    throw new WorkbookFormatError("This file is not a readable .xlsx workbook.");
  }

  const workbookXml = readEntryText(buffer, entries.get("xl/workbook.xml"));
  const relsXml = readEntryText(buffer, entries.get("xl/_rels/workbook.xml.rels"));
  const sharedStrings = readSharedStrings(readEntryText(buffer, entries.get("xl/sharedStrings.xml")));
  const stylesXml = readEntryText(buffer, entries.get("xl/styles.xml"));
  const redStyles = readRedStyleIndexes(stylesXml);
  const dateStyles = readDateStyleIndexes(stylesXml);

  const relationships = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = /\bId="([^"]+)"/.exec(match[0]);
    const target = /\bTarget="([^"]+)"/.exec(match[0]);
    if (id && target) relationships.set(id[1], target[1]);
  }

  const sheets: WorkbookSheet[] = [];
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = /\bname="([^"]*)"/.exec(match[0]);
    const relationshipId = /\br:id="([^"]+)"/.exec(match[0]);
    if (!name) continue;
    const target = relationshipId ? relationships.get(relationshipId[1]) : undefined;
    const path = target
      ? `xl/${target.replace(/^\/?xl\//, "").replace(/^\//, "")}`
      : `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const sheetXml = readEntryText(buffer, entries.get(path));
    if (!sheetXml) continue;
    sheets.push({
      name: decodeXmlText(name[1]),
      rows: parseSheet(sheetXml, sharedStrings, redStyles, dateStyles),
    });
  }

  if (!sheets.length) {
    throw new WorkbookFormatError("This workbook has no readable sheets.");
  }
  return { sheets };
}
