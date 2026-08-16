import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { trustedLoginClientAddress } from "@/lib/auth/login-rate-limit";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("production sign-in request controls", () => {
  it("rejects a declared and streamed oversize body before password work", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://archive.example");
    const declared = await login(new Request("https://archive.example/api/auth/login", {
      method: "POST",
      headers: {
        Origin: "https://archive.example",
        "Content-Type": "application/json",
        "Content-Length": "5000",
      },
      body: "{}",
    }));
    const streamed = await login(new Request("https://archive.example/api/auth/login", {
      method: "POST",
      headers: {
        Origin: "https://archive.example",
        "Content-Type": "application/json",
      },
      body: "x".repeat(4_097),
    }));

    expect(declared.status).toBe(413);
    expect(streamed.status).toBe(413);
  });

  it("prefers X-Real-IP and otherwise takes a validated proxy-appended final address", () => {
    expect(trustedLoginClientAddress(new Request("https://archive.example", {
      headers: {
        "X-Real-IP": "192.0.2.9",
        "CF-Connecting-IP": "203.0.113.7",
        "X-Forwarded-For": "198.51.100.4, 192.0.2.8",
      },
    }))).toBe("192.0.2.9");
    expect(trustedLoginClientAddress(new Request("https://archive.example", {
      headers: { "X-Forwarded-For": "198.51.100.4, 192.0.2.8" },
    }))).toBe("192.0.2.8");
    expect(trustedLoginClientAddress(new Request("https://archive.example", {
      headers: {
        "X-Real-IP": "spoofed-not-an-ip",
        "X-Forwarded-For": "attacker-value",
        "CF-Connecting-IP": "203.0.113.7",
      },
    }))).toBe("203.0.113.7");
  });

  it("invokes durable throttling before password authentication", () => {
    const source = readFileSync("src/app/api/auth/login/route.ts", "utf8");
    expect(source.indexOf("await consumeLoginAttempt(")).toBeLessThan(
      source.indexOf("await authenticateConfiguredUser("),
    );
    expect(source).toContain("LOGIN_BODY_LIMIT");
  });
});
