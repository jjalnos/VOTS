import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { ensureInitialCuratorFromEnvironment } from "@/lib/auth/bootstrap-curator";

const startupState = globalThis as typeof globalThis & {
  votsApplicationStartup?: Promise<void>;
};

/** Runs checked-in database migrations before accepting live application work. */
export async function runApplicationStartup(): Promise<void> {
  if (process.env.DATABASE_AUTO_MIGRATE !== "true") {
    if (process.env.BOOTSTRAP_CONFIRM) {
      throw new Error("Database migrations must be enabled for the controlled bootstrap.");
    }
    return;
  }
  if (!process.env.DATABASE_URL || process.env.DATA_ADAPTER !== "postgres") {
    throw new Error("PostgreSQL is required when automatic database migrations are enabled.");
  }
  startupState.votsApplicationStartup ??= (async () => {
    const migrationSql = postgres(process.env.DATABASE_URL!, {
      max: 1,
      ssl: process.env.DATABASE_SSL === "require" ? "require" : false,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 20,
    });
    const connection = await migrationSql.reserve();
    try {
      await connection`SELECT pg_advisory_lock(hashtext('vots-application-startup-v1'))`;
      const migrationDatabase = drizzle(connection, { schema });
      await migrate(migrationDatabase, {
        migrationsFolder: path.join(process.cwd(), "drizzle"),
      });
      await ensureInitialCuratorFromEnvironment();
    } finally {
      await connection`SELECT pg_advisory_unlock(hashtext('vots-application-startup-v1'))`
        .catch(() => undefined);
      connection.release();
      await migrationSql.end({ timeout: 5 });
    }
  })().catch((error) => {
    delete startupState.votsApplicationStartup;
    throw error;
  });
  await startupState.votsApplicationStartup;
}
