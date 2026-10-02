import { describe, expect, it } from "vitest";
import {
  buildRegistryExportTable,
  isRegistryExportFormat,
  registryExportFilename,
} from "@/lib/survivor-registry/export";
import type { RegistryPerson } from "@/lib/survivor-registry/types";

function person(overrides: Partial<RegistryPerson> = {}): RegistryPerson {
  return {
    id: "p1",
    firstName: "Ruth",
    lastName: "Adler",
    title: "Mrs.",
    generation: "survivor",
    generationRaw: "Survivor",
    familyThread: "",
    familyKey: "Adler",
    countryOfOrigin: "Poland",
    dateOfBirth: "1931-05-02",
    dateOfDeath: "",
    camps: ["Auschwitz", "Bergen-Belsen"],
    fateNotes: ["Liberated April 1945", "Emigrated 1949"],
    address: "123 Main St",
    city: "San Antonio",
    state: "TX",
    zip: "02134",
    email: "ruth@contact.example",
    phone: "+1 210 555 0100",
    deceased: false,
    deceasedSource: "",
    notes: "PRIVATE-NOTE",
    source: "curator",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const CONTACT_HEADERS = ["Address", "ZIP", "Email", "Phone", "Notes"];
const CONTACT_VALUES = ["123 Main St", "02134", "ruth@contact.example", "+1 210 555 0100", "PRIVATE-NOTE"];

describe("registry export table", () => {
  it("gives a curator every column with localized English headers", () => {
    const table = buildRegistryExportTable([person()], { locale: "en", includeContact: true });
    expect(table.sheetName).toBe("Survivor registry");
    expect(table.rows[0]).toEqual([
      "Last name",
      "First name",
      "Title",
      "Generation",
      "Family",
      "Country of origin",
      "Date of birth",
      "Date of death",
      "Deceased",
      "Camps",
      "Fate notes",
      "City",
      "State",
      ...CONTACT_HEADERS,
    ]);
    expect(table.rows[1]).toEqual([
      "Adler",
      "Ruth",
      "Mrs.",
      "Survivor",
      "Adler",
      "Poland",
      "1931-05-02",
      "",
      "No",
      "Auschwitz; Bergen-Belsen",
      "Liberated April 1945; Emigrated 1949",
      "San Antonio",
      "TX",
      ...CONTACT_VALUES,
    ]);
    expect(table.columnKeys).toContain("email");
  });

  it("leaves the contact and life-date columns out entirely for a read-only account", () => {
    const table = buildRegistryExportTable([person({ dateOfDeath: "1999-12-31" })], {
      locale: "en",
      includeContact: false,
    });
    expect(table.rows[0]).toEqual([
      "Last name",
      "First name",
      "Title",
      "Generation",
      "Family",
      "Country of origin",
      "Deceased",
      "Camps",
      "Fate notes",
      "City",
      "State",
    ]);
    expect(table.rows[1]).toHaveLength(11);
    for (const header of CONTACT_HEADERS) expect(table.rows[0]).not.toContain(header);
    for (const value of CONTACT_VALUES) expect(table.rows.flat()).not.toContain(value);
    for (const key of ["address", "zip", "email", "phone", "notes"]) {
      expect(table.columnKeys).not.toContain(key);
    }
    // The registry page shows a date of birth or death to nobody, so a
    // read-only download does not carry them either.
    expect(table.rows[0]).not.toContain("Date of birth");
    expect(table.rows[0]).not.toContain("Date of death");
    expect(table.columnKeys).not.toContain("dateOfBirth");
    expect(table.columnKeys).not.toContain("dateOfDeath");
    expect(table.rows.flat()).not.toContain("1931-05-02");
    expect(table.rows.flat()).not.toContain("1999-12-31");
    // City and state are not contact details and stay.
    expect(table.rows[1]).toContain("San Antonio");
    expect(table.rows[1]).toContain("TX");
  });

  it("translates headers, generation labels and yes/no into Spanish", () => {
    const table = buildRegistryExportTable(
      [person({ generation: "2nd-gen", deceased: true, dateOfDeath: "2001-02-03" })],
      { locale: "es", includeContact: true },
    );
    expect(table.sheetName).toBe("Registro");
    expect(table.rows[0]).toEqual([
      "Apellido",
      "Nombre",
      "Título",
      "Generación",
      "Familia",
      "País de origen",
      "Fecha de nacimiento",
      "Fecha de fallecimiento",
      "Fallecida/o",
      "Campos",
      "Notas de destino",
      "Ciudad",
      "Estado",
      "Dirección",
      "Código postal",
      "Correo",
      "Teléfono",
      "Notas",
    ]);
    expect(table.rows[1][3]).toBe("2.ª generación");
    expect(table.rows[1][7]).toBe("2001-02-03");
    expect(table.rows[1][8]).toBe("Sí");
  });

  it("writes Yes for deceased people in English", () => {
    const table = buildRegistryExportTable([person({ deceased: true })], {
      locale: "en",
      includeContact: false,
    });
    expect(table.rows[0][6]).toBe("Deceased");
    expect(table.rows[1][6]).toBe("Yes");
  });

  it("shows a blank family for unlinked people, matching the page", () => {
    const table = buildRegistryExportTable(
      [person({ familyKey: "Unlinked" }), person({ id: "p2", familyKey: "" })],
      { locale: "en", includeContact: false },
    );
    expect(table.rows[1][4]).toBe("");
    expect(table.rows[2][4]).toBe("");
  });

  it("produces one row per person in the order given, after the header", () => {
    const table = buildRegistryExportTable(
      [person({ lastName: "Zweig" }), person({ id: "p2", lastName: "Adler" })],
      { locale: "en", includeContact: false },
    );
    expect(table.rows.map((row) => row[0])).toEqual(["Last name", "Zweig", "Adler"]);
  });

  it("names the file by format and UTC date", () => {
    const now = new Date("2026-10-02T23:30:00.000Z");
    expect(registryExportFilename("csv", now)).toBe("hmmsa-survivor-registry-2026-10-02.csv");
    expect(registryExportFilename("xlsx", now)).toBe("hmmsa-survivor-registry-2026-10-02.xlsx");
  });

  it("recognises only csv and xlsx as formats", () => {
    expect(isRegistryExportFormat("csv")).toBe(true);
    expect(isRegistryExportFormat("xlsx")).toBe(true);
    expect(isRegistryExportFormat("XLSX")).toBe(false);
    expect(isRegistryExportFormat("pdf")).toBe(false);
    expect(isRegistryExportFormat(null)).toBe(false);
  });
});
