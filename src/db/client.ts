import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

type ArchiveDatabase = ReturnType<typeof drizzle<typeof schema>>;

const databaseGlobal = globalThis as typeof globalThis & {
  hmmsaDatabase?: ArchiveDatabase;
  hmmsaSqlClient?: ReturnType<typeof postgres>;
};

function databasePoolSize(): number {
  const configured = Number(process.env.DATABASE_POOL_MAX ?? "2");
  return Number.isSafeInteger(configured) && configured >= 1 && configured <= 8
    ? configured
    : 2;
}

export function getDatabase(): ArchiveDatabase {
  if (databaseGlobal.hmmsaDatabase) return databaseGlobal.hmmsaDatabase;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required when DATA_ADAPTER=postgres.");
  }
  const sqlClient = postgres(databaseUrl, {
    max: databasePoolSize(),
    ssl: process.env.DATABASE_SSL === "require" ? "require" : false,
    prepare: false,
  });
  const database = drizzle(sqlClient, { schema });
  databaseGlobal.hmmsaSqlClient = sqlClient;
  databaseGlobal.hmmsaDatabase = database;
  return database;
}

export async function closeDatabase(): Promise<void> {
  if (databaseGlobal.hmmsaSqlClient) {
    await databaseGlobal.hmmsaSqlClient.end({ timeout: 5 });
  }
  delete databaseGlobal.hmmsaSqlClient;
  delete databaseGlobal.hmmsaDatabase;
}
