import {
  readWorkbook,
  WorkbookFormatError,
  type WorkbookCell,
  type WorkbookSheet,
} from "@/lib/survivor-registry/xlsx-reader";
import type { RegistryGeneration, RegistryPerson } from "@/lib/survivor-registry/types";

export { WorkbookFormatError };

/** Robin's generation labels, including the abbreviations and casing drift in her workbook. */
const GENERATION_ALIASES = new Map<string, RegistryGeneration>([
  ["survivor", "survivor"],
  ["survi", "survivor"],
  ["survivor spouse", "survivor-spouse"],
  ["2nd gen", "2nd-gen"],
  ["2nd gen spouse", "2nd-gen-spouse"],
  ["3rd gen", "3rd-gen"],
  ["3rd gen spouse", "3rd-gen-spouse"],
  ["4th gen", "4th-gen"],
  ["4th gen spouse", "4th-gen-spouse"],
  ["indirect", "indirect"],
  ["indirect spouse", "indirect-spouse"],
  ["austin contact", "contact"],
  ["contact", "contact"],
]);

const CAMP_NAMES = new Map<string, string>([
  ["bb", "Bergen-Belsen"],
  ["bergen belsen", "Bergen-Belsen"],
  ["bergen-belsen", "Bergen-Belsen"],
  ["auschwitz", "Auschwitz"],
  ["theresienstadt", "Theresienstadt"],
  ["mauthausen", "Mauthausen"],
  ["buchenwald", "Buchenwald"],
  ["karya", "Karya"],
  ["dachau", "Dachau"],
  ["treblinka", "Treblinka"],
  ["majdanek", "Majdanek"],
  ["sobibor", "Sobibor"],
  ["ravensbruck", "Ravensbrück"],
]);

/** Column values that record how someone survived rather than where they were held. */
const FATE_WORDS = new Set([
  "hid",
  "hidden",
  "in hiding",
  "fled",
  "escaped",
  "partisan",
  "resistance",
  "kindertransport",
]);

const HEADER_ALIASES: Record<string, string[]> = {
  generation: ["gen", "generation"],
  title: ["title"],
  firstName: ["first name", "first"],
  lastName: ["last name", "last", "surname"],
  countryOfOrigin: ["country of origin", "country", "origin"],
  dateOfBirth: ["date of birth", "dob", "birth date", "born"],
  dateOfDeath: ["date of death", "dod", "death date", "died"],
  familyThread: ["parent/grandparent", "parent / grandparent", "parent", "family"],
  camps: ["concentration camp", "concentration camps", "camp", "camps"],
  address: ["address", "street", "address 1"],
  city: ["city"],
  state: ["state"],
  zip: ["zip", "zip code", "postal code"],
  email: ["email", "e-mail", "email address"],
  phone: ["phone", "telephone", "phone number", "cell"],
};

export interface WorkbookImportRow {
  person: Omit<RegistryPerson, "notes" | "source" | "createdAt" | "updatedAt">;
  sourceRow: number;
}

export interface WorkbookSheetReport {
  name: string;
  people: number;
  /** Rows whose generation label the importer recognized. */
  classified: number;
  selected: boolean;
  reason?: string;
}

export interface WorkbookImportPreview {
  sheetName: string;
  sheets: WorkbookSheetReport[];
  rows: WorkbookImportRow[];
  totals: {
    people: number;
    survivors: number;
    deceased: number;
    families: number;
    withEmail: number;
    withCamps: number;
  };
  warnings: string[];
}

function cellValue(row: WorkbookCell[], index: number): string {
  if (index < 0) return "";
  return row[index]?.value ?? "";
}

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ").replace(/[.:]+$/, "");
}

function findHeaderRow(sheet: WorkbookSheet): number {
  for (let index = 0; index < Math.min(sheet.rows.length, 40); index += 1) {
    const headers = sheet.rows[index].map((cell) => normalizeHeader(cell.value));
    const hasName = headers.some((header) => HEADER_ALIASES.firstName.includes(header)) ||
      headers.some((header) => HEADER_ALIASES.lastName.includes(header));
    if (hasName) return index;
  }
  return -1;
}

function columnMap(headerRow: WorkbookCell[]): Record<string, number> {
  const headers = headerRow.map((cell) => normalizeHeader(cell.value));
  const map: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    map[field] = headers.findIndex((header) => header && aliases.includes(header));
  }
  return map;
}

/**
 * Excel stores a bare two-digit year as this century, so a survivor born in
 * 1925 arrives as 2025. Pull those back a hundred years; leave anything a
 * curator could plausibly have meant alone.
 */
function correctCentury(iso: string, generation: RegistryGeneration, isDeath: boolean): string {
  const match = /^(\d{4})(-\d{2}-\d{2})$/.exec(iso);
  if (!match) return iso;
  let year = Number(match[1]);
  const survivorTier = generation === "survivor" || generation === "survivor-spouse";
  if (year > 2026) year -= 100;
  else if (!isDeath && survivorTier && year > 1945) year -= 100;
  return `${year}${match[2]}`;
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (slash) {
    const month = slash[1].padStart(2, "0");
    const day = slash[2].padStart(2, "0");
    const rawYear = Number(slash[3]);
    const year = slash[3].length <= 2 ? (rawYear > 30 ? 1900 + rawYear : 2000 + rawYear) : rawYear;
    return `${year}-${month}-${day}`;
  }
  return trimmed.slice(0, 40);
}

function splitCamps(value: string): { camps: string[]; fateNotes: string[] } {
  const camps: string[] = [];
  const fateNotes: string[] = [];
  for (const part of value.split(/[,;/]/).map((piece) => piece.trim()).filter(Boolean)) {
    const key = part.toLocaleLowerCase("en");
    if (FATE_WORDS.has(key)) fateNotes.push(key);
    else camps.push(CAMP_NAMES.get(key) ?? part);
  }
  return { camps, fateNotes };
}

function slugify(first: string, last: string, fallback: number): string {
  const base = `${first} ${last}`
    .toLocaleLowerCase("en")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `person-${fallback}`;
}

function readSheet(sheet: WorkbookSheet): { rows: WorkbookImportRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const headerIndex = findHeaderRow(sheet);
  if (headerIndex < 0) return { rows: [], warnings };
  const columns = columnMap(sheet.rows[headerIndex]);
  const slugCounts = new Map<string, number>();
  const rows: WorkbookImportRow[] = [];

  for (let index = headerIndex + 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    const rawFirst = cellValue(row, columns.firstName);
    const rawLast = cellValue(row, columns.lastName);
    if (!rawFirst && !rawLast) continue;

    const firstName = rawFirst.replace(/\*/g, "").trim();
    const lastName = rawLast.replace(/\*/g, "").trim();
    const starred = rawFirst.includes("*") || rawLast.includes("*");
    const redInk =
      (columns.firstName >= 0 && row[columns.firstName]?.red === true) ||
      (columns.lastName >= 0 && row[columns.lastName]?.red === true);

    const generationRaw = cellValue(row, columns.generation);
    const generation =
      GENERATION_ALIASES.get(normalizeHeader(generationRaw)) ?? "unclassified";
    if (generationRaw && generation === "unclassified") {
      warnings.push(`Row ${index + 1}: generation "${generationRaw}" was not recognized.`);
    }

    const { camps, fateNotes } = splitCamps(cellValue(row, columns.camps));
    const dateOfDeath = correctCentury(
      normalizeDate(cellValue(row, columns.dateOfDeath)),
      generation,
      true,
    );
    const slugBase = slugify(firstName, lastName, index + 1);
    const seen = slugCounts.get(slugBase) ?? 0;
    slugCounts.set(slugBase, seen + 1);

    rows.push({
      sourceRow: index + 1,
      person: {
        id: seen === 0 ? slugBase : `${slugBase}-${seen + 1}`,
        firstName,
        lastName,
        title: cellValue(row, columns.title),
        generation,
        generationRaw,
        familyThread: cellValue(row, columns.familyThread),
        familyKey: "",
        countryOfOrigin: cellValue(row, columns.countryOfOrigin),
        dateOfBirth: correctCentury(
          normalizeDate(cellValue(row, columns.dateOfBirth)),
          generation,
          false,
        ),
        dateOfDeath,
        camps,
        fateNotes,
        address: cellValue(row, columns.address),
        city: cellValue(row, columns.city),
        state: cellValue(row, columns.state),
        zip: cellValue(row, columns.zip),
        email: cellValue(row, columns.email),
        phone: cellValue(row, columns.phone),
        deceased: redInk || starred || Boolean(dateOfDeath),
        deceasedSource: redInk
          ? "red-font"
          : starred
            ? "asterisk"
            : dateOfDeath
              ? "date-of-death"
              : "",
      },
    });
  }

  // Family grouping: a survivor's surname anchors a thread; everyone sharing it
  // joins, and the rest fall back to Robin's free-text parent reference.
  const survivorSurnames = new Set(
    rows
      .filter((row) => row.person.generation === "survivor" && row.person.lastName)
      .map((row) => row.person.lastName.toLocaleLowerCase("en")),
  );
  for (const row of rows) {
    const surname = row.person.lastName;
    row.person.familyKey = surname && survivorSurnames.has(surname.toLocaleLowerCase("en"))
      ? surname
      : row.person.familyThread || surname || "Unlinked";
  }

  return { rows, warnings };
}

export function previewWorkbookImport(input: Uint8Array): WorkbookImportPreview {
  const workbook = readWorkbook(input);
  const reports: WorkbookSheetReport[] = [];
  let best:
    | { sheet: WorkbookSheet; rows: WorkbookImportRow[]; warnings: string[]; classified: number }
    | null = null;

  for (const sheet of workbook.sheets) {
    const parsed = readSheet(sheet);
    const classified = parsed.rows.filter(
      (row) => row.person.generation !== "unclassified",
    ).length;
    reports.push({
      name: sheet.name,
      people: parsed.rows.length,
      classified,
      selected: false,
    });
    // Robin keeps the same people on several sheets; the one that also records
    // which generation each person belongs to is her working copy.
    const better =
      !best ||
      classified > best.classified ||
      (classified === best.classified && parsed.rows.length > best.rows.length);
    if (better) {
      best = { sheet, rows: parsed.rows, warnings: parsed.warnings, classified };
    }
  }

  if (!best || !best.rows.length) {
    throw new WorkbookFormatError(
      "No sheet in this workbook has First Name and Last Name columns the importer can read.",
    );
  }

  const chosen = best;
  const selected = reports.find((report) => report.name === chosen.sheet.name);
  if (selected) selected.selected = true;
  for (const report of reports) {
    if (report.selected) continue;
    report.reason = !report.people
      ? "No readable name columns."
      : report.classified < chosen.classified
        ? "Does not record a generation for each person."
        : "Fewer people than the sheet chosen below.";
  }

  const rows = best.rows;
  const warnings = best.warnings.slice(0, 25);
  if (best.warnings.length > 25) {
    warnings.push(`…and ${best.warnings.length - 25} more rows with unrecognized labels.`);
  }

  return {
    sheetName: best.sheet.name,
    sheets: reports,
    rows,
    totals: {
      people: rows.length,
      survivors: rows.filter((row) => row.person.generation === "survivor").length,
      deceased: rows.filter((row) => row.person.deceased).length,
      families: new Set(rows.map((row) => row.person.familyKey)).size,
      withEmail: rows.filter((row) => row.person.email).length,
      withCamps: rows.filter((row) => row.person.camps.length).length,
    },
    warnings,
  };
}

export interface WorkbookImportChange {
  id: string;
  name: string;
  kind: "new" | "updated" | "unchanged";
  changedFields: string[];
}

const COMPARED_FIELDS = [
  "firstName",
  "lastName",
  "title",
  "generation",
  "familyThread",
  "familyKey",
  "countryOfOrigin",
  "dateOfBirth",
  "dateOfDeath",
  "address",
  "city",
  "state",
  "zip",
  "email",
  "phone",
  "deceased",
] as const;

/**
 * Compares an upload against what the registry already holds. Curator notes and
 * hand-entered records are never part of the comparison: an import may add and
 * correct, but it does not erase Robin's own work.
 */
export function diffWorkbookImport(
  rows: WorkbookImportRow[],
  existing: RegistryPerson[],
): WorkbookImportChange[] {
  const byId = new Map(existing.map((person) => [person.id, person]));
  return rows.map((row) => {
    const current = byId.get(row.person.id);
    const name = `${row.person.firstName} ${row.person.lastName}`.trim();
    if (!current) return { id: row.person.id, name, kind: "new" as const, changedFields: [] };
    const changedFields: string[] = [];
    for (const field of COMPARED_FIELDS) {
      const next = row.person[field];
      const previous = current[field];
      if (String(next ?? "") !== String(previous ?? "")) changedFields.push(field);
    }
    const campsChanged =
      row.person.camps.join("|") !== current.camps.join("|") ||
      row.person.fateNotes.join("|") !== current.fateNotes.join("|");
    if (campsChanged) changedFields.push("camps");
    return {
      id: row.person.id,
      name,
      kind: changedFields.length ? ("updated" as const) : ("unchanged" as const),
      changedFields,
    };
  });
}

/** Merges an imported row over an existing record, preserving curator-only fields. */
export function mergeImportedPerson(
  row: WorkbookImportRow,
  current: RegistryPerson | undefined,
  importedAt: string,
): RegistryPerson {
  return {
    ...row.person,
    notes: current?.notes ?? "",
    source: current?.source === "curator" ? "curator" : "workbook-import",
    createdAt: current?.createdAt ?? importedAt,
    updatedAt: importedAt,
  };
}
