import { describe, expect, it } from "vitest";
import { signSession, verifySession, type SessionPayload } from "@/lib/auth/session-token";

const payload: SessionPayload = { userId: "u1", email: "user@test", displayName: "User", roles: ["curator"], mfaVerified: true, issuedAt: 1_000, expiresAt: 10_000 };

describe("session signing", () => {
  it("accepts a valid signed session", () => {
    const token = signSession(payload, "test-secret");
    expect(verifySession(token, "test-secret", 2_000)?.userId).toBe("u1");
  });

  it("rejects tampered and expired sessions", () => {
    const token = signSession(payload, "test-secret");
    expect(verifySession(`${token}x`, "test-secret", 2_000)).toBeNull();
    expect(verifySession(token, "test-secret", 11_000)).toBeNull();
  });
});
