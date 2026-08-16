import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runApplicationStartup } from "@/lib/startup";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Cloudways startup safety", () => {
  it("does nothing without the explicit migration switch", async () => {
    vi.stubEnv("DATABASE_AUTO_MIGRATE", "false");
    vi.stubEnv("BOOTSTRAP_CONFIRM", "");

    await expect(runApplicationStartup()).resolves.toBeUndefined();
  });

  it("refuses bootstrap when checked-in migration startup is disabled", async () => {
    vi.stubEnv("DATABASE_AUTO_MIGRATE", "false");
    vi.stubEnv("BOOTSTRAP_CONFIRM", "CREATE_INITIAL_ROBIN_CURATOR");

    await expect(runApplicationStartup()).rejects.toThrow(/migrations must be enabled/i);
  });

  it("journals encrypted archive and paid-usage schema before bootstrap", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
      entries: Array<{ tag: string }>;
    };
    expect(journal.entries.map((entry) => entry.tag)).toEqual([
      "0000_premium_khan",
      "0001_encrypted_robin_archive",
      "0002_external_ai_usage_governance",
      "0003_auth_login_rate_limits",
    ]);

    const archiveMigration = readFileSync(
      "drizzle/0001_encrypted_robin_archive.sql",
      "utf8",
    );
    expect(archiveMigration).toContain('"ciphertext" bytea NOT NULL');
    expect(archiveMigration).toContain('octet_length("nonce") = 12');
    expect(archiveMigration).toContain('"workspace_id" uuid NOT NULL REFERENCES "users"');
    expect(archiveMigration).toContain("'quarantined'");

    const startup = readFileSync("src/lib/startup.ts", "utf8");
    expect(startup.indexOf("await migrate(")).toBeLessThan(
      startup.indexOf("await ensureInitialCuratorFromEnvironment()"),
    );
    expect(startup).not.toContain(".reserve()");
    expect(startup).toContain("drizzle(migrationSql, { schema })");
    expect(startup).toContain("idle_timeout: 0");
    expect(startup).toContain("max_lifetime: 0");
    expect(startup).toContain(
      "await migrationSql`SELECT pg_advisory_lock(hashtext('vots-application-startup-v1'))`",
    );
    expect(startup).toContain(
      "await migrationSql`SELECT pg_advisory_unlock(hashtext('vots-application-startup-v1'))`",
    );
  });

  it("requires an explicit, audited one-time confirmation before rotating Robin's password", () => {
    const bootstrap = readFileSync("src/lib/auth/bootstrap-curator.ts", "utf8");
    expect(bootstrap).toContain("ROTATE_INITIAL_ROBIN_CURATOR_PASSWORD");
    expect(bootstrap).toContain("BOOTSTRAP_ROTATION_ID");
    expect(bootstrap).toContain("id: rotationId");
    expect(bootstrap).toContain("onConflictDoNothing({ target: auditEvents.id })");
    expect(bootstrap).toContain('action: "identity.initial_curator_password_rotated"');
    expect(bootstrap).toContain("actorUserId: null");
    expect(bootstrap).toContain(
      "Initial-curator password rotation refused because the configured identity does not exist.",
    );
    expect(bootstrap.indexOf('!names.has("admin")')).toBeLessThan(
      bootstrap.indexOf("if (rotationId)"),
    );
  });
});
