import { afterEach, describe, expect, it, vi } from "vitest";
import { actorFromDatabaseIdentity, type DatabaseIdentity } from "@/lib/auth/database-auth";
import { authenticateDevelopmentUser } from "@/lib/auth/dev-auth";
import { resolveAuthProvider, resolveConfiguredSessionActor } from "@/lib/auth/provider";
import type { SessionPayload } from "@/lib/auth/session-token";

const identity: DatabaseIdentity = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "person@example.org",
  displayName: "Archive user",
  passwordHash: null,
  sessionVersion: 1,
  mfaRequired: false,
  mfaProviderReference: null,
  active: true,
  roles: ["family"],
  activeFamilyIds: ["00000000-0000-4000-8000-000000000002"],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authentication provider boundaries", () => {
  it("never enables the development provider in production", () => {
    expect(resolveAuthProvider({ configured: "development", developmentEnabled: true, nodeEnvironment: "production" })).toBe("unconfigured");
    expect(resolveAuthProvider({ configured: "database", developmentEnabled: false, nodeEnvironment: "production" })).toBe("database");
  });

  it("requires exactly one active family membership", () => {
    expect(actorFromDatabaseIdentity(identity, false)?.familyId).toBe(identity.activeFamilyIds[0]);
    expect(actorFromDatabaseIdentity({ ...identity, activeFamilyIds: [] }, false)).toBeNull();
    expect(actorFromDatabaseIdentity({ ...identity, activeFamilyIds: ["one", "two"] }, false)).toBeNull();
  });

  it("invalidates a session whose version predates credential rotation", () => {
    expect(actorFromDatabaseIdentity(identity, false, 1)).not.toBeNull();
    expect(actorFromDatabaseIdentity({ ...identity, sessionVersion: 2 }, false, 1)).toBeNull();
  });

  it("requires MFA for every staff identity", () => {
    vi.stubEnv("STAFF_MFA_REQUIRED", "true");
    const curator: DatabaseIdentity = { ...identity, roles: ["curator"], activeFamilyIds: [], mfaRequired: true, mfaProviderReference: "museum-idp-user-1" };
    expect(actorFromDatabaseIdentity(curator, false)).toBeNull();
    expect(actorFromDatabaseIdentity(curator, true)?.mfaVerified).toBe(true);
    expect(actorFromDatabaseIdentity({ ...curator, mfaRequired: false }, true)).toBeNull();
  });

  it("allows password-only staff access while the staging MFA policy is disabled", () => {
    vi.stubEnv("STAFF_MFA_REQUIRED", "false");
    const curator: DatabaseIdentity = { ...identity, roles: ["curator"], activeFamilyIds: [], mfaRequired: true, mfaProviderReference: "museum-idp-user-1" };
    expect(actorFromDatabaseIdentity(curator, false)?.mfaVerified).toBe(true);
  });

  it("bypasses the development MFA code only while the staging policy is disabled", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEV_AUTH_ENABLED", "true");
    vi.stubEnv("STAFF_MFA_REQUIRED", "false");
    expect(authenticateDevelopmentUser("curator@archive.local", "curator-demo")?.mfaVerified).toBe(true);

    vi.stubEnv("STAFF_MFA_REQUIRED", "true");
    expect(authenticateDevelopmentUser("curator@archive.local", "curator-demo")).toBeNull();
    expect(authenticateDevelopmentUser("curator@archive.local", "curator-demo", "000000")?.mfaVerified).toBe(true);
  });

  it("stops satisfying staff authorization when MFA is re-enabled", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEV_AUTH_ENABLED", "true");
    vi.stubEnv("AUTH_PROVIDER", "development");
    const bypassSession: SessionPayload = {
      userId: "staff-1",
      email: "staff@example.org",
      displayName: "Staff",
      roles: ["curator"],
      mfaVerified: false,
      sessionVersion: 1,
      issuedAt: 1,
      expiresAt: 2,
    };

    vi.stubEnv("STAFF_MFA_REQUIRED", "false");
    expect((await resolveConfiguredSessionActor(bypassSession))?.mfaVerified).toBe(true);

    vi.stubEnv("STAFF_MFA_REQUIRED", "true");
    expect((await resolveConfiguredSessionActor(bypassSession))?.mfaVerified).toBe(false);
  });
});
