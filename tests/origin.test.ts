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

  it("accepts an exact public HTTPS host preserved by a reverse proxy", () => {
    const request = new Request("http://internal-node:3000/api/research", {
      method: "POST",
      headers: {
        Host: "internal-node:3000",
        Origin: "https://voices.example.org",
        "X-Forwarded-Host": "voices.example.org",
      },
    });
    expect(hasTrustedOrigin(request)).toBe(true);
    expect(hasTrustedOrigin(new Request("http://internal-node:3000/api/research", {
      method: "POST",
      headers: {
        Host: "voices.example.org",
        Origin: "https://voices.example.org",
      },
    }))).toBe(true);
  });

  it("does not trust a mismatched, insecure, or malformed forwarded host", () => {
    const request = (origin: string, forwardedHost: string) =>
      new Request("http://internal-node:3000/api/research", {
        method: "POST",
        headers: {
          Origin: origin,
          "X-Forwarded-Host": forwardedHost,
        },
      });

    expect(hasTrustedOrigin(request("https://attacker.example", "voices.example.org"))).toBe(false);
    expect(hasTrustedOrigin(request("http://voices.example.org", "voices.example.org"))).toBe(false);
    expect(hasTrustedOrigin(request("https://voices.example.org", "voices.example.org/path"))).toBe(false);
  });

  it("rejects requests without an Origin header", () => {
    expect(hasTrustedOrigin(new Request("https://archive.example.org/api/research", { method: "POST" }))).toBe(false);
  });
});
