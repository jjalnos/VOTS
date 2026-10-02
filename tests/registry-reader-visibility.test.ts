import { afterEach, describe, expect, it, vi } from "vitest";

const sessionMock = vi.hoisted(() => ({
  getActorFromRequest: vi.fn(),
}));

vi.mock("@/lib/auth/server-session", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getActorFromRequest: sessionMock.getActorFromRequest,
}));

import { GET as listRegistry } from "@/app/api/curator/registry/route";
import type { Actor } from "@/lib/auth/policy";
import {
  filterAndPageRegistry,
  listRegistryForReader,
  setSurvivorRegistryStoreForTests,
  visibleRegistryPeople,
  type SurvivorRegistryStore,
} from "@/lib/survivor-registry/store";
import type { RegistryListInput, RegistryPerson } from "@/lib/survivor-registry/types";

/**
 * What a read-only account can learn about a record through the registry's
 * search. Contact details are blanked before the search runs, so a query can
 * neither show nor confirm them; curators search the whole record.
 */

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

function person(id: string, overrides: Partial<RegistryPerson>): RegistryPerson {
  return {
    id,
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
    camps: [],
    fateNotes: ["Emigrated"],
    address: "",
    city: "San Antonio",
    state: "TX",
    zip: "",
    email: "",
    phone: "",
    deceased: false,
    deceasedSource: "",
    notes: "",
    source: "curator",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const people: RegistryPerson[] = [
  person("ruth", { email: "ruth@contact.example", notes: "PRIVATE-NOTE-RUTH", zip: "02134" }),
  person("miriam", { firstName: "Miriam", lastName: "Baum", familyKey: "Baum", notes: "Call first" }),
  person("david", { firstName: "David", lastName: "Cohen", familyKey: "Cohen", email: "d@contact.example" }),
];

function fakeStore(): SurvivorRegistryStore {
  const unused = async () => {
    throw new Error("not used here");
  };
  return {
    mode: "postgres",
    all: async () => people.map((entry) => ({ ...entry })),
    list: async (input) => filterAndPageRegistry(people, input),
    get: async (id) => people.find((entry) => entry.id === id),
    create: unused,
    update: unused,
    applyImport: unused,
  };
}

function input(query: string, extra: Partial<RegistryListInput> = {}): RegistryListInput {
  return { query, generation: "all", family: "all", status: "all", page: 1, pageSize: 50, ...extra };
}

afterEach(() => {
  vi.restoreAllMocks();
  setSurvivorRegistryStoreForTests(undefined);
});

describe("visibleRegistryPeople", () => {
  it("returns every record whole for a curator", async () => {
    const visible = await visibleRegistryPeople(fakeStore(), true);
    expect(visible.map((entry) => entry.email)).toEqual(["ruth@contact.example", "", "d@contact.example"]);
    expect(visible[0].notes).toBe("PRIVATE-NOTE-RUTH");
  });

  it("returns every record with contact details blanked for a read-only account", async () => {
    const visible = await visibleRegistryPeople(fakeStore(), false);
    expect(visible).toHaveLength(people.length);
    for (const entry of visible) {
      expect(entry.email).toBe("");
      expect(entry.phone).toBe("");
      expect(entry.address).toBe("");
      expect(entry.zip).toBe("");
      expect(entry.notes).toBe("");
    }
    expect(visible.map((entry) => entry.lastName)).toEqual(["Adler", "Baum", "Cohen"]);
  });
});

describe("listRegistryForReader", () => {
  it("lets a curator find a person by email or note", async () => {
    const byEmail = await listRegistryForReader(fakeStore(), input("ruth@contact.example"), true);
    expect(byEmail.items.map((entry) => entry.id)).toEqual(["ruth"]);
    const byNote = await listRegistryForReader(fakeStore(), input("PRIVATE-NOTE-RUTH"), true);
    expect(byNote.items.map((entry) => entry.id)).toEqual(["ruth"]);
  });

  it("does not let a read-only account probe contact details through the search", async () => {
    for (const probe of ["ruth@contact.example", "PRIVATE-NOTE-RUTH", "@", "contact.example", "Call first"]) {
      const result = await listRegistryForReader(fakeStore(), input(probe), false);
      expect(result.items, `probe ${JSON.stringify(probe)}`).toEqual([]);
      expect(result.total).toBe(0);
    }
  });

  it("still searches and filters the visible fields for a read-only account", async () => {
    const byName = await listRegistryForReader(fakeStore(), input("miriam"), false);
    expect(byName.items.map((entry) => entry.id)).toEqual(["miriam"]);
    expect(byName.items[0].notes).toBe("");
    const byFamily = await listRegistryForReader(fakeStore(), input("", { family: "Cohen" }), false);
    expect(byFamily.items.map((entry) => entry.id)).toEqual(["david"]);
    expect(byFamily.items[0].email).toBe("");
    // Facets are computed from the same people either way.
    const everyone = await listRegistryForReader(fakeStore(), input(""), false);
    expect(everyone.total).toBe(people.length);
    expect(everyone.facets.living).toBe(people.length);
  });
});

describe("GET /api/curator/registry search visibility", () => {
  function listRequest(query: string): Request {
    return new Request(`https://archive.example/api/curator/registry?q=${encodeURIComponent(query)}`, {
      headers: { cookie: "session=test" },
    });
  }

  it("answers a curator's search on an email with the matching person", async () => {
    setSurvivorRegistryStoreForTests(fakeStore());
    sessionMock.getActorFromRequest.mockResolvedValue(curator);
    const response = await listRegistry(listRequest("ruth@contact.example"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: RegistryPerson[]; total: number };
    expect(body.total).toBe(1);
    expect(body.items[0].email).toBe("ruth@contact.example");
  });

  it("answers a read-only account's search on an email with nothing, and never a contact value", async () => {
    setSurvivorRegistryStoreForTests(fakeStore());
    sessionMock.getActorFromRequest.mockResolvedValue(viewer);
    const probed = await listRegistry(listRequest("ruth@contact.example"));
    expect(probed.status).toBe(200);
    const probedBody = (await probed.json()) as { items: RegistryPerson[]; total: number };
    expect(probedBody.total).toBe(0);
    expect(probedBody.items).toEqual([]);

    const everyone = await listRegistry(listRequest(""));
    const text = await everyone.text();
    expect(everyone.status).toBe(200);
    expect(text).not.toContain("contact.example");
    expect(text).not.toContain("PRIVATE-NOTE");
    expect(text).not.toContain("Call first");
    expect(text).not.toContain("02134");
    expect((JSON.parse(text) as { total: number }).total).toBe(people.length);
  });
});
