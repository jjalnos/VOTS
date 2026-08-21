import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureAdditionalAdminCuratorFromEnvironment } from "@/lib/auth/provision-admin-curator";

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubValidIdentity(): void {
  vi.stubEnv(
    "PROVISION_ADMIN_CURATOR_OPERATION_ID",
    "c7cf7270-a795-4ed2-8f2d-743e07166c5d",
  );
  vi.stubEnv("PROVISION_ADMIN_CURATOR_EMAIL", "new-owner@example.org");
  vi.stubEnv("PROVISION_ADMIN_CURATOR_DISPLAY_NAME", "New Owner");
  vi.stubEnv("PROVISION_ADMIN_CURATOR_PASSWORD", "a-strong-20-character-password");
  vi.stubEnv("STAFF_MFA_REQUIRED", "false");
}

describe("additional administrator/curator provisioning configuration", () => {
  it("is a no-op when its dedicated confirmation is absent", async () => {
    vi.stubEnv("PROVISION_ADMIN_CURATOR_CONFIRM", "   ");
    vi.stubEnv("PROVISION_ADMIN_CURATOR_PASSWORD", "not-read-while-disabled");

    await expect(ensureAdditionalAdminCuratorFromEnvironment()).resolves.toBe(
      "disabled",
    );
    expect(process.env.PROVISION_ADMIN_CURATOR_PASSWORD).toBe(
      "not-read-while-disabled",
    );
  });

  it("fails closed on an invalid confirmation and clears the plaintext", async () => {
    stubValidIdentity();
    vi.stubEnv("PROVISION_ADMIN_CURATOR_CONFIRM", "YES");

    await expect(ensureAdditionalAdminCuratorFromEnvironment()).rejects.toThrow(
      /confirmation is invalid/i,
    );
    expect(process.env.PROVISION_ADMIN_CURATOR_PASSWORD).toBeUndefined();
  });

  it("requires a fresh UUID v4 operation ID and clears the plaintext", async () => {
    stubValidIdentity();
    vi.stubEnv(
      "PROVISION_ADMIN_CURATOR_CONFIRM",
      "PROVISION_ADDITIONAL_ADMIN_CURATOR",
    );
    vi.stubEnv(
      "PROVISION_ADMIN_CURATOR_OPERATION_ID",
      "c7cf7270-a795-3ed2-8f2d-743e07166c5d",
    );

    await expect(ensureAdditionalAdminCuratorFromEnvironment()).rejects.toThrow(
      /fresh UUID v4/i,
    );
    expect(process.env.PROVISION_ADMIN_CURATOR_PASSWORD).toBeUndefined();
  });

  it("requires a password of at least 20 characters", async () => {
    stubValidIdentity();
    vi.stubEnv(
      "PROVISION_ADMIN_CURATOR_CONFIRM",
      "PROVISION_ADDITIONAL_ADMIN_CURATOR",
    );
    vi.stubEnv("PROVISION_ADMIN_CURATOR_PASSWORD", "x".repeat(19));

    await expect(ensureAdditionalAdminCuratorFromEnvironment()).rejects.toThrow(
      /incomplete or invalid/i,
    );
    expect(process.env.PROVISION_ADMIN_CURATOR_PASSWORD).toBeUndefined();
  });

  it("requires an MFA reference when staff MFA is enforced", async () => {
    stubValidIdentity();
    vi.stubEnv(
      "PROVISION_ADMIN_CURATOR_CONFIRM",
      "PROVISION_ADDITIONAL_ADMIN_CURATOR",
    );
    vi.stubEnv("STAFF_MFA_REQUIRED", "true");
    vi.stubEnv("PROVISION_ADMIN_CURATOR_MFA_REFERENCE", "");

    await expect(ensureAdditionalAdminCuratorFromEnvironment()).rejects.toThrow(
      /MFA provider reference/i,
    );
    expect(process.env.PROVISION_ADMIN_CURATOR_PASSWORD).toBeUndefined();
  });
});
