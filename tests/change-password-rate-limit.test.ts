import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rateLimitMocks = vi.hoisted(() => {
  const transaction = vi.fn();
  const sql = Object.assign(vi.fn(), {
    begin: vi.fn(),
  });
  return {
    postgres: vi.fn(() => sql),
    sql,
    transaction,
    insertRows: [] as Array<{
      request_count: number;
      window_started_at: Date;
    }>,
    insertedScopeKeys: [] as string[],
  };
});

vi.mock("postgres", () => ({
  default: rateLimitMocks.postgres,
}));

import { consumePasswordChangeAttempt } from "@/lib/auth/change-password-rate-limit";

const userId = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-21T18:00:00.000Z");

function request(): Request {
  return new Request("https://archive.example/api/auth/change-password", {
    headers: {
      "X-Real-IP": "192.0.2.19",
      "X-Forwarded-For": "198.51.100.7, 192.0.2.20",
    },
  });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://database.example/archive");
  rateLimitMocks.insertRows.length = 0;
  rateLimitMocks.insertedScopeKeys.length = 0;
  rateLimitMocks.transaction.mockReset().mockImplementation(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const statement = strings.join(" ");
      if (statement.includes("INSERT INTO auth_password_change_rate_limits")) {
        rateLimitMocks.insertedScopeKeys.push(String(values[0]));
        const row = rateLimitMocks.insertRows.shift();
        return row ? [row] : [];
      }
      return [];
    },
  );
  rateLimitMocks.sql.begin.mockReset().mockImplementation(
    async (callback: (transaction: typeof rateLimitMocks.transaction) => unknown) =>
      callback(rateLimitMocks.transaction),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("persistent password-change throttling", () => {
  it("atomically consumes isolated global, trusted-IP, and exact-user scopes", async () => {
    rateLimitMocks.insertRows.push(
      { request_count: 1, window_started_at: now },
      { request_count: 1, window_started_at: now },
      { request_count: 1, window_started_at: now },
    );

    const result = await consumePasswordChangeAttempt(request(), userId, now);

    expect(result).toEqual({ allowed: true, retryAfter: 1 });
    expect(rateLimitMocks.insertedScopeKeys).toEqual([
      "password-change:global",
      expect.stringMatching(/^password-change:ip:[0-9a-f]{64}$/),
      `password-change:user:${userId}`,
    ]);
    expect(rateLimitMocks.insertedScopeKeys.every((key) => !key.startsWith("login:")))
      .toBe(true);
    const statements = rateLimitMocks.transaction.mock.calls
      .map(([strings]) => (strings as TemplateStringsArray).join(" "))
      .join("\n");
    expect(statements).toContain(
      "pg_advisory_xact_lock(hashtext('vots-auth-password-change-limit-v1'))",
    );
    expect(statements).toContain("DELETE FROM auth_password_change_rate_limits");
  });

  it("denies an exhausted exact-user scope with the remaining window", async () => {
    rateLimitMocks.insertRows.push(
      { request_count: 2, window_started_at: now },
      { request_count: 3, window_started_at: now },
      { request_count: 7, window_started_at: now },
    );

    await expect(
      consumePasswordChangeAttempt(request(), userId, now),
    ).resolves.toEqual({ allowed: false, retryAfter: 900 });
  });

  it("fails closed when durable storage fails or returns an invalid result", async () => {
    rateLimitMocks.sql.begin.mockRejectedValueOnce(
      new Error("persistent limiter unavailable"),
    );
    await expect(
      consumePasswordChangeAttempt(request(), userId, now),
    ).rejects.toThrow("persistent limiter unavailable");

    rateLimitMocks.insertRows.push(
      { request_count: 0, window_started_at: now },
    );
    await expect(
      consumePasswordChangeAttempt(request(), userId, now),
    ).rejects.toThrow(/invalid result/i);
  });

  it("ships its own persistent table rather than sharing login buckets", () => {
    const migration = readFileSync(
      "drizzle/0008_auth_password_change_rate_limits.sql",
      "utf8",
    );
    expect(migration).toContain('CREATE TABLE "auth_password_change_rate_limits"');
    expect(migration).not.toContain("auth_login_rate_limits");
  });
});
