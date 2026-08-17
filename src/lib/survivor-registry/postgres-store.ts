import postgres from "postgres";
import {
  buildRegistryPerson,
  filterAndPageRegistry,
  registryPersonChanged,
  seedRegistryPeople,
  type SurvivorRegistryStore,
} from "@/lib/survivor-registry/store";
import type { RegistryPerson } from "@/lib/survivor-registry/types";

type Sql = postgres.Sql;
type Row = Record<string, unknown>;

const REGISTRY_TABLE = "vots_survivor_registry";
const SEED_LOCK_KEY = 7_620_260_815;

const postgresState = globalThis as typeof globalThis & {
  votsSurvivorRegistrySql?: Sql;
  votsSurvivorRegistryInitialized?: Promise<void>;
};

function sqlClient(): Sql {
  if (postgresState.votsSurvivorRegistrySql) return postgresState.votsSurvivorRegistrySql;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the survivor registry.");
  postgresState.votsSurvivorRegistrySql = postgres(databaseUrl, {
    max: Math.max(1, Math.min(Number(process.env.DATABASE_POOL_MAX ?? "4") || 4, 8)),
    ssl: process.env.DATABASE_SSL === "require" ? "require" : false,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 20,
  });
  return postgresState.votsSurvivorRegistrySql;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function personFromRow(row: Row): RegistryPerson {
  return {
    id: String(row.id),
    firstName: String(row.first_name ?? ""),
    lastName: String(row.last_name ?? ""),
    title: String(row.title ?? ""),
    generation: String(row.generation ?? "unclassified") as RegistryPerson["generation"],
    generationRaw: String(row.generation_raw ?? ""),
    familyThread: String(row.family_thread ?? ""),
    familyKey: String(row.family_key ?? ""),
    countryOfOrigin: String(row.country_of_origin ?? ""),
    dateOfBirth: String(row.date_of_birth ?? ""),
    dateOfDeath: String(row.date_of_death ?? ""),
    camps: stringList(row.camps),
    fateNotes: stringList(row.fate_notes),
    address: String(row.address ?? ""),
    city: String(row.city ?? ""),
    state: String(row.state ?? ""),
    zip: String(row.zip ?? ""),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    deceased: row.deceased === true,
    deceasedSource: String(row.deceased_source ?? ""),
    notes: String(row.notes ?? ""),
    source: row.source === "curator" ? "curator" : "workbook-import",
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

async function insertPerson(sql: Sql, person: RegistryPerson): Promise<void> {
  await sql`
    INSERT INTO ${sql(REGISTRY_TABLE)} (
      id, first_name, last_name, title, generation, generation_raw,
      family_thread, family_key, country_of_origin, date_of_birth, date_of_death,
      camps, fate_notes, address, city, state, zip, email, phone,
      deceased, deceased_source, notes, source, created_at, updated_at
    ) VALUES (
      ${person.id}, ${person.firstName}, ${person.lastName}, ${person.title},
      ${person.generation}, ${person.generationRaw}, ${person.familyThread},
      ${person.familyKey}, ${person.countryOfOrigin}, ${person.dateOfBirth},
      ${person.dateOfDeath}, ${sql.json(person.camps)}, ${sql.json(person.fateNotes)},
      ${person.address}, ${person.city}, ${person.state}, ${person.zip},
      ${person.email}, ${person.phone}, ${person.deceased}, ${person.deceasedSource},
      ${person.notes}, ${person.source}, ${person.createdAt}, ${person.updatedAt}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

async function initialize(sql: Sql): Promise<void> {
  postgresState.votsSurvivorRegistryInitialized ??= (async () => {
    const tables = await sql<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${REGISTRY_TABLE}
    `;
    if (!tables.length) {
      throw new Error("The checked-in survivor registry migration has not been applied.");
    }
    await sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(${SEED_LOCK_KEY})`;
      const existing = await transaction<Array<{ count: string }>>`
        SELECT COUNT(*)::text AS count FROM ${transaction(REGISTRY_TABLE)}
      `;
      if (Number(existing[0]?.count ?? "0") > 0) return;
      for (const person of seedRegistryPeople()) {
        await insertPerson(transaction as unknown as Sql, person);
      }
    });
  })().catch((error) => {
    delete postgresState.votsSurvivorRegistryInitialized;
    throw error;
  });
  return postgresState.votsSurvivorRegistryInitialized;
}

export function createPostgresSurvivorRegistryStore(): SurvivorRegistryStore {
  return {
    mode: "postgres",
    async list(input) {
      const sql = sqlClient();
      await initialize(sql);
      const rows = await sql<Row[]>`SELECT * FROM ${sql(REGISTRY_TABLE)}`;
      return filterAndPageRegistry(rows.map(personFromRow), input);
    },
    async get(id) {
      const sql = sqlClient();
      await initialize(sql);
      const rows = await sql<Row[]>`
        SELECT * FROM ${sql(REGISTRY_TABLE)} WHERE id = ${id} LIMIT 1
      `;
      return rows.length ? personFromRow(rows[0]) : undefined;
    },
    async all() {
      const sql = sqlClient();
      await initialize(sql);
      const rows = await sql<Row[]>`SELECT * FROM ${sql(REGISTRY_TABLE)}`;
      return rows.map(personFromRow);
    },
    async create(input) {
      const sql = sqlClient();
      await initialize(sql);
      const person = buildRegistryPerson(input);
      await insertPerson(sql, person);
      return person;
    },
    async update(id, input) {
      const sql = sqlClient();
      await initialize(sql);
      const rows = await sql<Row[]>`
        SELECT * FROM ${sql(REGISTRY_TABLE)} WHERE id = ${id} LIMIT 1
      `;
      if (!rows.length) return undefined;
      const person = buildRegistryPerson(input, personFromRow(rows[0]));
      await sql`
        UPDATE ${sql(REGISTRY_TABLE)} SET
          first_name = ${person.firstName},
          last_name = ${person.lastName},
          title = ${person.title},
          generation = ${person.generation},
          family_thread = ${person.familyThread},
          family_key = ${person.familyKey},
          country_of_origin = ${person.countryOfOrigin},
          date_of_birth = ${person.dateOfBirth},
          date_of_death = ${person.dateOfDeath},
          camps = ${sql.json(person.camps)},
          fate_notes = ${sql.json(person.fateNotes)},
          address = ${person.address},
          city = ${person.city},
          state = ${person.state},
          zip = ${person.zip},
          email = ${person.email},
          phone = ${person.phone},
          deceased = ${person.deceased},
          deceased_source = ${person.deceasedSource},
          notes = ${person.notes},
          updated_at = ${person.updatedAt}
        WHERE id = ${id}
      `;
      return person;
    },
    async applyImport(incoming) {
      const sql = sqlClient();
      await initialize(sql);
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      await sql.begin(async (transaction) => {
        const rows = await transaction<Row[]>`SELECT * FROM ${transaction(REGISTRY_TABLE)}`;
        const existing = new Map(rows.map((row) => [String(row.id), personFromRow(row)]));
        for (const person of incoming) {
          const current = existing.get(person.id);
          if (!current) {
            await insertPerson(transaction as unknown as Sql, person);
            created += 1;
            continue;
          }
          if (!registryPersonChanged(current, person)) {
            unchanged += 1;
            continue;
          }
          await transaction`
            UPDATE ${transaction(REGISTRY_TABLE)} SET
              first_name = ${person.firstName},
              last_name = ${person.lastName},
              title = ${person.title},
              generation = ${person.generation},
              generation_raw = ${person.generationRaw},
              family_thread = ${person.familyThread},
              family_key = ${person.familyKey},
              country_of_origin = ${person.countryOfOrigin},
              date_of_birth = ${person.dateOfBirth},
              date_of_death = ${person.dateOfDeath},
              camps = ${transaction.json(person.camps)},
              fate_notes = ${transaction.json(person.fateNotes)},
              address = ${person.address},
              city = ${person.city},
              state = ${person.state},
              zip = ${person.zip},
              email = ${person.email},
              phone = ${person.phone},
              deceased = ${person.deceased},
              deceased_source = ${person.deceasedSource},
              updated_at = ${person.updatedAt}
            WHERE id = ${person.id}
          `;
          updated += 1;
        }
      });
      return { created, updated, unchanged };
    },
  };
}
