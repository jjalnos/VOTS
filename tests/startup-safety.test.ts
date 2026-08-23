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

  it("refuses additional owner provisioning when checked-in migration startup is disabled", async () => {
    vi.stubEnv("DATABASE_AUTO_MIGRATE", "false");
    vi.stubEnv(
      "PROVISION_ADMIN_CURATOR_CONFIRM",
      "PROVISION_ADDITIONAL_ADMIN_CURATOR",
    );

    await expect(runApplicationStartup()).rejects.toThrow(/migrations must be enabled/i);
  });

  it("refuses owner password rotation without migrations and clears its plaintext", async () => {
    vi.stubEnv("DATABASE_AUTO_MIGRATE", "false");
    vi.stubEnv(
      "SUSANNE_OWNER_PASSWORD_ROTATION_CONFIRM",
      "ROTATE_EXISTING_SUSANNE_OWNER_PASSWORD",
    );
    vi.stubEnv(
      "SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD",
      "do-not-retain-this-plaintext",
    );

    await expect(runApplicationStartup()).rejects.toThrow(/migrations must be enabled/i);
    expect(process.env.SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD).toBeUndefined();
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
      "0004_survivor_registry",
      "0005_viewer_role",
      "0006_survivor_portrait",
      "0007_auth_session_version",
      "0008_auth_password_change_rate_limits",
      "0009_password_reset",
      "0010_file_blobs",
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
    expect(startup.indexOf("await migrate(")).toBeLessThan(
      startup.indexOf("await ensureAdditionalAdminCuratorFromEnvironment()"),
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

  it("keeps additional administrator/curator provisioning one-time and operator-audited", () => {
    const provisioner = readFileSync(
      "src/lib/auth/provision-admin-curator.ts",
      "utf8",
    );
    expect(provisioner).toContain("PROVISION_ADDITIONAL_ADMIN_CURATOR");
    expect(provisioner).toContain("PROVISION_ADMIN_CURATOR_OPERATION_ID");
    expect(provisioner).toContain("delete process.env.PROVISION_ADMIN_CURATOR_PASSWORD");
    expect(provisioner).toContain("password.length < 20");
    expect(provisioner).toContain(
      "sql`lower(${users.email}) = ${configuration.email}`",
    );
    expect(provisioner).toContain("id: configuration.operationId");
    expect(provisioner).toContain("onConflictDoNothing({ target: auditEvents.id })");
    expect(provisioner).toContain(
      'action: "identity.operator_admin_curator_provisioned"',
    );
    expect(provisioner).toContain("actorUserId: null");
    expect(provisioner).toContain('role: "admin", grantedBy: null');
    expect(provisioner).toContain('role: "curator", grantedBy: null');
    expect(provisioner).not.toMatch(/metadata:[\s\S]{0,300}(password|passwordHash)/);
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
      "sessionVersion: sql`${users.sessionVersion} + 1`",
    );
    expect(bootstrap).toContain(
      "Initial-curator password rotation refused because the configured identity does not exist.",
    );
    expect(bootstrap.indexOf('!names.has("admin")')).toBeLessThan(
      bootstrap.indexOf("if (rotationId)"),
    );
  });

  it("keeps existing-owner recovery scoped, one-time, and operator-audited", () => {
    const rotation = readFileSync(
      "src/lib/auth/rotate-susanne-owner-password.ts",
      "utf8",
    );
    expect(rotation).toContain("ROTATE_EXISTING_SUSANNE_OWNER_PASSWORD");
    expect(rotation).toContain("SUSANNE_OWNER_PASSWORD_ROTATION_OPERATION_ID");
    expect(rotation).toContain(
      "delete process.env.SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD",
    );
    expect(rotation).toContain(
      'const PINNED_OWNER_EMAIL = "jeremy@clicksmith.net"',
    );
    expect(rotation).toContain("targetEmail !== PINNED_OWNER_EMAIL");
    expect(rotation).toContain("ownerEmail !== PINNED_OWNER_EMAIL");
    expect(rotation).toContain('roleNames.has("admin")');
    expect(rotation).toContain('roleNames.has("curator")');
    expect(rotation).toContain(".for(\"update\")");
    expect(rotation).toContain("onConflictDoNothing({ target: auditEvents.id })");
    expect(rotation).toContain(
      'action: "identity.susanne_owner_password_rotated"',
    );
    expect(rotation).toContain("actorUserId: null");
    const metadataBlock = rotation.match(
      /metadata:\s*{[\s\S]*?},\s*occurredAt/,
    )?.[0];
    expect(metadataBlock).toBeDefined();
    expect(metadataBlock).not.toMatch(/password(?:Hash)?\s*:/i);
    expect(rotation).not.toContain(".insert(users)");
    expect(rotation).not.toContain(".insert(userRoles)");
    expect(rotation).not.toContain(".update(userRoles)");
    expect(rotation).toContain(
      "sessionVersion: sql`${users.sessionVersion} + 1`",
    );
  });
});
