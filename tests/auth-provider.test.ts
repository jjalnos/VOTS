import { describe, expect, it } from "vitest";
import { actorFromDatabaseIdentity, type DatabaseIdentity } from "@/lib/auth/database-auth";
import { resolveAuthProvider } from "@/lib/auth/provider";

const identity: DatabaseIdentity = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "person@example.org",
  displayName: "Archive user",
  passwordHash: null,
  mfaRequired: false,
  mfaProviderReference: null,
  active: true,
  roles: ["family"],
  activeFamilyIds: ["00000000-0000-4000-8000-000000000002"],
};

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

  it("requires MFA for every staff identity", () => {
    const curator: DatabaseIdentity = { ...identity, roles: ["curator"], activeFamilyIds: [], mfaRequired: true, mfaProviderReference: "museum-idp-user-1" };
    expect(actorFromDatabaseIdentity(curator, false)).toBeNull();
    expect(actorFromDatabaseIdentity(curator, true)?.mfaVerified).toBe(true);
    expect(actorFromDatabaseIdentity({ ...curator, mfaRequired: false }, true)).toBeNull();
  });
});
