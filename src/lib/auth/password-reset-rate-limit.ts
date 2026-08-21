import { createHash } from "node:crypto";
import postgres from "postgres";
import { trustedProxyClientAddress } from "@/lib/http/request";

export interface PasswordResetRateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

interface LimitScope {
  key: string;
  maximum: number;
  windowSeconds: number;
}

const rateLimitState = globalThis as typeof globalThis & {
  votsPasswordResetLimitSql?: ReturnType<typeof postgres>;
};

function sqlClient(): ReturnType<typeof postgres> {
  if (rateLimitState.votsPasswordResetLimitSql) {
    return rateLimitState.votsPasswordResetLimitSql;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Password reset is unavailable.");
  rateLimitState.votsPasswordResetLimitSql = postgres(databaseUrl, {
    max: 2,
    ssl: process.env.DATABASE_SSL === "require" ? "require" : false,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 20,
  });
  return rateLimitState.votsPasswordResetLimitSql;
}

function scopeDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizedPasswordResetEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en");
}

export function passwordResetEmailScope(email: string): string {
  return scopeDigest(normalizedPasswordResetEmail(email));
}

function clientScope(request: Request): string {
  return scopeDigest(trustedProxyClientAddress(request));
}

async function consumeScopes(
  scopes: LimitScope[],
  now: Date,
): Promise<PasswordResetRateLimitResult> {
  const sql = sqlClient();
  return sql.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(hashtext('vots-password-reset-limit-v1'))`;
    let allowed = true;
    let retryAfter = 1;

    for (const scope of scopes) {
      const rows = await transaction<Array<{
        request_count: number;
        window_started_at: Date;
      }>>`
        INSERT INTO password_reset_rate_limits (
          scope_key, window_started_at, request_count, updated_at
        ) VALUES (${scope.key}, ${now}, 1, ${now})
        ON CONFLICT (scope_key) DO UPDATE SET
          window_started_at = CASE
            WHEN password_reset_rate_limits.window_started_at <= ${now}::timestamptz - (${scope.windowSeconds} * interval '1 second')
            THEN ${now}
            ELSE password_reset_rate_limits.window_started_at
          END,
          request_count = CASE
            WHEN password_reset_rate_limits.window_started_at <= ${now}::timestamptz - (${scope.windowSeconds} * interval '1 second')
            THEN 1
            ELSE password_reset_rate_limits.request_count + 1
          END,
          updated_at = ${now}
        RETURNING request_count, window_started_at
      `;
      const count = Number(rows[0]?.request_count ?? 0);
      if (count <= scope.maximum) continue;
      allowed = false;
      const startedAt = new Date(rows[0]?.window_started_at ?? now).getTime();
      retryAfter = Math.max(
        retryAfter,
        Math.max(
          1,
          Math.ceil((startedAt + scope.windowSeconds * 1_000 - now.getTime()) / 1_000),
        ),
      );
    }

    await transaction`
      DELETE FROM password_reset_rate_limits
      WHERE updated_at < ${new Date(now.getTime() - 2 * 24 * 60 * 60 * 1_000)}
    `;
    return { allowed, retryAfter };
  });
}

/**
 * Consumes every request scope in one durable transaction. The email and
 * proxy-derived client address are irreversibly hashed before persistence.
 */
export function consumePasswordResetRequestAttempt(
  request: Request,
  email: string,
  now = new Date(),
): Promise<PasswordResetRateLimitResult> {
  return consumeScopes([
    { key: "password-reset:request:global", windowSeconds: 60, maximum: 300 },
    {
      key: `password-reset:request:ip:${clientScope(request)}`,
      windowSeconds: 15 * 60,
      maximum: 20,
    },
    {
      key: `password-reset:request:email:${passwordResetEmailScope(email)}`,
      windowSeconds: 60 * 60,
      maximum: 5,
    },
  ], now);
}

/** The token scope is already a keyed SHA-256 digest; the raw token is absent. */
export function consumePasswordResetConfirmationAttempt(
  request: Request,
  tokenDigest: string,
  now = new Date(),
): Promise<PasswordResetRateLimitResult> {
  if (!/^[a-f\d]{64}$/.test(tokenDigest)) {
    throw new Error("A password-reset token digest is required.");
  }
  return consumeScopes([
    {
      key: "password-reset:confirm:global",
      windowSeconds: 60,
      maximum: 120,
    },
    {
      key: `password-reset:confirm:ip:${clientScope(request)}`,
      windowSeconds: 15 * 60,
      maximum: 30,
    },
    {
      key: `password-reset:confirm:token:${tokenDigest}`,
      windowSeconds: 30 * 60,
      maximum: 8,
    },
  ], now);
}
