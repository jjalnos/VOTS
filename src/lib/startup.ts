import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { ensureInitialCuratorFromEnvironment } from "@/lib/auth/bootstrap-curator";
import { ensureDemonstrationViewerFromEnvironment } from "@/lib/auth/bootstrap-viewer";
import { ensureAdditionalAdminCuratorFromEnvironment } from "@/lib/auth/provision-admin-curator";
import { ensureSusanneOwnerPasswordRotationFromEnvironment } from "@/lib/auth/rotate-susanne-owner-password";
import {
  ensurePublishedCatalogFromEnvironment,
  syncDemonstrationFlagFromCode,
  syncPublishedIdentityCorrectionsFromCode,
  syncPortraitsFromCode,
} from "@/lib/publication/seed-catalog";

const startupState = globalThis as typeof globalThis & {
  votsApplicationStartup?: Promise<void>;
};

/** Runs checked-in database migrations before accepting live application work. */
export async function runApplicationStartup(): Promise<void> {
  if (process.env.DATABASE_AUTO_MIGRATE !== "true") {
    if (process.env.SUSANNE_OWNER_PASSWORD_ROTATION_CONFIRM) {
      delete process.env.SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD;
    }
    if (
      process.env.BOOTSTRAP_CONFIRM ||
      process.env.PROVISION_ADMIN_CURATOR_CONFIRM?.trim() ||
      process.env.SUSANNE_OWNER_PASSWORD_ROTATION_CONFIRM
    ) {
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
      idle_timeout: 0,
      max_lifetime: 0,
    });
    // Drizzle needs the root Sql object (including its parser options). With a
    // one-connection pool, the session lock and migration use that same session.
    try {
      await migrationSql`SELECT pg_advisory_lock(hashtext('vots-application-startup-v1'))`;
      const migrationDatabase = drizzle(migrationSql, { schema });
      await migrate(migrationDatabase, {
        migrationsFolder: path.join(process.cwd(), "drizzle"),
      });
      // Password rotation runs before any startup path that can create a user,
      // so it can only ever update an identity that already existed.
      try {
        const status = await ensureSusanneOwnerPasswordRotationFromEnvironment();
        if (status === "password-rotated") {
          console.log("Owner password rotation completed.");
        } else if (status === "already-current") {
          console.log("Owner password rotation was already completed.");
        }
      } catch {
        console.error(
          "Owner password rotation was skipped after a validation or execution failure. Review the protected deployment configuration.",
        );
      }
      await ensureInitialCuratorFromEnvironment();
      // Additional owners are an exceptional, one-time operator action. Any
      // malformed or unsafe request is reported without preventing the archive
      // from serving. Never include the thrown error here: database drivers and
      // future validation errors can contain protected configuration values.
      try {
        const status = await ensureAdditionalAdminCuratorFromEnvironment();
        if (status === "created") {
          console.log("Additional administrator/curator provisioning completed.");
        } else if (status === "already-present") {
          console.log(
            "Additional administrator/curator provisioning was already completed.",
          );
        }
      } catch {
        console.error(
          "Additional administrator/curator provisioning was skipped after a validation or execution failure. Review the protected deployment configuration.",
        );
      }
      // The demonstration account is a convenience, not part of the archive's
      // identity. A mistake in its configuration must never stop the archive
      // itself from starting, so this failure is reported and stepped over.
      // The curator bootstrap above stays fatal.
      try {
        await ensureDemonstrationViewerFromEnvironment();
      } catch (error) {
        console.error(
          "The demonstration viewer bootstrap was skipped:",
          error instanceof Error ? error.message : error,
        );
      }
      // Publishing the reviewed catalog is likewise optional. A failure here
      // must leave the archive serving, not stop it from starting.
      try {
        const status = await ensurePublishedCatalogFromEnvironment();
        if (status !== "disabled") console.log(`Public catalog ${status}.`);
      } catch (error) {
        console.error(
          "The public catalog publication was skipped:",
          error instanceof Error ? error.message : error,
        );
      }
      // Portraits follow the code without a flag: update-only against records
      // that already exist, and a failure never stops the archive.
      try {
        await syncPortraitsFromCode();
        await syncDemonstrationFlagFromCode();
        await syncPublishedIdentityCorrectionsFromCode();
      } catch (error) {
        console.error(
          "The published catalog sync was skipped:",
          error instanceof Error ? error.message : error,
        );
      }
    } finally {
      await migrationSql`SELECT pg_advisory_unlock(hashtext('vots-application-startup-v1'))`
        .catch(() => undefined);
      await migrationSql.end({ timeout: 5 });
    }
  })().catch((error) => {
    delete startupState.votsApplicationStartup;
    throw error;
  });
  await startupState.votsApplicationStartup;
}
