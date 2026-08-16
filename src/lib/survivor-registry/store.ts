import { randomUUID } from "node:crypto";
import seedData from "@/lib/survivor-registry/seed.json";
import {
  type RegistryFacets,
  type RegistryListInput,
  type RegistryListResult,
  type RegistryPerson,
  type RegistryPersonInput,
} from "@/lib/survivor-registry/types";

export interface SurvivorRegistryStore {
  readonly mode: "postgres" | "memory-dev";
  list(input: RegistryListInput): Promise<RegistryListResult>;
  get(id: string): Promise<RegistryPerson | undefined>;
  create(input: RegistryPersonInput, actorUserId: string): Promise<RegistryPerson>;
  update(
    id: string,
    input: RegistryPersonInput,
    actorUserId: string,
  ): Promise<RegistryPerson | undefined>;
}

export class SurvivorRegistryUnavailableError extends Error {
  constructor(message = "The survivor registry database is not configured.") {
    super(message);
    this.name = "SurvivorRegistryUnavailableError";
  }
}

interface SeedFile {
  importedAt: string;
  sheet: string;
  people: Array<Omit<RegistryPerson, "notes" | "source" | "createdAt" | "updatedAt">>;
}

export function seedRegistryPeople(): RegistryPerson[] {
  const file = seedData as unknown as SeedFile;
  return file.people.map((person) => ({
    ...person,
    notes: "",
    source: "workbook-import" as const,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  }));
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLocaleLowerCase("en");
}

export function matchesRegistryQuery(person: RegistryPerson, query: string): boolean {
  if (!query) return true;
  const haystack = normalize(
    [
      person.firstName,
      person.lastName,
      person.title,
      person.generationRaw,
      person.familyThread,
      person.familyKey,
      person.countryOfOrigin,
      person.camps.join(" "),
      person.fateNotes.join(" "),
      person.city,
      person.state,
      person.email,
      person.notes,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return query
    .split(/\s+/)
    .every((term) => haystack.includes(normalize(term)));
}

export function filterAndPageRegistry(
  people: RegistryPerson[],
  input: RegistryListInput,
): RegistryListResult {
  const query = input.query.trim();
  const filtered = people
    .filter((person) => {
      if (input.generation !== "all" && person.generation !== input.generation) return false;
      if (input.family !== "all" && person.familyKey !== input.family) return false;
      if (input.status === "living" && person.deceased) return false;
      if (input.status === "deceased" && !person.deceased) return false;
      return matchesRegistryQuery(person, query);
    })
    .sort(
      (left, right) =>
        left.lastName.localeCompare(right.lastName) ||
        left.firstName.localeCompare(right.firstName) ||
        left.id.localeCompare(right.id),
    );
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
  const page = Math.min(input.page, totalPages);

  const generationCounts = new Map<RegistryPerson["generation"], number>();
  const familyCounts = new Map<string, number>();
  let deceased = 0;
  for (const person of people) {
    generationCounts.set(person.generation, (generationCounts.get(person.generation) ?? 0) + 1);
    familyCounts.set(person.familyKey, (familyCounts.get(person.familyKey) ?? 0) + 1);
    if (person.deceased) deceased += 1;
  }
  const facets: RegistryFacets = {
    generations: [...generationCounts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((left, right) => right.count - left.count),
    families: [...familyCounts.entries()]
      .map(([value, count]) => ({ value, count }))
      .filter((facet) => facet.count > 1)
      .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value)),
    deceased,
    living: people.length - deceased,
  };

  return {
    items: filtered.slice((page - 1) * input.pageSize, page * input.pageSize),
    total,
    page,
    pageSize: input.pageSize,
    totalPages,
    facets,
  };
}

export function buildRegistryPerson(
  input: RegistryPersonInput,
  existing?: RegistryPerson,
): RegistryPerson {
  const now = new Date().toISOString();
  const familyKey = existing?.familyKey && existing.lastName === input.lastName
    ? existing.familyKey
    : input.lastName || input.familyThread || "Unlinked";
  return {
    id: existing?.id ?? randomUUID(),
    ...input,
    generationRaw: existing?.generationRaw ?? input.generation,
    familyKey,
    deceasedSource: input.deceased
      ? existing?.deceasedSource || "curator"
      : "",
    source: existing?.source ?? "curator",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function createMemorySurvivorRegistryStore(): SurvivorRegistryStore {
  const people = new Map<string, RegistryPerson>();
  for (const person of seedRegistryPeople()) people.set(person.id, person);

  return {
    mode: "memory-dev",
    async list(input) {
      return filterAndPageRegistry([...people.values()], input);
    },
    async get(id) {
      const person = people.get(id);
      return person ? { ...person, camps: [...person.camps], fateNotes: [...person.fateNotes] } : undefined;
    },
    async create(input) {
      const person = buildRegistryPerson(input);
      people.set(person.id, person);
      return person;
    },
    async update(id, input) {
      const existing = people.get(id);
      if (!existing) return undefined;
      const person = buildRegistryPerson(input, existing);
      people.set(id, person);
      return person;
    },
  };
}

const registryState = globalThis as typeof globalThis & {
  votsSurvivorRegistryStore?: SurvivorRegistryStore;
};

export async function getSurvivorRegistryStore(): Promise<SurvivorRegistryStore> {
  if (registryState.votsSurvivorRegistryStore) return registryState.votsSurvivorRegistryStore;
  if (
    process.env.SURVIVOR_REGISTRY_STORE === "memory" &&
    process.env.NODE_ENV !== "production"
  ) {
    registryState.votsSurvivorRegistryStore = createMemorySurvivorRegistryStore();
    return registryState.votsSurvivorRegistryStore;
  }
  if (!process.env.DATABASE_URL) throw new SurvivorRegistryUnavailableError();
  const { createPostgresSurvivorRegistryStore } = await import(
    "@/lib/survivor-registry/postgres-store"
  );
  registryState.votsSurvivorRegistryStore = createPostgresSurvivorRegistryStore();
  return registryState.votsSurvivorRegistryStore;
}

export function setSurvivorRegistryStoreForTests(
  store: SurvivorRegistryStore | undefined,
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The production survivor registry store cannot be replaced.");
  }
  if (store) registryState.votsSurvivorRegistryStore = store;
  else delete registryState.votsSurvivorRegistryStore;
}
