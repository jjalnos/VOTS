import { randomUUID } from "node:crypto";
import postgres, { type TransactionSql } from "postgres";
import type {
  ExternalUsageLedger,
  ExternalUsageLimits,
  ExternalUsageRecordStatus,
  UsageReservation,
  UsageReservationResult,
  UsageSnapshot,
  UsageWindowSnapshot,
} from "@/lib/ai/usage-ledger";

type SqlClient = ReturnType<typeof postgres>;

const postgresUsageGlobal = globalThis as typeof globalThis & {
  hmmsaExternalAIUsageSql?: SqlClient;
  hmmsaExternalAIUsageDatabaseUrl?: string;
};

function usagePoolSize(): number {
  const configured = Number(process.env.EXTERNAL_AI_DATABASE_POOL_MAX ?? "2");
  return Number.isSafeInteger(configured) && configured >= 1 && configured <= 4
    ? configured
    : 2;
}

function getUsageSql(databaseUrl: string): SqlClient {
  if (
    postgresUsageGlobal.hmmsaExternalAIUsageSql &&
    postgresUsageGlobal.hmmsaExternalAIUsageDatabaseUrl === databaseUrl
  ) {
    return postgresUsageGlobal.hmmsaExternalAIUsageSql;
  }
  const sql = postgres(databaseUrl, {
    max: usagePoolSize(),
    ssl: process.env.DATABASE_SSL === "require" ? "require" : false,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 20,
  });
  postgresUsageGlobal.hmmsaExternalAIUsageSql = sql;
  postgresUsageGlobal.hmmsaExternalAIUsageDatabaseUrl = databaseUrl;
  return sql;
}

function utcDayBounds(now: Date): [Date, Date] {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return [start, new Date(start.getTime() + 86_400_000)];
}

function utcMonthBounds(now: Date): [Date, Date] {
  return [
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  ];
}

function safeCount(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

export class PostgresExternalUsageLedger implements ExternalUsageLedger {
  readonly mode = "postgres" as const;
  readonly durable = true as const;
  private schemaPromise: Promise<void> | null = null;
  private readonly sql: SqlClient;

  constructor(databaseUrl: string) {
    if (!databaseUrl) throw new Error("A database connection is required for AI usage accounting.");
    this.sql = getUsageSql(databaseUrl);
  }

  private async ensureSchema(): Promise<void> {
    if (!this.schemaPromise) {
      this.schemaPromise = this.sql.begin(async (sql) => {
        await sql`SELECT pg_advisory_xact_lock(hashtext('hmmsa_external_ai_usage_schema_v1'))`;
        await sql`
          CREATE TABLE IF NOT EXISTS external_ai_usage_reservations (
            id text PRIMARY KEY,
            actor_id text NOT NULL,
            provider text NOT NULL CHECK (provider = 'openai'),
            model text NOT NULL,
            reserved_tokens integer NOT NULL CHECK (reserved_tokens >= 0),
            created_at timestamptz NOT NULL,
            expires_at timestamptz NOT NULL
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS external_ai_usage_records (
            id text PRIMARY KEY,
            actor_id text NOT NULL,
            provider text NOT NULL CHECK (provider = 'openai'),
            model text NOT NULL,
            input_tokens integer NOT NULL CHECK (input_tokens >= 0),
            output_tokens integer NOT NULL CHECK (output_tokens >= 0),
            charged_tokens integer NOT NULL CHECK (charged_tokens >= 0),
            status text NOT NULL CHECK (status IN ('completed', 'provider-error', 'blocked')),
            created_at timestamptz NOT NULL,
            settled_at timestamptz NOT NULL
          )
        `;
        await sql`
          CREATE INDEX IF NOT EXISTS external_ai_usage_records_created_at_idx
          ON external_ai_usage_records (created_at)
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS external_ai_usage_alert_claims (
            alert_key text PRIMARY KEY,
            status text NOT NULL CHECK (status IN ('pending', 'sent')),
            claimed_at timestamptz NOT NULL
          )
        `;
        await sql`
          ALTER TABLE external_ai_usage_alert_claims
          ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent'
        `;
      }).then(() => undefined).catch((error: unknown) => {
        this.schemaPromise = null;
        throw error;
      });
    }
    await this.schemaPromise;
  }

  private async cleanupExpired(sql: TransactionSql, now: Date): Promise<void> {
    // Once a reservation's outcome is unknown, forgetting it could undercount a
    // provider call that was billed but failed during settlement. Move it into
    // the durable ledger at the full reserved ceiling in the same statement.
    // Every caller holds the usage advisory lock around this transaction.
    await sql`
      WITH expired AS (
        DELETE FROM external_ai_usage_reservations
        WHERE expires_at <= ${now}
        RETURNING id, actor_id, provider, model, reserved_tokens, created_at
      )
      INSERT INTO external_ai_usage_records (
        id, actor_id, provider, model, input_tokens, output_tokens, charged_tokens,
        status, created_at, settled_at
      )
      SELECT
        id, actor_id, provider, model, 0, 0, reserved_tokens,
        'provider-error', created_at, ${now}
      FROM expired
      WHERE true
      ON CONFLICT (id) DO NOTHING
    `;
  }

  private async windowSnapshot(
    sql: TransactionSql,
    start: Date,
    end: Date,
    period: string,
    requestLimit: number,
    tokenLimit: number,
  ): Promise<UsageWindowSnapshot> {
    const [row] = await sql<Array<{ requests: string | number; tokens: string | number }>>`
      SELECT
        (
          (SELECT count(*) FROM external_ai_usage_records
            WHERE created_at >= ${start} AND created_at < ${end})
          +
          (SELECT count(*) FROM external_ai_usage_reservations
            WHERE created_at >= ${start} AND created_at < ${end})
        )::bigint AS requests,
        (
          COALESCE((SELECT sum(charged_tokens) FROM external_ai_usage_records
            WHERE created_at >= ${start} AND created_at < ${end}), 0)
          +
          COALESCE((SELECT sum(reserved_tokens) FROM external_ai_usage_reservations
            WHERE created_at >= ${start} AND created_at < ${end}), 0)
        )::bigint AS tokens
    `;
    return {
      period,
      requests: safeCount(row?.requests),
      requestLimit,
      tokens: safeCount(row?.tokens),
      tokenLimit,
    };
  }

  private async snapshotInTransaction(
    sql: TransactionSql,
    now: Date,
    limits: ExternalUsageLimits,
  ): Promise<UsageSnapshot> {
    const [dayStart, dayEnd] = utcDayBounds(now);
    const [monthStart, monthEnd] = utcMonthBounds(now);
    const [daily, monthly] = await Promise.all([
      this.windowSnapshot(
        sql,
        dayStart,
        dayEnd,
        now.toISOString().slice(0, 10),
        limits.dailyRequestLimit,
        limits.dailyTokenLimit,
      ),
      this.windowSnapshot(
        sql,
        monthStart,
        monthEnd,
        now.toISOString().slice(0, 7),
        limits.monthlyRequestLimit,
        limits.monthlyTokenLimit,
      ),
    ]);
    return { daily, monthly };
  }

  async reserve(input: {
    actorId: string;
    provider: "openai";
    model: string;
    reservedTokens: number;
    now: Date;
    limits: ExternalUsageLimits;
  }): Promise<UsageReservationResult> {
    await this.ensureSchema();
    return this.sql.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext('hmmsa_external_ai_usage_v1'))`;
      await this.cleanupExpired(sql, input.now);
      const before = await this.snapshotInTransaction(sql, input.now, input.limits);
      if (before.daily.requests >= input.limits.dailyRequestLimit) {
        return { allowed: false, reason: "daily-request-limit", snapshot: before } as const;
      }
      if (before.monthly.requests >= input.limits.monthlyRequestLimit) {
        return { allowed: false, reason: "monthly-request-limit", snapshot: before } as const;
      }
      if (before.daily.tokens + input.reservedTokens > input.limits.dailyTokenLimit) {
        return { allowed: false, reason: "daily-token-limit", snapshot: before } as const;
      }
      if (before.monthly.tokens + input.reservedTokens > input.limits.monthlyTokenLimit) {
        return { allowed: false, reason: "monthly-token-limit", snapshot: before } as const;
      }

      const reservation: UsageReservation = {
        id: randomUUID(),
        actorId: input.actorId,
        provider: input.provider,
        model: input.model,
        createdAt: input.now,
        reservedTokens: input.reservedTokens,
      };
      const expiresAt = new Date(input.now.getTime() + 15 * 60_000);
      await sql`
        INSERT INTO external_ai_usage_reservations
          (id, actor_id, provider, model, reserved_tokens, created_at, expires_at)
        VALUES
          (${reservation.id}, ${reservation.actorId}, ${reservation.provider}, ${reservation.model},
           ${reservation.reservedTokens}, ${reservation.createdAt}, ${expiresAt})
      `;
      const snapshot = await this.snapshotInTransaction(sql, input.now, input.limits);
      return { allowed: true, reservation, snapshot } as const;
    });
  }

  async settle(input: {
    reservation: UsageReservation;
    chargedTokens: number;
    inputTokens: number;
    outputTokens: number;
    status: ExternalUsageRecordStatus;
    now: Date;
    limits: ExternalUsageLimits;
  }): Promise<UsageSnapshot> {
    await this.ensureSchema();
    return this.sql.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext('hmmsa_external_ai_usage_v1'))`;
      const rows = await sql<Array<{
        id: string;
        actor_id: string;
        provider: "openai";
        model: string;
        created_at: Date;
      }>>`
        DELETE FROM external_ai_usage_reservations
        WHERE id = ${input.reservation.id}
        RETURNING id, actor_id, provider, model, created_at
      `;
      const reserved = rows[0];
      if (reserved) {
        await sql`
          INSERT INTO external_ai_usage_records
            (id, actor_id, provider, model, input_tokens, output_tokens, charged_tokens,
             status, created_at, settled_at)
          VALUES
            (${reserved.id}, ${reserved.actor_id}, ${reserved.provider}, ${reserved.model},
             ${Math.max(0, Math.trunc(input.inputTokens))},
             ${Math.max(0, Math.trunc(input.outputTokens))},
             ${Math.max(0, Math.trunc(input.chargedTokens))}, ${input.status},
             ${reserved.created_at}, ${input.now})
          ON CONFLICT (id) DO NOTHING
        `;
      }
      await this.cleanupExpired(sql, input.now);
      return this.snapshotInTransaction(sql, input.now, input.limits);
    });
  }

  async snapshot(now: Date, limits: ExternalUsageLimits): Promise<UsageSnapshot> {
    await this.ensureSchema();
    return this.sql.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext('hmmsa_external_ai_usage_v1'))`;
      await this.cleanupExpired(sql, now);
      return this.snapshotInTransaction(sql, now, limits);
    });
  }

  async claimAlert(key: string): Promise<"claimed" | "pending" | "already-sent"> {
    await this.ensureSchema();
    const now = new Date();
    const rows = await this.sql<Array<{ alert_key: string; status: "pending" | "sent" }>>`
      INSERT INTO external_ai_usage_alert_claims (alert_key, status, claimed_at)
      VALUES (${key}, 'pending', ${now})
      ON CONFLICT (alert_key) DO NOTHING
      RETURNING alert_key, status
    `;
    if (rows[0]) return "claimed";
    const staleBefore = new Date(now.getTime() - 10 * 60_000);
    const reclaimed = await this.sql<Array<{ alert_key: string }>>`
      UPDATE external_ai_usage_alert_claims
      SET claimed_at = ${now}
      WHERE alert_key = ${key} AND status = 'pending' AND claimed_at <= ${staleBefore}
      RETURNING alert_key
    `;
    if (reclaimed[0]) return "claimed";
    const existing = await this.sql<Array<{ status: "pending" | "sent" }>>`
      SELECT status FROM external_ai_usage_alert_claims WHERE alert_key = ${key}
    `;
    return existing[0]?.status === "sent" ? "already-sent" : "pending";
  }

  async completeAlert(key: string): Promise<void> {
    await this.ensureSchema();
    const rows = await this.sql<Array<{ alert_key: string }>>`
      UPDATE external_ai_usage_alert_claims SET status = 'sent'
      WHERE alert_key = ${key} AND status = 'pending'
      RETURNING alert_key
    `;
    if (!rows[0]) throw new Error("The durable usage-alert claim could not be completed.");
  }

  async releaseAlert(key: string): Promise<void> {
    await this.ensureSchema();
    await this.sql`
      DELETE FROM external_ai_usage_alert_claims
      WHERE alert_key = ${key} AND status = 'pending'
    `;
  }
}
