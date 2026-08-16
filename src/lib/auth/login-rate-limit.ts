import { createHash } from "node:crypto";
import postgres from "postgres";
import { trustedProxyClientAddress } from "@/lib/http/request";

interface LoginRateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

const loginLimitState = globalThis as typeof globalThis & {
  votsLoginLimitSql?: ReturnType<typeof postgres>;
};

function sqlClient(): ReturnType<typeof postgres> {
  if (loginLimitState.votsLoginLimitSql) return loginLimitState.votsLoginLimitSql;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Database authentication is unavailable.");
  loginLimitState.votsLoginLimitSql = postgres(databaseUrl, {
    max: 2,
    ssl: process.env.DATABASE_SSL === "require" ? "require" : false,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 20,
  });
  return loginLimitState.votsLoginLimitSql;
}

export function trustedLoginClientAddress(request: Request): string {
  return trustedProxyClientAddress(request);
}

function emailScope(email: string): string {
  return createHash("sha256")
    .update(email.trim().toLocaleLowerCase("en"))
    .digest("hex");
}

export async function consumeLoginAttempt(
  request: Request,
  email: string,
  now = new Date(),
): Promise<LoginRateLimitResult> {
  const sql = sqlClient();
  const scopes = [
    { key: "login:global", windowSeconds: 60, maximum: 120 },
    {
      key: `login:ip:${trustedLoginClientAddress(request)}`,
      windowSeconds: 10 * 60,
      maximum: 12,
    },
    {
      key: `login:email:${emailScope(email)}`,
      windowSeconds: 10 * 60,
      maximum: 8,
    },
  ];
  return sql.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(hashtext('vots-auth-login-limit-v1'))`;
    let allowed = true;
    let retryAfter = 1;
    for (const scope of scopes) {
      const rows = await transaction<Array<{
        request_count: number;
        window_started_at: Date;
      }>>`
        INSERT INTO auth_login_rate_limits (
          scope_key, window_started_at, request_count, updated_at
        ) VALUES (${scope.key}, ${now}, 1, ${now})
        ON CONFLICT (scope_key) DO UPDATE SET
          window_started_at = CASE
            WHEN auth_login_rate_limits.window_started_at <= ${now}::timestamptz - (${scope.windowSeconds} * interval '1 second')
            THEN ${now}
            ELSE auth_login_rate_limits.window_started_at
          END,
          request_count = CASE
            WHEN auth_login_rate_limits.window_started_at <= ${now}::timestamptz - (${scope.windowSeconds} * interval '1 second')
            THEN 1
            ELSE auth_login_rate_limits.request_count + 1
          END,
          updated_at = ${now}
        RETURNING request_count, window_started_at
      `;
      const count = Number(rows[0]?.request_count ?? 0);
      const startedAt = new Date(rows[0]?.window_started_at ?? now).getTime();
      if (count > scope.maximum) allowed = false;
      retryAfter = Math.max(
        retryAfter,
        Math.max(
          1,
          Math.ceil((startedAt + scope.windowSeconds * 1_000 - now.getTime()) / 1_000),
        ),
      );
    }
    await transaction`
      DELETE FROM auth_login_rate_limits
      WHERE updated_at < ${new Date(now.getTime() - 2 * 24 * 60 * 60 * 1_000)}
    `;
    return { allowed, retryAfter };
  });
}
