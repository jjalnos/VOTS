import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const passwordChangeMocks = vi.hoisted(() => ({
  configuredAuthProvider: vi.fn(() => "database"),
  getActorFromRequest: vi.fn(),
  changeDatabaseUserPassword: vi.fn(),
}));

vi.mock("@/lib/auth/provider", () => ({
  configuredAuthProvider: passwordChangeMocks.configuredAuthProvider,
}));

vi.mock("@/lib/auth/server-session", () => ({
  getActorFromRequest: passwordChangeMocks.getActorFromRequest,
  SESSION_COOKIE: "hmmsa_archive_session",
}));

vi.mock("@/lib/auth/change-password", () => ({
  changeDatabaseUserPassword: passwordChangeMocks.changeDatabaseUserPassword,
}));

import { POST as changePassword } from "@/app/api/auth/change-password/route";

const actor = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "person@example.org",
  displayName: "Archive owner",
  roles: ["admin", "curator"],
  mfaVerified: true,
};

function request(
  body: string,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://archive.example/api/auth/change-password", {
    method: "POST",
    headers: {
      Origin: "https://archive.example",
      "Content-Type": "application/json",
      Cookie: "hmmsa_archive_session=signed-token",
      ...headers,
    },
    body,
  });
}

function validBody(overrides: Record<string, string> = {}): string {
  return JSON.stringify({
    currentPassword: "current-password-value",
    newPassword: "new-password-value-2026",
    ...overrides,
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://archive.example");
  passwordChangeMocks.configuredAuthProvider.mockReset().mockReturnValue("database");
  passwordChangeMocks.getActorFromRequest.mockReset().mockResolvedValue(actor);
  passwordChangeMocks.changeDatabaseUserPassword.mockReset().mockResolvedValue("changed");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authenticated password-change route", () => {
  it("rejects cross-site, non-JSON, malformed, and oversized requests before credential work", async () => {
    const crossSite = await changePassword(
      request(validBody(), { Origin: "https://attacker.example" }),
    );
    const wrongMediaType = await changePassword(
      request(validBody(), { "Content-Type": "text/plain" }),
    );
    const malformed = await changePassword(request("{"));
    const oversized = await changePassword(
      request(validBody(), { "Content-Length": "4097" }),
    );

    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toEqual({
      error: "Cross-site password-change requests are not accepted.",
    });
    expect(wrongMediaType.status).toBe(400);
    expect(await wrongMediaType.json()).toEqual({
      error: "Invalid password-change request.",
    });
    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({
      error: "Password-change request is too large.",
    });
    expect(passwordChangeMocks.getActorFromRequest).not.toHaveBeenCalled();
    expect(passwordChangeMocks.changeDatabaseUserPassword).not.toHaveBeenCalled();
  });

  it("enforces a strict 16-to-200-character new password contract", async () => {
    const tooShort = await changePassword(
      request(validBody({ newPassword: "x".repeat(15) })),
    );
    const tooLong = await changePassword(
      request(validBody({ newPassword: "x".repeat(201) })),
    );
    const extraField = await changePassword(
      request(JSON.stringify({
        currentPassword: "current-password-value",
        newPassword: "new-password-value-2026",
        userId: "somebody-else",
      })),
    );

    for (const response of [tooShort, tooLong, extraField]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Invalid password-change request.",
      });
    }
    expect(passwordChangeMocks.changeDatabaseUserPassword).not.toHaveBeenCalled();
  });

  it("requires a current database-backed session and clears an invalid cookie", async () => {
    passwordChangeMocks.getActorFromRequest.mockResolvedValue(null);

    const response = await changePassword(request(validBody()));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Sign in again before changing your password.",
    });
    expect(response.headers.get("set-cookie")).toContain(
      "hmmsa_archive_session=;",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(passwordChangeMocks.changeDatabaseUserPassword).not.toHaveBeenCalled();
  });

  it("does not distinguish an incorrect current password from a reused password", async () => {
    passwordChangeMocks.changeDatabaseUserPassword.mockResolvedValue("rejected");

    const incorrect = await changePassword(request(validBody()));
    const reused = await changePassword(
      request(validBody({
        currentPassword: "same-password-value",
        newPassword: "same-password-value",
      })),
    );

    expect(incorrect.status).toBe(400);
    expect(reused.status).toBe(400);
    expect(await incorrect.json()).toEqual({
      error: "Password change was not successful.",
    });
    expect(await reused.json()).toEqual({
      error: "Password change was not successful.",
    });
  });

  it("changes only the authenticated identity and signs out the rotated session", async () => {
    const response = await changePassword(request(validBody()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, signedOut: true });
    expect(passwordChangeMocks.changeDatabaseUserPassword).toHaveBeenCalledWith({
      userId: actor.userId,
      currentPassword: "current-password-value",
      newPassword: "new-password-value-2026",
    });
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("hmmsa_archive_session=;");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=strict");
  });

  it("returns a sanitized availability error when storage fails", async () => {
    passwordChangeMocks.changeDatabaseUserPassword.mockResolvedValue("unavailable");

    const response = await changePassword(request(validBody()));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Password change is temporarily unavailable.",
    });
  });
});
