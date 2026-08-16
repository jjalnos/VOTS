import { PostgresExternalUsageLedger } from "@/lib/ai/postgres-usage-ledger";

export type ExternalUsageStoreMode = "demo-memory-non-durable" | "postgres" | "redis";
export type ExternalUsageRecordStatus = "completed" | "provider-error" | "blocked";

export interface ExternalUsageLimits {
  maxQueryCharacters: number;
  maxOutputTokens: number;
  maxTokensPerRequest: number;
  dailyRequestLimit: number;
  monthlyRequestLimit: number;
  dailyTokenLimit: number;
  monthlyTokenLimit: number;
  alertThresholdPercent: number;
}

export interface UsageWindowSnapshot {
  period: string;
  requests: number;
  requestLimit: number;
  tokens: number;
  tokenLimit: number;
}

export interface UsageSnapshot {
  daily: UsageWindowSnapshot;
  monthly: UsageWindowSnapshot;
}

export interface UsageReservation {
  id: string;
  actorId: string;
  provider: "openai";
  model: string;
  createdAt: Date;
  reservedTokens: number;
}

export type UsageReservationResult =
  | { allowed: true; reservation: UsageReservation; snapshot: UsageSnapshot }
  | {
      allowed: false;
      reason:
        | "daily-request-limit"
        | "monthly-request-limit"
        | "daily-token-limit"
        | "monthly-token-limit";
      snapshot: UsageSnapshot;
    };

export interface ExternalUsageLedger {
  readonly mode: ExternalUsageStoreMode;
  readonly durable: boolean;
  reserve(input: {
    actorId: string;
    provider: "openai";
    model: string;
    reservedTokens: number;
    now: Date;
    limits: ExternalUsageLimits;
  }): Promise<UsageReservationResult>;
  settle(input: {
    reservation: UsageReservation;
    chargedTokens: number;
    inputTokens: number;
    outputTokens: number;
    status: ExternalUsageRecordStatus;
    now: Date;
    limits: ExternalUsageLimits;
  }): Promise<UsageSnapshot>;
  snapshot(now: Date, limits: ExternalUsageLimits): Promise<UsageSnapshot>;
  claimAlert(key: string): Promise<"claimed" | "pending" | "already-sent">;
  completeAlert(key: string): Promise<void>;
  releaseAlert(key: string): Promise<void>;
}

interface SettledUsageRecord {
  id: string;
  createdAt: Date;
  chargedTokens: number;
  inputTokens: number;
  outputTokens: number;
  actorId: string;
  provider: "openai";
  model: string;
  status: ExternalUsageRecordStatus;
}

interface DemoUsageState {
  nextId: number;
  reservations: Map<string, { reservation: UsageReservation; expiresAt: Date }>;
  records: SettledUsageRecord[];
  alertClaims: Map<string, { status: "pending" | "sent"; claimedAt: number }>;
}

const demoState: DemoUsageState = {
  nextId: 1,
  reservations: new Map(),
  records: [],
  alertClaims: new Map(),
};

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

const RESERVATION_LIFETIME_MS = 15 * 60_000;

function promoteExpiredDemoReservations(now: Date): void {
  for (const [id, pending] of demoState.reservations) {
    if (pending.expiresAt > now) continue;
    demoState.reservations.delete(id);
    if (demoState.records.some((record) => record.id === id)) continue;
    demoState.records.push({
      id,
      createdAt: pending.reservation.createdAt,
      chargedTokens: pending.reservation.reservedTokens,
      inputTokens: 0,
      outputTokens: 0,
      actorId: pending.reservation.actorId,
      provider: pending.reservation.provider,
      model: pending.reservation.model,
      status: "provider-error",
    });
  }
}

function snapshotFromState(now: Date, limits: ExternalUsageLimits): UsageSnapshot {
  promoteExpiredDemoReservations(now);
  const day = utcDay(now);
  const month = utcMonth(now);
  const relevantRecords = demoState.records.filter(
    (record) => utcMonth(record.createdAt) === month,
  );
  const relevantReservations = [...demoState.reservations.values()].map(
    (pending) => pending.reservation,
  ).filter(
    (reservation) => utcMonth(reservation.createdAt) === month,
  );
  const dailyRecords = relevantRecords.filter((record) => utcDay(record.createdAt) === day);
  const dailyReservations = relevantReservations.filter(
    (reservation) => utcDay(reservation.createdAt) === day,
  );
  return {
    daily: {
      period: day,
      requests: dailyRecords.length + dailyReservations.length,
      requestLimit: limits.dailyRequestLimit,
      tokens:
        dailyRecords.reduce((sum, record) => sum + record.chargedTokens, 0) +
        dailyReservations.reduce((sum, reservation) => sum + reservation.reservedTokens, 0),
      tokenLimit: limits.dailyTokenLimit,
    },
    monthly: {
      period: month,
      requests: relevantRecords.length + relevantReservations.length,
      requestLimit: limits.monthlyRequestLimit,
      tokens:
        relevantRecords.reduce((sum, record) => sum + record.chargedTokens, 0) +
        relevantReservations.reduce((sum, reservation) => sum + reservation.reservedTokens, 0),
      tokenLimit: limits.monthlyTokenLimit,
    },
  };
}

export class DemoMemoryExternalUsageLedger implements ExternalUsageLedger {
  readonly mode = "demo-memory-non-durable" as const;
  readonly durable = false as const;

  async reserve(input: {
    actorId: string;
    provider: "openai";
    model: string;
    reservedTokens: number;
    now: Date;
    limits: ExternalUsageLimits;
  }): Promise<UsageReservationResult> {
    const before = snapshotFromState(input.now, input.limits);
    if (before.daily.requests >= input.limits.dailyRequestLimit) {
      return { allowed: false, reason: "daily-request-limit", snapshot: before };
    }
    if (before.monthly.requests >= input.limits.monthlyRequestLimit) {
      return { allowed: false, reason: "monthly-request-limit", snapshot: before };
    }
    if (before.daily.tokens + input.reservedTokens > input.limits.dailyTokenLimit) {
      return { allowed: false, reason: "daily-token-limit", snapshot: before };
    }
    if (before.monthly.tokens + input.reservedTokens > input.limits.monthlyTokenLimit) {
      return { allowed: false, reason: "monthly-token-limit", snapshot: before };
    }

    const reservation: UsageReservation = {
      id: `demo-external-ai-${demoState.nextId++}`,
      actorId: input.actorId,
      provider: input.provider,
      model: input.model,
      createdAt: input.now,
      reservedTokens: input.reservedTokens,
    };
    demoState.reservations.set(reservation.id, {
      reservation,
      expiresAt: new Date(input.now.getTime() + RESERVATION_LIFETIME_MS),
    });
    return {
      allowed: true,
      reservation,
      snapshot: snapshotFromState(input.now, input.limits),
    };
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
    const pending = demoState.reservations.get(input.reservation.id);
    if (!pending) return snapshotFromState(input.now, input.limits);
    const existing = pending.reservation;
    demoState.reservations.delete(existing.id);
    demoState.records.push({
      id: existing.id,
      createdAt: existing.createdAt,
      chargedTokens: Math.max(0, Math.trunc(input.chargedTokens)),
      inputTokens: Math.max(0, Math.trunc(input.inputTokens)),
      outputTokens: Math.max(0, Math.trunc(input.outputTokens)),
      actorId: existing.actorId,
      provider: existing.provider,
      model: existing.model,
      status: input.status,
    });
    return snapshotFromState(input.now, input.limits);
  }

  async snapshot(now: Date, limits: ExternalUsageLimits): Promise<UsageSnapshot> {
    return snapshotFromState(now, limits);
  }

  async claimAlert(key: string): Promise<"claimed" | "pending" | "already-sent"> {
    const current = demoState.alertClaims.get(key);
    if (current?.status === "sent") return "already-sent";
    if (current?.status === "pending" && current.claimedAt > Date.now() - 10 * 60_000) {
      return "pending";
    }
    demoState.alertClaims.set(key, { status: "pending", claimedAt: Date.now() });
    return "claimed";
  }

  async completeAlert(key: string): Promise<void> {
    const current = demoState.alertClaims.get(key);
    if (current?.status !== "pending") {
      throw new Error("The usage-alert claim is not pending.");
    }
    demoState.alertClaims.set(key, { ...current, status: "sent" });
  }

  async releaseAlert(key: string): Promise<void> {
    if (demoState.alertClaims.get(key)?.status === "pending") {
      demoState.alertClaims.delete(key);
    }
  }
}

const demoLedger = new DemoMemoryExternalUsageLedger();
const usageLedgerGlobal = globalThis as typeof globalThis & {
  hmmsaPostgresExternalUsageLedger?: PostgresExternalUsageLedger;
  hmmsaPostgresExternalUsageLedgerUrl?: string;
};

function postgresLedger(databaseUrl: string): PostgresExternalUsageLedger {
  if (
    usageLedgerGlobal.hmmsaPostgresExternalUsageLedger &&
    usageLedgerGlobal.hmmsaPostgresExternalUsageLedgerUrl === databaseUrl
  ) {
    return usageLedgerGlobal.hmmsaPostgresExternalUsageLedger;
  }
  const ledger = new PostgresExternalUsageLedger(databaseUrl);
  usageLedgerGlobal.hmmsaPostgresExternalUsageLedger = ledger;
  usageLedgerGlobal.hmmsaPostgresExternalUsageLedgerUrl = databaseUrl;
  return ledger;
}

export class ExternalUsageStoreConfigurationError extends Error {}

export function getExternalUsageLedger(): ExternalUsageLedger {
  const configured = process.env.EXTERNAL_AI_USAGE_STORE?.trim() || "auto";
  if (configured === "auto" && process.env.DATABASE_URL) {
    return postgresLedger(process.env.DATABASE_URL);
  }
  if (configured === "auto") return demoLedger;
  if (configured === "demo_memory") return demoLedger;
  if (configured === "postgres" && process.env.DATABASE_URL) {
    return postgresLedger(process.env.DATABASE_URL);
  }
  // Redis remains an adapter seam. Selecting it before installation, or
  // selecting PostgreSQL without a connection, fails closed.
  throw new ExternalUsageStoreConfigurationError(
    "The configured external AI usage store is unavailable.",
  );
}

export function resetDemoExternalUsageLedgerForTests(): void {
  demoState.nextId = 1;
  demoState.reservations.clear();
  demoState.records.length = 0;
  demoState.alertClaims.clear();
}
