import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureSusanneOwnerPasswordRotationFromEnvironment } from "@/lib/auth/rotate-susanne-owner-password";

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubValidRotation(): void {
  vi.stubEnv(
    "SUSANNE_OWNER_PASSWORD_ROTATION_CONFIRM",
    "ROTATE_EXISTING_SUSANNE_OWNER_PASSWORD",
  );
  vi.stubEnv(
    "SUSANNE_OWNER_PASSWORD_ROTATION_OPERATION_ID",
    "c7cf7270-a795-4ed2-8f2d-743e07166c5d",
  );
  vi.stubEnv(
    "SUSANNE_OWNER_PASSWORD_ROTATION_EMAIL",
    "jeremy@clicksmith.net",
  );
  vi.stubEnv("SUSANNE_OWNER_EMAIL", "jeremy@clicksmith.net");
  vi.stubEnv(
    "SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD",
    "a-valid-16-character-password",
  );
}

describe("Susanne owner password rotation configuration", () => {
  it("is disabled without its exact confirmation and leaves the secret unread", async () => {
    vi.stubEnv(
      "SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD",
      "not-read-while-disabled",
    );

    await expect(
      ensureSusanneOwnerPasswordRotationFromEnvironment(),
    ).resolves.toBe("disabled");
    expect(process.env.SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD).toBe(
      "not-read-while-disabled",
    );
  });

  it("fails closed on an invalid confirmation and clears the plaintext", async () => {
    stubValidRotation();
    vi.stubEnv("SUSANNE_OWNER_PASSWORD_ROTATION_CONFIRM", "YES");

    await expect(
      ensureSusanneOwnerPasswordRotationFromEnvironment(),
    ).rejects.toThrow(/^The controlled owner password rotation was refused\.$/);
    expect(process.env.SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD).toBeUndefined();
  });

  it("requires a fresh UUID v4 operation ID", async () => {
    stubValidRotation();
    vi.stubEnv(
      "SUSANNE_OWNER_PASSWORD_ROTATION_OPERATION_ID",
      "c7cf7270-a795-3ed2-8f2d-743e07166c5d",
    );

    await expect(
      ensureSusanneOwnerPasswordRotationFromEnvironment(),
    ).rejects.toThrow(/rotation was refused/i);
    expect(process.env.SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD).toBeUndefined();
  });

  it("requires the exact configured Susanne room owner", async () => {
    stubValidRotation();
    vi.stubEnv(
      "SUSANNE_OWNER_PASSWORD_ROTATION_EMAIL",
      "other@example.org",
    );

    await expect(
      ensureSusanneOwnerPasswordRotationFromEnvironment(),
    ).rejects.toThrow(/rotation was refused/i);
    expect(process.env.SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD).toBeUndefined();
  });

  it("rejects non-canonical email input", async () => {
    stubValidRotation();
    vi.stubEnv(
      "SUSANNE_OWNER_PASSWORD_ROTATION_EMAIL",
      "Jeremy@clicksmith.net",
    );

    await expect(
      ensureSusanneOwnerPasswordRotationFromEnvironment(),
    ).rejects.toThrow(/rotation was refused/i);
  });

  it("requires a password of at least 16 characters", async () => {
    stubValidRotation();
    vi.stubEnv("SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD", "x".repeat(15));

    await expect(
      ensureSusanneOwnerPasswordRotationFromEnvironment(),
    ).rejects.toThrow(/rotation was refused/i);
    expect(process.env.SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD).toBeUndefined();
  });
});
