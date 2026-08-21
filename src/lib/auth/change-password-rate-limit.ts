import { createHash } from "node:crypto";
import postgres from "postgres";
import { trustedProxyClientAddress } from "@/lib/http/request";

export interface PasswordChangeRateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

interface PasswordChangeRateLimitScope {
  key: string;
  windowSeconds: number;
  maximum: number;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const passwordChangeLimitState = globalThis as typeof globalThis & {
  votsPasswordChangeLimitSql?: ReturnType<typeof postgres>;
};

function sqlClient(): ReturnType<typeof postgres> {
  if (passwordChangeLimitState.votsPasswordChangeLimitSql) {
    return passwordChangeLimitState.votsPasswordChangeLimitSql;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Password-change throttling is unavailable.");
  passwordChangeLimitState.votsPasswordChangeLimitSql = postgres(databaseUrl, {
    max: 1,
    ssl: process.env.DATABASE_SSL === "require" ? "require" : false,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 20,
  });
  return passwordChangeLimitState.votsPasswordChangeLimitSql;
}

function clientAddressScope(request: Request): string {
  return createHash("sha256")
    .update(trustedProxyClientAddress(request))
    .digest("hex");
}

function scopesFor(
  request: Request,
  userId: string,
): PasswordChangeRateLimitScope[] {
  if (!UUID_PATTERN.test(userId)) {
    throw new Error("Password-change throttling received an invalid identity.");
  }
  return [
    {
      key: "password-change:global",
      windowSeconds: 60,
      maximum: 60,
    },
    {
      key: `password-change:ip:${clientAddressScope(request)}`,
      windowSeconds: 15 * 60,
      maximum: 10,
    },
    {
      key: `password-change:user:${userId}`,
      windowSeconds: 15 * 60,
      maximum: 6,
    },
  ];
}

/**
 * Atomically consumes the global, trusted-client, and authenticated-user
 * buckets. Any database or result-validation error rejects the request before
 * password hashing work begins.
 */
export async function consumePasswordChangeAttempt(
  request: Request,
  userId: string,
  now = new Date(),
): Promise<PasswordChangeRateLimitResult> {
  const sql = sqlClient();
  const scopes = scopesFor(request, userId);
  return sql.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(hashtext('vots-auth-password-change-limit-v1'))`;
    let allowed = true;
    let retryAfter = 1;

    for (const scope of scopes) {
      const rows = await transaction<Array<{
        request_count: number;
        window_started_at: Date;
      }>>`
        INSERT INTO auth_password_change_rate_limits (
          scope_key, window_started_at, request_count, updated_at
        ) VALUES (${scope.key}, ${now}, 1, ${now})
        ON CONFLICT (scope_key) DO UPDATE SET
          window_started_at = CASE
            WHEN auth_password_change_rate_limits.window_started_at <= ${now}::timestamptz - (${scope.windowSeconds} * interval '1 second')
            THEN ${now}
            ELSE auth_password_change_rate_limits.window_started_at
          END,
          request_count = CASE
            WHEN auth_password_change_rate_limits.window_started_at <= ${now}::timestamptz - (${scope.windowSeconds} * interval '1 second')
            THEN 1
            ELSE auth_password_change_rate_limits.request_count + 1
          END,
          updated_at = ${now}
        RETURNING request_count, window_started_at
      `;
      const count = Number(rows[0]?.request_count);
      const startedAt = new Date(rows[0]?.window_started_at ?? "").getTime();
      if (!Number.isSafeInteger(count) || count < 1 || !Number.isFinite(startedAt)) {
        throw new Error("Password-change throttling returned an invalid result.");
      }
      if (count > scope.maximum) {
        allowed = false;
        retryAfter = Math.max(
          retryAfter,
          Math.max(
            1,
            Math.ceil(
              (startedAt + scope.windowSeconds * 1_000 - now.getTime()) /
                1_000,
            ),
          ),
        );
      }
    }

    await transaction`
      DELETE FROM auth_password_change_rate_limits
      WHERE updated_at < ${new Date(now.getTime() - 2 * 24 * 60 * 60 * 1_000)}
    `;
    return { allowed, retryAfter };
  });
}
