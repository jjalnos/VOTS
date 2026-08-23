import { describe, expect, it } from "vitest";
import { can, visibleArchiveItems, type Actor } from "@/lib/auth/policy";
import { seedArchiveItems } from "@/lib/data/seed";

const curator: Actor = { userId: "curator", email: "curator@test", displayName: "Curator", roles: ["curator"], mfaVerified: true };
const curatorWithoutMfa: Actor = { ...curator, mfaVerified: false };
const admin: Actor = { userId: "admin", email: "admin@test", displayName: "Admin", roles: ["admin"], mfaVerified: true };
const family: Actor = { userId: "family", email: "family@test", displayName: "Family", roles: ["family"], familyId: "family-demo", mfaVerified: true };

describe("authorization boundaries", () => {
  it("requires MFA for curator and admin actions", () => {
    expect(can(curator, "publish_content")).toBe(true);
    expect(can(curatorWithoutMfa, "publish_content")).toBe(false);
    expect(can(admin, "manage_access")).toBe(true);
  });

  it("keeps admin and curator duties separate", () => {
    expect(can(admin, "publish_content")).toBe(false);
    expect(can(curator, "manage_access")).toBe(false);
  });

  it("lets an administrator upload originals without curatorial duties", () => {
    expect(can(admin, "upload_original")).toBe(true);
    expect(can({ ...admin, mfaVerified: false }, "upload_original")).toBe(false);
    expect(can(admin, "create_record")).toBe(false);
    expect(can(admin, "review_content")).toBe(false);
  });

  it("keeps upload_original away from curators, families, and viewers", () => {
    expect(can(curator, "upload_original")).toBe(false);
    expect(can(family, "upload_original")).toBe(false);
    const viewer: Actor = { userId: "viewer", email: "viewer@test", displayName: "Viewer", roles: ["viewer"], mfaVerified: false };
    expect(can(viewer, "upload_original")).toBe(false);
    expect(can(viewer, "contribute_upload", "family-demo")).toBe(false);
  });

  it("limits a family contributor to the invited family group", () => {
    expect(can(family, "contribute_upload", "family-demo")).toBe(true);
    expect(can(family, "contribute_upload", "family-private-control")).toBe(false);
    expect(visibleArchiveItems(seedArchiveItems, family).every((item) => item.familyId === "family-demo")).toBe(true);
  });
});
