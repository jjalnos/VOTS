import { afterEach, describe, expect, it, vi } from "vitest";
import { hasTrustedOrigin, trustedRequestOrigins } from "@/lib/http/origin";

afterEach(() => vi.unstubAllEnvs());

describe("same-origin write protection", () => {
  it("accepts the request origin and rejects a different site", () => {
    expect(hasTrustedOrigin(new Request("https://archive.example.org/api/uploads", {
      method: "POST",
      headers: { Origin: "https://archive.example.org" },
    }))).toBe(true);
    expect(hasTrustedOrigin(new Request("https://archive.example.org/api/uploads", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
    }))).toBe(false);
  });

  it("trusts the configured public origin behind a reverse proxy", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://voices.example.org");
    const request = new Request("http://internal-node:3000/api/auth/login", {
      method: "POST",
      headers: { Origin: "https://voices.example.org" },
    });
    expect(trustedRequestOrigins(request)).toContain("https://voices.example.org");
    expect(hasTrustedOrigin(request)).toBe(true);
  });

  it("rejects requests without an Origin header", () => {
    expect(hasTrustedOrigin(new Request("https://archive.example.org/api/research", { method: "POST" }))).toBe(false);
  });
});
