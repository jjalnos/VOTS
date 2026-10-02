import type { Locale } from "@/lib/domain/types";
import { redactRegistryContact } from "@/lib/survivor-registry/store";
import type { RegistryGeneration, RegistryPerson } from "@/lib/survivor-registry/types";

/**
 * The shape of a registry download: which columns exist, what they are called
 * in each language, and how a person becomes a row of text. The CSV and XLSX
 * writers only ever see the strings produced here.
 */

export const REGISTRY_EXPORT_FORMATS = ["csv", "xlsx"] as const;
export type RegistryExportFormat = (typeof REGISTRY_EXPORT_FORMATS)[number];

export function isRegistryExportFormat(value: unknown): value is RegistryExportFormat {
  return (REGISTRY_EXPORT_FORMATS as readonly unknown[]).includes(value);
}

export const REGISTRY_EXPORT_CONTENT_TYPES: Record<RegistryExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** The same wording the registry page uses for each generation. */
const GENERATION_LABELS: Record<RegistryGeneration, Record<Locale, string>> = {
  survivor: { en: "Survivor", es: "Sobreviviente" },
  "survivor-spouse": { en: "Survivor's spouse", es: "Cónyuge de sobreviviente" },
  "2nd-gen": { en: "2nd generation", es: "2.ª generación" },
  "2nd-gen-spouse": { en: "2nd gen spouse", es: "Cónyuge 2.ª gen" },
  "3rd-gen": { en: "3rd generation", es: "3.ª generación" },
  "3rd-gen-spouse": { en: "3rd gen spouse", es: "Cónyuge 3.ª gen" },
  "4th-gen": { en: "4th generation", es: "4.ª generación" },
  "4th-gen-spouse": { en: "4th gen spouse", es: "Cónyuge 4.ª gen" },
  indirect: { en: "Indirect", es: "Indirecto" },
  "indirect-spouse": { en: "Indirect spouse", es: "Cónyuge indirecto" },
  contact: { en: "Contact", es: "Contacto" },
  unclassified: { en: "Unclassified", es: "Sin clasificar" },
};

const YES_NO: Record<Locale, { yes: string; no: string }> = {
  en: { yes: "Yes", no: "No" },
  es: { yes: "Sí", no: "No" },
};

const SHEET_NAMES: Record<Locale, string> = {
  en: "Survivor registry",
  es: "Registro",
};

const LIST_SEPARATOR = "; ";

interface RegistryExportColumn {
  key: string;
  header: Record<Locale, string>;
  /**
   * True for what a read-only account never sees on the registry page: the
   * fields redactRegistryContact blanks, and the life dates, which the page
   * shows to nobody. These columns do not exist at all in a download made by
   * such an account.
   */
  curatorOnly: boolean;
  value(person: RegistryPerson, locale: Locale): string;
}

const COLUMNS: readonly RegistryExportColumn[] = [
  {
    key: "lastName",
    header: { en: "Last name", es: "Apellido" },
    curatorOnly: false,
    value: (person) => person.lastName,
  },
  {
    key: "firstName",
    header: { en: "First name", es: "Nombre" },
    curatorOnly: false,
    value: (person) => person.firstName,
  },
  {
    key: "title",
    header: { en: "Title", es: "Título" },
    curatorOnly: false,
    value: (person) => person.title,
  },
  {
    key: "generation",
    header: { en: "Generation", es: "Generación" },
    curatorOnly: false,
    value: (person, locale) =>
      GENERATION_LABELS[person.generation]?.[locale] ?? person.generation,
  },
  {
    key: "family",
    header: { en: "Family", es: "Familia" },
    curatorOnly: false,
    // The page shows a dash for people who are not linked to a family.
    value: (person) => (person.familyKey && person.familyKey !== "Unlinked" ? person.familyKey : ""),
  },
  {
    key: "countryOfOrigin",
    header: { en: "Country of origin", es: "País de origen" },
    curatorOnly: false,
    value: (person) => person.countryOfOrigin,
  },
  {
    key: "dateOfBirth",
    header: { en: "Date of birth", es: "Fecha de nacimiento" },
    curatorOnly: true,
    value: (person) => person.dateOfBirth,
  },
  {
    key: "dateOfDeath",
    header: { en: "Date of death", es: "Fecha de fallecimiento" },
    curatorOnly: true,
    value: (person) => person.dateOfDeath,
  },
  {
    key: "deceased",
    header: { en: "Deceased", es: "Fallecida/o" },
    curatorOnly: false,
    value: (person, locale) => (person.deceased ? YES_NO[locale].yes : YES_NO[locale].no),
  },
  {
    key: "camps",
    header: { en: "Camps", es: "Campos" },
    curatorOnly: false,
    value: (person) => person.camps.join(LIST_SEPARATOR),
  },
  {
    key: "fateNotes",
    header: { en: "Fate notes", es: "Notas de destino" },
    curatorOnly: false,
    value: (person) => person.fateNotes.join(LIST_SEPARATOR),
  },
  {
    key: "city",
    header: { en: "City", es: "Ciudad" },
    curatorOnly: false,
    value: (person) => person.city,
  },
  {
    key: "state",
    header: { en: "State", es: "Estado" },
    curatorOnly: false,
    value: (person) => person.state,
  },
  {
    key: "address",
    header: { en: "Address", es: "Dirección" },
    curatorOnly: true,
    value: (person) => person.address,
  },
  {
    key: "zip",
    header: { en: "ZIP", es: "Código postal" },
    curatorOnly: true,
    value: (person) => person.zip,
  },
  {
    key: "email",
    header: { en: "Email", es: "Correo" },
    curatorOnly: true,
    value: (person) => person.email,
  },
  {
    key: "phone",
    header: { en: "Phone", es: "Teléfono" },
    curatorOnly: true,
    value: (person) => person.phone,
  },
  {
    key: "notes",
    header: { en: "Notes", es: "Notas" },
    curatorOnly: true,
    value: (person) => person.notes,
  },
];

export interface RegistryExportOptions {
  locale: Locale;
  /**
   * Whether the person downloading is a curator who may see contact details.
   * When false the curator-only columns (contact details and life dates) are
   * left out of the file and the people are redacted first, so a contact
   * value cannot reach the file by any column.
   */
  includeContact: boolean;
}

export interface RegistryExportTable {
  sheetName: string;
  /** Column keys in order, for tests and auditing; never written to the file. */
  columnKeys: string[];
  /** The header row followed by one row per person. */
  rows: string[][];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function buildRegistryExportTable(
  people: readonly RegistryPerson[],
  options: RegistryExportOptions,
): RegistryExportTable {
  const columns = options.includeContact
    ? COLUMNS
    : COLUMNS.filter((column) => !column.curatorOnly);
  const visible = options.includeContact ? people : people.map(redactRegistryContact);
  return {
    sheetName: SHEET_NAMES[options.locale],
    columnKeys: columns.map((column) => column.key),
    rows: [
      columns.map((column) => column.header[options.locale]),
      ...visible.map((person) =>
        columns.map((column) => text(column.value(person, options.locale))),
      ),
    ],
  };
}

/** hmmsa-survivor-registry-YYYY-MM-DD.csv / .xlsx, dated in UTC. */
export function registryExportFilename(format: RegistryExportFormat, now = new Date()): string {
  return `hmmsa-survivor-registry-${now.toISOString().slice(0, 10)}.${format}`;
}
