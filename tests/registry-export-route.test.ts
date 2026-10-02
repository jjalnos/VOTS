import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionMock = vi.hoisted(() => ({
  getActorFromRequest: vi.fn(),
}));
const databaseMock = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
  failInsert: false,
  getDatabase: vi.fn(),
}));

vi.mock("@/lib/auth/server-session", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getActorFromRequest: sessionMock.getActorFromRequest,
}));
vi.mock("@/db/client", () => ({
  getDatabase: databaseMock.getDatabase,
}));

import { GET, HEAD } from "@/app/api/curator/registry/export/route";
import type { Actor } from "@/lib/auth/policy";
import {
  clearMemoryRegistryExportAuditLogForTests,
  memoryRegistryExportAuditLog,
  REGISTRY_EXPORT_AUDIT_ACTION,
} from "@/lib/survivor-registry/export-audit";
import {
  filterAndPageRegistry,
  setSurvivorRegistryStoreForTests,
  type SurvivorRegistryStore,
} from "@/lib/survivor-registry/store";
import type { RegistryListInput, RegistryPerson } from "@/lib/survivor-registry/types";
import { readWorkbook } from "@/lib/survivor-registry/xlsx-reader";
import { parseCsv } from "./support/csv";
import { unzipEntries } from "./support/unzip";

const ORIGIN = "https://archive.example";
const EXPORT_PATH = "/api/curator/registry/export";
const PEOPLE_COUNT = 60;
const SURNAMES = [
  "Adler",
  "Baum",
  "Cohen",
  "Dessau",
  "Ehrlich",
  "Feld",
  "Glass",
  "Hirsch",
  "Isaak",
  "Jakob",
  "Klein",
  "Lowy",
];

const curator: Actor = {
  userId: "00000000-0000-4000-8000-00000000000c",
  email: "curator@archive.local",
  displayName: "Curator",
  roles: ["curator"],
  mfaVerified: true,
};
const viewer: Actor = {
  userId: "00000000-0000-4000-8000-00000000000e",
  email: "demo@voicesoftheshoah.org",
  displayName: "Archive demonstration",
  roles: ["viewer"],
  mfaVerified: false,
};
const familyMember: Actor = { ...viewer, roles: ["family"] };

function pad(index: number): string {
  return String(index).padStart(2, "0");
}

function makePeople(): RegistryPerson[] {
  return Array.from({ length: PEOPLE_COUNT }, (_, index) => {
    const lastName = SURNAMES[(index * 5) % SURNAMES.length];
    return {
      id: `person-${pad(index)}`,
      firstName: `First${pad(PEOPLE_COUNT - 1 - index)}`,
      lastName,
      title: index % 2 === 0 ? "Mrs." : "Mr.",
      generation: index % 3 === 0 ? "2nd-gen" : "survivor",
      generationRaw: index % 3 === 0 ? "2nd Gen" : "Survivor",
      familyThread: "",
      familyKey: index % 5 === 0 ? "Unlinked" : lastName,
      countryOfOrigin: index % 2 === 0 ? "Poland" : "Hungary",
      dateOfBirth: `19${20 + (index % 40)}-01-15`,
      dateOfDeath: index % 2 === 0 ? "2001-06-01" : "",
      camps: index % 4 === 0 ? ["Auschwitz", "Bergen-Belsen"] : [],
      fateNotes: [6, 7, 18, 19].includes(index) ? ["Zissou expedition, 1946"] : ["Emigrated"],
      address: `${100 + index} Main Street`,
      city: "San Antonio",
      state: "TX",
      zip: `0${2100 + index}`,
      email: `person${pad(index)}@contact.example`,
      phone: `+1 210 555 01${pad(index)}`,
      deceased: index % 2 === 0,
      deceasedSource: index % 2 === 0 ? "red-font" : "",
      notes: `PRIVATE-NOTE-${pad(index)}`,
      source: "workbook-import",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } satisfies RegistryPerson;
  });
}

const people = makePeople();
const CONTACT_HEADERS = ["Address", "ZIP", "Email", "Phone", "Notes"];
/** Everything a read-only account's file must not carry: contact details and life dates. */
const WITHHELD_HEADERS = ["Date of birth", "Date of death", ...CONTACT_HEADERS];
const WITHHELD_FRAGMENTS = [
  "contact.example",
  "PRIVATE-NOTE",
  "Main Street",
  "+1 210 555",
  "2001-06-01",
  ...people.map((person) => person.zip),
  ...people.map((person) => person.dateOfBirth),
];
const VIEWER_HEADERS = [
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
];
const VIEWER_DECEASED_COLUMN = VIEWER_HEADERS.indexOf("Deceased");

function fakeStore(
  overrides: Partial<SurvivorRegistryStore> = {},
): SurvivorRegistryStore {
  const unused = async () => {
    throw new Error("not used by the export");
  };
  return {
    mode: "postgres",
    all: async () => people.map((person) => ({ ...person })),
    list: async (input: RegistryListInput) => filterAndPageRegistry(people, input),
    get: async (id: string) => people.find((person) => person.id === id),
    create: unused,
    update: unused,
    applyImport: unused,
    ...overrides,
  };
}

function exportRequest(query: Record<string, string>): Request {
  const params = new URLSearchParams(query);
  return new Request(`${ORIGIN}${EXPORT_PATH}?${params.toString()}`, {
    headers: { cookie: "session=test" },
  });
}

async function bodyBytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

async function csvRows(response: Response): Promise<string[][]> {
  return parseCsv(new TextDecoder("utf-8", { ignoreBOM: true }).decode(await bodyBytes(response)));
}

function workbookText(bytes: Uint8Array): string {
  return [...unzipEntries(bytes).values()].join("\n");
}

function sortedNames(input: Partial<RegistryListInput>): string[][] {
  return filterAndPageRegistry(people, {
    query: "",
    generation: "all",
    family: "all",
    status: "all",
    page: 1,
    pageSize: PEOPLE_COUNT,
    ...input,
  }).items.map((person) => [person.lastName, person.firstName]);
}

beforeEach(() => {
  databaseMock.inserted = [];
  databaseMock.failInsert = false;
  databaseMock.getDatabase.mockReset();
  databaseMock.getDatabase.mockReturnValue({
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        if (databaseMock.failInsert) throw new Error("connection refused");
        databaseMock.inserted.push(row);
      },
    }),
  });
  setSurvivorRegistryStoreForTests(fakeStore());
  clearMemoryRegistryExportAuditLogForTests();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T23:30:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setSurvivorRegistryStoreForTests(undefined);
  clearMemoryRegistryExportAuditLogForTests();
});

describe("GET /api/curator/registry/export access", () => {
  it("requires a session", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(null);
    const response = await GET(exportRequest({ format: "csv" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(databaseMock.inserted).toHaveLength(0);
  });

  it("refuses an account without registry access", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(familyMember);
    const response = await GET(exportRequest({ format: "xlsx" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Registry access is required." });
    expect(databaseMock.inserted).toHaveLength(0);
  });

  it("does not build or audit an export for a HEAD request", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(curator);
    const all = vi.fn(async () => people);
    setSurvivorRegistryStoreForTests(fakeStore({ all }));
    const response = await HEAD();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(await response.text()).toBe("");
    expect(all).not.toHaveBeenCalled();
    expect(databaseMock.inserted).toHaveLength(0);
    expect(memoryRegistryExportAuditLog()).toHaveLength(0);
  });

  it("rejects a missing or unknown format before touching the registry", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(curator);
    const all = vi.fn(async () => people);
    setSurvivorRegistryStoreForTests(fakeStore({ all }));

    const badQueries: Record<string, string>[] = [{}, { format: "pdf" }, { format: "CSV" }, { format: "" }];
    for (const query of badQueries) {
      const response = await GET(exportRequest(query));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/csv.*xlsx/);
    }
    expect(all).not.toHaveBeenCalled();
    expect(databaseMock.inserted).toHaveLength(0);
  });
});

describe("GET /api/curator/registry/export for a read-only account", () => {
  it("writes a CSV without contact or life-date columns and without a single withheld value", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(viewer);
    const response = await GET(exportRequest({ format: "csv" }));
    expect(response.status).toBe(200);

    const bytes = await bodyBytes(response);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    for (const fragment of WITHHELD_FRAGMENTS) expect(text).not.toContain(fragment);

    const rows = parseCsv(text);
    expect(rows).toHaveLength(PEOPLE_COUNT + 1);
    // The page never shows a date of birth or death to anyone; the file a
    // read-only account downloads matches the page.
    expect(rows[0]).toEqual(VIEWER_HEADERS);
    for (const header of WITHHELD_HEADERS) expect(rows[0]).not.toContain(header);
    for (const row of rows) expect(row).toHaveLength(VIEWER_HEADERS.length);
    // City and state are part of the public shape of a record.
    expect(rows[1]).toContain("San Antonio");
    expect(rows[1]).toContain("TX");
  });

  it("writes an XLSX whose every part is free of withheld details", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(viewer);
    const response = await GET(exportRequest({ format: "xlsx" }));
    expect(response.status).toBe(200);

    const bytes = await bodyBytes(response);
    const everything = workbookText(bytes);
    for (const fragment of WITHHELD_FRAGMENTS) expect(everything).not.toContain(fragment);
    for (const header of WITHHELD_HEADERS) expect(everything).not.toContain(`>${header}<`);

    const sheet = readWorkbook(bytes).sheets[0];
    expect(sheet.name).toBe("Survivor registry");
    expect(sheet.rows).toHaveLength(PEOPLE_COUNT + 1);
    expect(sheet.rows[0].map((cell) => cell.value)).toEqual(VIEWER_HEADERS);
    expect(unzipEntries(bytes).get("xl/worksheets/sheet1.xml")).toContain(
      `<dimension ref="A1:K${PEOPLE_COUNT + 1}"/>`,
    );
  });

  it("treats a curator session that has not passed MFA as read-only", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue({ ...curator, mfaVerified: false });
    const response = await GET(exportRequest({ format: "csv" }));
    const rows = await csvRows(response);
    expect(rows[0]).toEqual(VIEWER_HEADERS);
    expect(databaseMock.inserted[0]).toMatchObject({ metadata: { redacted: true } });
  });

  it("does not let the search reveal withheld fields through which rows match", async () => {
    // Before redaction a search on the whole record would answer "does this
    // email belong to this person" by returning one row or none.
    const target = people[7];
    const probes = [target.email, target.notes, "@", target.zip, target.address, target.phone];
    for (const probe of probes) {
      sessionMock.getActorFromRequest.mockResolvedValue(viewer);
      const rows = await csvRows(await GET(exportRequest({ format: "csv", q: probe })));
      expect(rows, `viewer probe ${JSON.stringify(probe)}`).toEqual([VIEWER_HEADERS]);
    }
    // Visible fields still match for everyone.
    sessionMock.getActorFromRequest.mockResolvedValue(viewer);
    const byName = await csvRows(
      await GET(exportRequest({ format: "csv", q: `${target.lastName} ${target.firstName}` })),
    );
    expect(byName).toHaveLength(2);
    expect(byName[1].slice(0, 2)).toEqual([target.lastName, target.firstName]);

    // A curator, who sees those fields on the page, can search them.
    sessionMock.getActorFromRequest.mockResolvedValue(curator);
    const curatorRows = await csvRows(await GET(exportRequest({ format: "csv", q: target.email })));
    expect(curatorRows).toHaveLength(2);
    expect(curatorRows[1].slice(0, 2)).toEqual([target.lastName, target.firstName]);
  });
});

describe("GET /api/curator/registry/export for a curator", () => {
  it("includes the contact columns and keeps phone numbers readable in CSV", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(curator);
    const response = await GET(exportRequest({ format: "csv" }));
    expect(response.status).toBe(200);

    const rows = await csvRows(response);
    expect(rows).toHaveLength(PEOPLE_COUNT + 1);
    expect(rows[0]).toHaveLength(18);
    expect(rows[0].slice(13)).toEqual(CONTACT_HEADERS);

    const byName = new Map(rows.slice(1).map((row) => [`${row[0]} ${row[1]}`, row]));
    const first = people[7];
    const row = byName.get(`${first.lastName} ${first.firstName}`)!;
    expect(row[13]).toBe("107 Main Street");
    expect(row[14]).toBe("02107");
    expect(row[15]).toBe("person07@contact.example");
    // The leading plus would otherwise be read as a formula; the number stays whole.
    expect(row[16]).toBe("'+1 210 555 0107");
    expect(row[17]).toBe("PRIVATE-NOTE-07");
    expect(row[9]).toBe("");
    expect(row[10]).toBe("Zissou expedition, 1946");
  });

  it("includes the contact columns as plain text cells in XLSX", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(curator);
    const response = await GET(exportRequest({ format: "xlsx" }));
    expect(response.status).toBe(200);

    const bytes = await bodyBytes(response);
    const sheet = readWorkbook(bytes).sheets[0];
    const header = sheet.rows[0].map((cell) => cell.value);
    expect(header).toHaveLength(18);
    expect(header.slice(13)).toEqual(CONTACT_HEADERS);

    const target = people[7];
    const row = sheet.rows
      .slice(1)
      .map((cells) => cells.map((cell) => cell.value))
      .find((cells) => cells[0] === target.lastName && cells[1] === target.firstName)!;
    expect(row[14]).toBe("02107");
    expect(row[16]).toBe("+1 210 555 0107");
    expect(row[15]).toBe("person07@contact.example");
    expect(unzipEntries(bytes).get("xl/worksheets/sheet1.xml")).not.toContain("<f");
  });
});

describe("GET /api/curator/registry/export scope", () => {
  it("exports every matching person, not only the visible page, in the page's order", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(viewer);
    const response = await GET(exportRequest({ format: "csv", page: "2", pageSize: "5" }));
    const rows = await csvRows(response);
    expect(rows).toHaveLength(PEOPLE_COUNT + 1);
    expect(PEOPLE_COUNT).toBeGreaterThan(25);
    expect(rows.slice(1).map((row) => [row[0], row[1]])).toEqual(sortedNames({}));
  });

  it("honours the generation, status, family and search filters", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(viewer);

    const combined = await csvRows(
      await GET(
        exportRequest({ format: "csv", generation: "2nd-gen", status: "deceased", q: "Zissou" }),
      ),
    );
    const expected = sortedNames({ generation: "2nd-gen", status: "deceased", query: "Zissou" });
    expect(expected).toHaveLength(2);
    expect(combined.slice(1).map((row) => [row[0], row[1]])).toEqual(expected);
    for (const row of combined.slice(1)) {
      expect(row[3]).toBe("2nd generation");
      expect(row[VIEWER_DECEASED_COLUMN]).toBe("Yes");
    }

    const byFamily = await csvRows(await GET(exportRequest({ format: "csv", family: "Adler" })));
    const adlers = sortedNames({ family: "Adler" });
    expect(adlers.length).toBeGreaterThan(0);
    expect(adlers.length).toBeLessThan(PEOPLE_COUNT);
    expect(byFamily.slice(1).map((row) => [row[0], row[1]])).toEqual(adlers);
    for (const row of byFamily.slice(1)) expect(row[4]).toBe("Adler");

    const living = await csvRows(await GET(exportRequest({ format: "csv", status: "living" })));
    expect(living).toHaveLength(PEOPLE_COUNT / 2 + 1);
    for (const row of living.slice(1)) expect(row[VIEWER_DECEASED_COLUMN]).toBe("No");
  });

  it("returns only the header row when nothing matches", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(viewer);
    const rows = await csvRows(await GET(exportRequest({ format: "csv", q: "nobody-here" })));
    expect(rows).toHaveLength(1);
    expect(databaseMock.inserted[0]).toMatchObject({ metadata: { rowCount: 0, hasQuery: true } });
  });

  it("writes Spanish headers when asked", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(viewer);
    const rows = await csvRows(await GET(exportRequest({ format: "csv", lang: "es" })));
    expect(rows[0][0]).toBe("Apellido");
    expect(rows[0][VIEWER_DECEASED_COLUMN]).toBe("Fallecida/o");
    expect(rows[1][VIEWER_DECEASED_COLUMN]).toMatch(/^(Sí|No)$/);
    expect(rows.slice(1).map((row) => row[3])).toContain("2.ª generación");
  });
});

describe("GET /api/curator/registry/export response", () => {
  it("sets download headers for CSV", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(curator);
    const response = await GET(exportRequest({ format: "csv" }));
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="hmmsa-survivor-registry-2026-10-02.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const bytes = await bodyBytes(response);
    expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
  });

  it("sets download headers for XLSX", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(curator);
    const response = await GET(exportRequest({ format: "xlsx" }));
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="hmmsa-survivor-registry-2026-10-02.xlsx"',
    );
    const bytes = await bodyBytes(response);
    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b]);
    expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
  });

  it("answers 503 when the registry store is unavailable", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(curator);
    setSurvivorRegistryStoreForTests(
      fakeStore({
        all: async () => {
          throw new Error("database down");
        },
      }),
    );
    const response = await GET(exportRequest({ format: "csv" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "The survivor registry database is not available.",
    });
    expect(databaseMock.inserted).toHaveLength(0);
  });

  it("answers 503 when no registry store is configured", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(curator);
    setSurvivorRegistryStoreForTests(undefined);
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SURVIVOR_REGISTRY_STORE", "");
    const response = await GET(exportRequest({ format: "xlsx" }));
    expect(response.status).toBe(503);
  });
});

describe("GET /api/curator/registry/export audit trail", () => {
  it("records each download with its filters but never the search text", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(viewer);
    const response = await GET(
      exportRequest({
        format: "xlsx",
        generation: "2nd-gen",
        status: "deceased",
        family: "Adler",
        q: "Zissou",
      }),
    );
    expect(response.status).toBe(200);

    expect(databaseMock.getDatabase).toHaveBeenCalled();
    expect(databaseMock.inserted).toHaveLength(1);
    const [event] = databaseMock.inserted;
    expect(event).toMatchObject({
      actorUserId: viewer.userId,
      action: REGISTRY_EXPORT_AUDIT_ACTION,
      entityType: "survivor_registry",
      metadata: {
        format: "xlsx",
        rowCount: 0,
        redacted: true,
        generation: "2nd-gen",
        family: "Adler",
        status: "deceased",
        hasQuery: true,
      },
    });
    expect(typeof event.id).toBe("string");
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(JSON.stringify(databaseMock.inserted)).not.toContain("Zissou");
    expect(Object.keys(event.metadata as object).sort()).toEqual(
      ["family", "format", "generation", "hasQuery", "redacted", "rowCount", "status"].sort(),
    );
  });

  it("records a full curator export with the row count and no query flag", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(curator);
    await GET(exportRequest({ format: "csv" }));
    expect(databaseMock.inserted[0]).toMatchObject({
      actorUserId: curator.userId,
      metadata: {
        format: "csv",
        rowCount: PEOPLE_COUNT,
        redacted: false,
        generation: "all",
        family: "all",
        status: "all",
        hasQuery: false,
      },
    });
  });

  it("records only a family that exists in the registry, never the request's free text", async () => {
    const freeText = "Jane Q. Doe lives at 12 Elm St";
    sessionMock.getActorFromRequest.mockResolvedValue(viewer);
    const response = await GET(exportRequest({ format: "csv", family: freeText }));
    expect(response.status).toBe(200);
    expect(await csvRows(response)).toHaveLength(1);
    expect(databaseMock.inserted).toHaveLength(1);
    expect(databaseMock.inserted[0]).toMatchObject({
      metadata: { family: "unknown", rowCount: 0, hasQuery: false },
    });
    expect(JSON.stringify(databaseMock.inserted)).not.toContain("Jane");
    expect(JSON.stringify(databaseMock.inserted)).not.toContain("Elm");

    // The in-memory trail of the development registry is held to the same rule.
    setSurvivorRegistryStoreForTests(fakeStore({ mode: "memory-dev" }));
    await GET(exportRequest({ format: "csv", family: `<script>${freeText}</script>` }));
    const log = memoryRegistryExportAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].metadata).toMatchObject({ family: "unknown" });
    expect(JSON.stringify(log)).not.toContain("Jane");
    expect(JSON.stringify(log)).not.toContain("script");

    // A real family key is still recorded, as the design asks.
    databaseMock.inserted = [];
    setSurvivorRegistryStoreForTests(fakeStore());
    await GET(exportRequest({ format: "csv", family: "Adler" }));
    expect(databaseMock.inserted[0]).toMatchObject({ metadata: { family: "Adler" } });
  });

  it("keeps a development sign-in's readable id out of the uuid column", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue({ ...curator, userId: "user-curator-demo" });
    await GET(exportRequest({ format: "csv" }));
    expect(databaseMock.inserted[0]).toMatchObject({
      actorUserId: null,
      metadata: { actorReference: "user-curator-demo", redacted: false },
    });
  });

  it("produces no file when the audit event cannot be written", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(curator);
    databaseMock.failInsert = true;
    const response = await GET(exportRequest({ format: "csv" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("content-disposition")).toBeNull();
    const body = await response.json();
    expect(body).toEqual({
      error: "The download could not be recorded, so no file was produced.",
    });
    expect(JSON.stringify(body)).not.toContain("contact.example");
  });

  it("logs in memory for the development registry instead of the database", async () => {
    sessionMock.getActorFromRequest.mockResolvedValue(curator);
    setSurvivorRegistryStoreForTests(fakeStore({ mode: "memory-dev" }));
    const response = await GET(exportRequest({ format: "csv", q: "Adler" }));
    expect(response.status).toBe(200);
    expect(databaseMock.getDatabase).not.toHaveBeenCalled();
    expect(databaseMock.inserted).toHaveLength(0);

    const log = memoryRegistryExportAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actorUserId: curator.userId,
      action: REGISTRY_EXPORT_AUDIT_ACTION,
      metadata: { format: "csv", redacted: false, hasQuery: true },
    });
    expect(JSON.stringify(log)).not.toContain("Adler");
  });
});
