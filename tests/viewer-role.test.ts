import { describe, expect, it } from "vitest";
import { can, type Actor } from "@/lib/auth/policy";
import { redactRegistryContact, seedRegistryPeople } from "@/lib/survivor-registry/store";
import { authenticateDevelopmentUser } from "@/lib/auth/dev-auth";

const viewer: Actor = {
  userId: "user-viewer-demo",
  email: "demo@voicesoftheshoah.org",
  displayName: "Archive demonstration",
  roles: ["viewer"],
  mfaVerified: false,
};

const curator: Actor = {
  userId: "user-curator-demo",
  email: "curator@archive.local",
  displayName: "Development Curator",
  roles: ["curator"],
  mfaVerified: true,
};

describe("the shared demonstration account", () => {
  it("can read the registry and nothing else", () => {
    expect(can(viewer, "view_survivor_registry")).toBe(true);
    expect(can(viewer, "view_archive_workspace")).toBe(false);
    expect(can(viewer, "create_record")).toBe(false);
    expect(can(viewer, "publish_content")).toBe(false);
    expect(can(viewer, "contribute_upload")).toBe(false);
    expect(can(viewer, "run_external_research")).toBe(false);
    expect(can(viewer, "manage_access")).toBe(false);
  });

  it("still lets a verified curator read and edit the registry", () => {
    expect(can(curator, "view_survivor_registry")).toBe(true);
    expect(can(curator, "create_record")).toBe(true);
  });

  it("withholds edit rights from a curator session that has not passed MFA", () => {
    const unverified: Actor = { ...curator, mfaVerified: false };
    expect(can(unverified, "create_record")).toBe(false);
  });

  it("removes every way to contact a living family from a redacted record", () => {
    const withContact = seedRegistryPeople().find((person) => person.email)!;
    const redacted = redactRegistryContact(withContact);
    expect(redacted.email).toBe("");
    expect(redacted.phone).toBe("");
    expect(redacted.address).toBe("");
    expect(redacted.zip).toBe("");
    expect(redacted.notes).toBe("");
    // The record itself still reads as a record.
    expect(redacted.firstName).toBe(withContact.firstName);
    expect(redacted.generation).toBe(withContact.generation);
    expect(redacted.familyKey).toBe(withContact.familyKey);
    expect(redacted.deceased).toBe(withContact.deceased);
  });

  it("authenticates in development with the shareable password", () => {
    const previous = process.env.DEV_AUTH_ENABLED;
    process.env.DEV_AUTH_ENABLED = "true";
    try {
      const actor = authenticateDevelopmentUser(
        "demo@voicesoftheshoah.org",
        "shoah-archive-demo",
      );
      expect(actor?.roles).toEqual(["viewer"]);
      expect(authenticateDevelopmentUser("demo@voicesoftheshoah.org", "wrong")).toBeNull();
    } finally {
      process.env.DEV_AUTH_ENABLED = previous;
    }
  });
});
