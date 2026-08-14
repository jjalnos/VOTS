import { afterEach, describe, expect, it, vi } from "vitest";
import { mfaWebhookConfiguration, staffMfaRequired, verifyStaffMfa } from "@/lib/auth/mfa";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("staff MFA hook", () => {
  it("only enforces MFA when the temporary policy flag is explicitly enabled", () => {
    expect(staffMfaRequired()).toBe(false);
    vi.stubEnv("STAFF_MFA_REQUIRED", "true");
    expect(staffMfaRequired()).toBe(true);
  });

  it("fails closed when the provider is not configured", async () => {
    vi.stubEnv("MFA_PROVIDER", "");
    vi.stubEnv("MFA_VERIFY_URL", "");
    expect(mfaWebhookConfiguration()).toBeNull();
    await expect(verifyStaffMfa({ userId: "u1", providerReference: "ref", code: "123456" })).resolves.toBe("unavailable");
  });

  it("requires HTTPS in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MFA_PROVIDER", "webhook");
    vi.stubEnv("MFA_VERIFY_URL", "http://127.0.0.1:9000/verify");
    expect(mfaWebhookConfiguration()).toBeNull();
  });

  it("accepts only an explicit verified response", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("MFA_PROVIDER", "webhook");
    vi.stubEnv("MFA_VERIFY_URL", "http://127.0.0.1:9000/verify");
    vi.stubEnv("MFA_VERIFY_BEARER_TOKEN", "test-only-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ verified: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyStaffMfa({ userId: "u1", providerReference: "museum-user", code: "123456" })).resolves.toBe("verified");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:9000/verify");
  });
});
