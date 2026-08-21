import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handlePasswordResetConfirmation,
} from "@/app/api/auth/password-reset/confirm/route";
import {
  handlePasswordResetRequest,
} from "@/app/api/auth/password-reset/request/route";
import {
  canonicalPasswordResetLink,
  canonicalPasswordResetSiteOrigin,
  generatePasswordResetToken,
  passwordResetConfirmationConfiguration,
  passwordResetEmail,
  passwordResetTokenDigest,
  passwordResetTokenKey,
  type PasswordResetRequestConfiguration,
} from "@/lib/auth/password-reset";
import { passwordResetEmailScope } from "@/lib/auth/password-reset-rate-limit";

const TOKEN_KEY = "q9Vg3Yp8Kx2Lm7Nd4Rf6Ts1Wc5Zh0BjUaEiOoP";
const RAW_TOKEN = "A".repeat(43);
const PASSWORD = "a secure archive password";
const SITE_ORIGIN = "https://archive.example";

const configuration: PasswordResetRequestConfiguration = {
  siteOrigin: SITE_ORIGIN,
  tokenKey: TOKEN_KEY,
  smtp: {
    host: "smtp.elasticemail.com",
    port: 2525,
    secure: false,
    requireTLS: true,
    user: "vots-smtp-4f9a2c1d@voicesoftheshoah.org",
    password: "not-used-by-these-tests",
    from: "no-reply@voicesoftheshoah.org",
  },
};

function jsonRequest(path: string, body: unknown, origin = SITE_ORIGIN): Request {
  return new Request(`${SITE_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Real-IP": "192.0.2.14",
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("password-reset token and canonical-link secrecy", () => {
  it("generates 256 random bits and persists only a keyed SHA-256 digest", () => {
    const random = vi.fn(() => Buffer.alloc(32, 7));
    const generated = generatePasswordResetToken(TOKEN_KEY, random);

    expect(random).toHaveBeenCalledWith(32);
    expect(generated.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generated.tokenHash).toMatch(/^[a-f\d]{64}$/);
    expect(generated.tokenHash).not.toContain(generated.token);
    expect(passwordResetTokenDigest(generated.token, TOKEN_KEY)).toBe(
      generated.tokenHash,
    );
    expect(passwordResetTokenDigest(generated.token, `${TOKEN_KEY}x`)).not.toBe(
      generated.tokenHash,
    );
  });

  it("uses only the configured canonical origin and keeps the token in the fragment", () => {
    const link = canonicalPasswordResetLink({
      siteOrigin: SITE_ORIGIN,
      locale: "es",
      token: RAW_TOKEN,
    });
    const parsed = new URL(link);

    expect(link).toBe(
      `${SITE_ORIGIN}/reset-password?lang=es#token=${RAW_TOKEN}`,
    );
    expect(parsed.searchParams.get("lang")).toBe("es");
    expect(parsed.searchParams.has("token")).toBe(false);
    expect(parsed.hash).toBe(`#token=${RAW_TOKEN}`);
    expect(() => canonicalPasswordResetLink({
      siteOrigin: "https://attacker.example/path",
      locale: "en",
      token: RAW_TOKEN,
    })).toThrow();
  });

  it("never places reset material in the subject and hashes normalized email scopes", () => {
    const message = passwordResetEmail({
      locale: "en",
      resetLink: `${SITE_ORIGIN}/reset-password?lang=en#token=${RAW_TOKEN}`,
    });
    expect(message.subject).not.toContain(RAW_TOKEN);
    expect(message.text).toContain(`#token=${RAW_TOKEN}`);
    expect(passwordResetEmailScope(" Family@Example.org ")).toBe(
      passwordResetEmailScope("family@example.org"),
    );
    expect(passwordResetEmailScope("family@example.org")).not.toContain(
      "family@example.org",
    );
  });
});

describe("password-reset configuration boundary", () => {
  const environment = {
    AUTH_PROVIDER: "database",
    DATABASE_URL: "postgresql://archive:test@database.example/archive",
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: `${SITE_ORIGIN}/`,
    PASSWORD_RESET_TOKEN_KEY: TOKEN_KEY,
  };

  it("accepts one canonical HTTPS origin for the database provider", () => {
    expect(passwordResetConfirmationConfiguration(environment)).toEqual({
      siteOrigin: SITE_ORIGIN,
      tokenKey: TOKEN_KEY,
    });
    expect(canonicalPasswordResetSiteOrigin(environment)).toBe(SITE_ORIGIN);
  });

  it("rejects development auth, unsafe URLs, placeholder keys, and session-key reuse", () => {
    expect(() => passwordResetConfirmationConfiguration({
      ...environment,
      AUTH_PROVIDER: "development",
    })).toThrow();
    expect(() => canonicalPasswordResetSiteOrigin({
      ...environment,
      NEXT_PUBLIC_SITE_URL: "http://archive.example",
    })).toThrow();
    expect(() => canonicalPasswordResetSiteOrigin({
      ...environment,
      NEXT_PUBLIC_SITE_URL: `${SITE_ORIGIN}/login`,
    })).toThrow();
    expect(() => passwordResetTokenKey({
      ...environment,
      PASSWORD_RESET_TOKEN_KEY: "x".repeat(64),
    })).toThrow();
    expect(() => passwordResetTokenKey({
      ...environment,
      PASSWORD_RESET_TOKEN_KEY: "replace-me-with-a-real-password-reset-secret",
    })).toThrow();
    expect(() => passwordResetTokenKey({
      ...environment,
      AUTH_SESSION_SECRET: TOKEN_KEY,
    })).toThrow();
  });
});

describe("password-reset request API privacy", () => {
  async function invoke(input: {
    email: string;
    issuance: "issued" | "ineligible" | "delivery-failed";
    allowed?: boolean;
  }) {
    const callbacks: Array<() => Promise<void>> = [];
    const issue = vi.fn().mockResolvedValue(input.issuance);
    const response = await handlePasswordResetRequest(
      jsonRequest("/api/auth/password-reset/request", {
        email: input.email,
        locale: "en",
      }),
      {
        configuration: () => configuration,
        consumeAttempt: vi.fn().mockResolvedValue({
          allowed: input.allowed ?? true,
          retryAfter: 60,
        }),
        schedule: (callback) => callbacks.push(callback),
        issue,
      },
    );
    const publicResult = {
      status: response.status,
      body: await response.json(),
      cacheControl: response.headers.get("cache-control"),
    };
    await Promise.all(callbacks.map((callback) => callback()));
    return { publicResult, issue };
  }

  it("returns the exact same 202 before eligible and nonexistent lookups run", async () => {
    const eligible = await invoke({
      email: "known@example.org",
      issuance: "issued",
    });
    const nonexistent = await invoke({
      email: "missing@example.org",
      issuance: "ineligible",
    });
    const deliveryFailure = await invoke({
      email: "known@example.org",
      issuance: "delivery-failed",
    });
    const throttled = await invoke({
      email: "known@example.org",
      issuance: "issued",
      allowed: false,
    });

    expect(eligible.publicResult).toEqual({
      status: 202,
      body: { ok: true },
      cacheControl: "no-store",
    });
    expect(nonexistent.publicResult).toEqual(eligible.publicResult);
    expect(deliveryFailure.publicResult).toEqual(eligible.publicResult);
    expect(throttled.publicResult).toEqual(eligible.publicResult);
    expect(eligible.issue).toHaveBeenCalledOnce();
    expect(nonexistent.issue).toHaveBeenCalledOnce();
    expect(throttled.issue).not.toHaveBeenCalled();
  });

  it("requires exact Origin, JSON content type, and the 4 KiB body bound", async () => {
    const dependencies = {
      configuration: () => configuration,
      consumeAttempt: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 1 }),
      schedule: vi.fn(),
      issue: vi.fn(),
    };
    const crossSite = await handlePasswordResetRequest(
      jsonRequest(
        "/api/auth/password-reset/request",
        { email: "family@example.org", locale: "en" },
        `${SITE_ORIGIN}/`,
      ),
      dependencies,
    );
    const wrongType = await handlePasswordResetRequest(
      new Request(`${SITE_ORIGIN}/api/auth/password-reset/request`, {
        method: "POST",
        headers: { Origin: SITE_ORIGIN, "Content-Type": "text/plain" },
        body: "{}",
      }),
      dependencies,
    );
    const oversized = await handlePasswordResetRequest(
      new Request(`${SITE_ORIGIN}/api/auth/password-reset/request`, {
        method: "POST",
        headers: {
          Origin: SITE_ORIGIN,
          "Content-Type": "application/json",
          "Content-Length": "4097",
        },
        body: "{}",
      }),
      dependencies,
    );

    expect(crossSite.status).toBe(403);
    expect(wrongType.status).toBe(415);
    expect(oversized.status).toBe(413);
    expect(dependencies.consumeAttempt).not.toHaveBeenCalled();
  });
});

describe("password-reset confirmation API", () => {
  const confirmationBody = {
    token: RAW_TOKEN,
    password: PASSWORD,
    passwordConfirmation: PASSWORD,
  };

  async function confirmWith(
    result: "reset" | "invalid" | "unavailable",
    allowed = true,
  ) {
    const confirm = vi.fn().mockResolvedValue(result);
    const response = await handlePasswordResetConfirmation(
      jsonRequest("/api/auth/password-reset/confirm", confirmationBody),
      {
        configuration: () => configuration,
        consumeAttempt: vi.fn().mockResolvedValue({ allowed, retryAfter: 30 }),
        confirm,
      },
    );
    return { response, body: await response.clone().json(), confirm };
  }

  it("uses one generic response for invalid, expired, used, and throttled tokens", async () => {
    const invalid = await confirmWith("invalid");
    const expired = await confirmWith("invalid");
    const used = await confirmWith("invalid");
    const throttled = await confirmWith("reset", false);

    for (const result of [invalid, expired, used, throttled]) {
      expect({ status: result.response.status, body: result.body }).toEqual({
        status: 400,
        body: {
          ok: false,
          error: "This password-reset link is invalid or no longer available.",
        },
      });
    }
    expect(throttled.confirm).not.toHaveBeenCalled();
  });

  it("accepts 16–200 matching characters, does not auto-login, and clears the session", async () => {
    const success = await confirmWith("reset");
    expect(success.response.status).toBe(200);
    expect(success.body).toEqual({ ok: true });
    expect(success.response.headers.get("set-cookie")).toMatch(
      /hmmsa_archive_session=;.*Max-Age=0.*HttpOnly.*SameSite=strict/i,
    );
    expect(JSON.stringify(success.body)).not.toContain(RAW_TOKEN);

    for (const body of [
      { ...confirmationBody, password: "x".repeat(15), passwordConfirmation: "x".repeat(15) },
      { ...confirmationBody, passwordConfirmation: `${PASSWORD}!` },
      { ...confirmationBody, password: "x".repeat(201), passwordConfirmation: "x".repeat(201) },
    ]) {
      const confirm = vi.fn();
      const response = await handlePasswordResetConfirmation(
        jsonRequest("/api/auth/password-reset/confirm", body),
        {
          configuration: () => configuration,
          consumeAttempt: vi.fn(),
          confirm,
        },
      );
      expect(response.status).toBe(400);
      expect(confirm).not.toHaveBeenCalled();
    }
  });
});

describe("password-reset atomicity and durable-source guards", () => {
  it("claims once, rejects changed sessions, rotates the password, and revokes siblings atomically", () => {
    const source = readFileSync("src/lib/auth/password-reset.ts", "utf8");
    const requestRoute = readFileSync(
      "src/app/api/auth/password-reset/request/route.ts",
      "utf8",
    );
    const confirmRoute = readFileSync(
      "src/app/api/auth/password-reset/confirm/route.ts",
      "utf8",
    );
    const rateLimits = readFileSync(
      "src/lib/auth/password-reset-rate-limit.ts",
      "utf8",
    );
    const migration = readFileSync(
      "drizzle/0009_password_reset.sql",
      "utf8",
    );

    expect(source).toContain("sessionVersionAtIssue !== lockedIdentity.sessionVersion");
    expect(source).toContain(".set({ usedAt: now })");
    expect(source).toContain("isNull(passwordResetTokens.usedAt)");
    expect(source).toContain("sessionVersion: sql`${users.sessionVersion} + 1`");
    expect(source).toContain("ne(passwordResetTokens.id, candidate.tokenId)");
    expect(source).toContain('action: "auth.password_reset_completed"');
    expect(source).toContain('.for("update")');
    expect(source.lastIndexOf("await verifyStaffMfa(")).toBeLessThan(
      source.indexOf("return await db.transaction", source.indexOf("confirmPasswordReset")),
    );
    expect(source.indexOf("await hashPasswordAsync(input.password)")).toBeGreaterThan(
      source.indexOf("if (!preflight"),
    );
    expect(source.indexOf("await hashPasswordAsync(input.password)")).toBeLessThan(
      source.indexOf("return await db.transaction", source.indexOf("confirmPasswordReset")),
    );
    const transactionBody = source.slice(
      source.indexOf("return await db.transaction", source.indexOf("confirmPasswordReset")),
    );
    expect(transactionBody.indexOf(".from(users)")).toBeLessThan(
      transactionBody.indexOf(".from(passwordResetTokens)"),
    );

    const tokenInsert = source.slice(
      source.indexOf(".insert(passwordResetTokens)"),
      source.indexOf(".returning({ id: passwordResetTokens.id })"),
    );
    expect(tokenInsert).toContain("tokenHash: generated.tokenHash");
    expect(tokenInsert).not.toContain("generated.token,");
    expect(migration).not.toMatch(/raw_token|\"token\"\s/);
    expect(migration).toContain("password_reset_rate_limits_count_positive");

    expect(requestRoute.indexOf("dependencies.consumeAttempt(")).toBeLessThan(
      requestRoute.indexOf("dependencies.issue({"),
    );
    expect(requestRoute).toContain("after(callback)");
    expect(confirmRoute.indexOf("dependencies.consumeAttempt(")).toBeLessThan(
      confirmRoute.indexOf("dependencies.confirm({"),
    );
    expect(confirmRoute).toContain("maxAge: 0");
    expect(rateLimits).toContain('key: "password-reset:confirm:global"');
  });
});
