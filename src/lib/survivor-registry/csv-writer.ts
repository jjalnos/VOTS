/**
 * CSV serialisation for registry downloads: UTF-8 with a byte-order mark (so
 * Excel reads accents and Hebrew correctly), CRLF record endings and RFC 4180
 * quoting.
 */

export const CSV_BYTE_ORDER_MARK = "﻿";

const FORMULA_LEADERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * A spreadsheet treats a cell that begins with = + - or @ as a formula, and
 * strips a leading tab or carriage return before making that decision. Any
 * value that starts with one of those characters gets a leading apostrophe so
 * it is read as text.
 *
 * Nothing is removed from the value: a phone number such as "+1 210 555 0100"
 * becomes "'+1 210 555 0100" and keeps every digit and its plus sign. Without
 * the apostrophe Excel would evaluate it ("+1-210-555-0100" turns into -864)
 * or drop the plus sign.
 */
export function guardCsvCell(value: string): string {
  return value.length > 0 && FORMULA_LEADERS.has(value[0]) ? `'${value}` : value;
}

function quoteCsvCell(value: string): string {
  return /[",\r\n]/.test(value) || /^\s|\s$/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

/**
 * C0 control characters other than tab, line feed and carriage return. A
 * workbook import can carry them into a record; the XLSX writer already drops
 * the same set, so both downloads of one record read alike. (DEL, U+007F, is
 * legal in XML and kept by both.)
 */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/**
 * One CSV field: control characters removed, then the formula guard, then
 * RFC 4180 quoting. Removal comes first so a value such as "\u0001=1+1" is
 * still seen to begin with "=".
 */
export function csvCell(value: string): string {
  return quoteCsvCell(guardCsvCell(value.replace(CONTROL_CHARACTERS, "")));
}

/**
 * Serialises rows (the first is the header) to a CSV document. Every record,
 * including the last, ends with CRLF.
 */
export function serializeCsv(rows: readonly (readonly string[])[]): string {
  let output = CSV_BYTE_ORDER_MARK;
  for (const row of rows) {
    output += `${row.map(csvCell).join(",")}\r\n`;
  }
  return output;
}
