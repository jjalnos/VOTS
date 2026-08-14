import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

type ArchiveDatabase = ReturnType<typeof drizzle<typeof schema>>;

const databaseGlobal = globalThis as typeof globalThis & {
  hmmsaDatabase?: ArchiveDatabase;
  hmmsaSqlClient?: ReturnType<typeof postgres>;
};

export function getDatabase(): ArchiveDatabase {
  if (databaseGlobal.hmmsaDatabase) return databaseGlobal.hmmsaDatabase;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required when DATA_ADAPTER=postgres.");
  }
  const sqlClient = postgres(databaseUrl, {
    max: Number(process.env.DATABASE_POOL_MAX ?? "10"),
    ssl: process.env.DATABASE_SSL === "require" ? "require" : false,
    prepare: false,
  });
  const database = drizzle(sqlClient, { schema });
  databaseGlobal.hmmsaSqlClient = sqlClient;
  databaseGlobal.hmmsaDatabase = database;
  return database;
}
