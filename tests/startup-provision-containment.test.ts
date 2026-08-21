import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ProvisionStatus = "disabled" | "created" | "already-present";

const startupMocks = vi.hoisted(() => {
  const migrationSql = Object.assign(vi.fn(async () => []), {
    end: vi.fn(async () => undefined),
  });

  return {
    migrationSql,
    migrate: vi.fn(async () => undefined),
    ensureInitialCurator: vi.fn(async () => undefined),
    ensureAdditionalAdminCurator: vi.fn<() => Promise<ProvisionStatus>>(
      async () => "disabled",
    ),
    ensureDemonstrationViewer: vi.fn(async () => undefined),
    ensurePublishedCatalog: vi.fn(async () => "disabled"),
    syncPortraits: vi.fn(async () => undefined),
    syncDemonstrationFlag: vi.fn(async () => undefined),
    syncPublishedIdentityCorrections: vi.fn(async () => undefined),
  };
});

vi.mock("postgres", () => ({
  default: vi.fn(() => startupMocks.migrationSql),
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({})),
}));

vi.mock("drizzle-orm/postgres-js/migrator", () => ({
  migrate: startupMocks.migrate,
}));

vi.mock("@/lib/auth/bootstrap-curator", () => ({
  ensureInitialCuratorFromEnvironment: startupMocks.ensureInitialCurator,
}));

vi.mock("@/lib/auth/bootstrap-viewer", () => ({
  ensureDemonstrationViewerFromEnvironment:
    startupMocks.ensureDemonstrationViewer,
}));

vi.mock("@/lib/auth/provision-admin-curator", () => ({
  ensureAdditionalAdminCuratorFromEnvironment:
    startupMocks.ensureAdditionalAdminCurator,
}));

vi.mock("@/lib/publication/seed-catalog", () => ({
  ensurePublishedCatalogFromEnvironment: startupMocks.ensurePublishedCatalog,
  syncDemonstrationFlagFromCode: startupMocks.syncDemonstrationFlag,
  syncPublishedIdentityCorrectionsFromCode: startupMocks.syncPublishedIdentityCorrections,
  syncPortraitsFromCode: startupMocks.syncPortraits,
}));

function resetStartupPromise(): void {
  delete (
    globalThis as typeof globalThis & {
      votsApplicationStartup?: Promise<void>;
    }
  ).votsApplicationStartup;
}

beforeEach(() => {
  vi.resetModules();
  resetStartupPromise();
  vi.stubEnv("DATABASE_AUTO_MIGRATE", "true");
  vi.stubEnv("DATABASE_URL", "postgres://startup-test.invalid/archive");
  vi.stubEnv("DATA_ADAPTER", "postgres");
  vi.stubEnv("DATABASE_SSL", "false");

  startupMocks.migrationSql.mockClear();
  startupMocks.migrationSql.end.mockClear();
  startupMocks.migrate.mockClear();
  startupMocks.ensureInitialCurator.mockReset().mockResolvedValue(undefined);
  startupMocks.ensureAdditionalAdminCurator.mockReset().mockResolvedValue("disabled");
  startupMocks.ensureDemonstrationViewer.mockReset().mockResolvedValue(undefined);
  startupMocks.ensurePublishedCatalog.mockReset().mockResolvedValue("disabled");
  startupMocks.syncPortraits.mockReset().mockResolvedValue(undefined);
  startupMocks.syncDemonstrationFlag.mockReset().mockResolvedValue(undefined);
  startupMocks.syncPublishedIdentityCorrections.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetStartupPromise();
});

describe("additional administrator/curator startup containment", () => {
  it("keeps the application starting when provisioning configuration is malformed without logging its secret", async () => {
    const secret = "do-not-log-this-provisioning-secret";
    vi.stubEnv("PROVISION_ADMIN_CURATOR_CONFIRM", "INVALID_CONFIRMATION");
    vi.stubEnv("PROVISION_ADMIN_CURATOR_PASSWORD", secret);
    startupMocks.ensureAdditionalAdminCurator.mockImplementation(async () => {
      delete process.env.PROVISION_ADMIN_CURATOR_PASSWORD;
      throw new Error(`Malformed provisioning configuration contained ${secret}`);
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { runApplicationStartup } = await import("@/lib/startup");

    await expect(runApplicationStartup()).resolves.toBeUndefined();

    expect(startupMocks.ensureDemonstrationViewer).toHaveBeenCalledOnce();
    expect(startupMocks.ensurePublishedCatalog).toHaveBeenCalledOnce();
    expect(startupMocks.syncPortraits).toHaveBeenCalledOnce();
    expect(startupMocks.syncDemonstrationFlag).toHaveBeenCalledOnce();
    expect(startupMocks.syncPublishedIdentityCorrections).toHaveBeenCalledOnce();
    expect(process.env.PROVISION_ADMIN_CURATOR_PASSWORD).toBeUndefined();
    const loggedText = errorLog.mock.calls.flat().map(String).join(" ");
    expect(loggedText).toMatch(/provisioning was skipped/i);
    expect(loggedText).toMatch(/protected deployment configuration/i);
    expect(loggedText).not.toContain(secret);
    expect(loggedText).not.toContain("Malformed provisioning configuration");
  });

  it.each([
    ["created", "Additional administrator/curator provisioning completed."],
    [
      "already-present",
      "Additional administrator/curator provisioning was already completed.",
    ],
  ] as const)("logs the sanitized %s status", async (status, expectedLog) => {
    startupMocks.ensureAdditionalAdminCurator.mockResolvedValue(status);
    const statusLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { runApplicationStartup } = await import("@/lib/startup");

    await expect(runApplicationStartup()).resolves.toBeUndefined();

    expect(statusLog).toHaveBeenCalledWith(expectedLog);
  });
});
