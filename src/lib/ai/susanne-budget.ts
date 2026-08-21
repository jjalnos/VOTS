import { externalUsageLimitsFromEnvironment } from "@/lib/ai/external-governance";
import { SUSANNE_REALTIME_MODEL } from "@/lib/ai/susanne-realtime";
import {
  getExternalUsageLedger,
  type ExternalUsageLedger,
  type ExternalUsageLimits,
  type UsageReservation,
} from "@/lib/ai/usage-ledger";

export interface SusanneRealtimeBudgetReservation {
  ledger: ExternalUsageLedger;
  limits: ExternalUsageLimits;
  reservation: UsageReservation;
}

export type SusanneRealtimeBudgetResult =
  | { ok: true; value: SusanneRealtimeBudgetReservation }
  | { ok: false; reason: "unavailable" | "limit-reached" };

let testLedger: ExternalUsageLedger | undefined;

/** Injects an isolated ledger only in tests; production always resolves the configured store. */
export function setSusanneRealtimeUsageLedgerForTests(
  ledger: ExternalUsageLedger | undefined,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The Susanne Realtime usage ledger can only be replaced in tests.");
  }
  testLedger = ledger;
}

export async function reserveSusanneRealtimeBudget(
  actorId: string,
  now = new Date(),
): Promise<SusanneRealtimeBudgetResult> {
  let ledger: ExternalUsageLedger;
  let limits: ExternalUsageLimits;
  try {
    limits = externalUsageLimitsFromEnvironment();
    ledger = testLedger ?? getExternalUsageLedger();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  // A live Realtime call must never use the process-local demo accounting
  // mode. This also fails closed if production was deployed without Postgres.
  if (!ledger.durable) return { ok: false, reason: "unavailable" };

  try {
    const result = await ledger.reserve({
      actorId,
      provider: "openai",
      model: SUSANNE_REALTIME_MODEL,
      // Realtime does not return final token usage to this request. Reserve the
      // configured hard ceiling so pending sessions count against every quota.
      reservedTokens: limits.maxTokensPerRequest,
      now,
      limits,
    });
    return result.allowed
      ? {
          ok: true,
          value: { ledger, limits, reservation: result.reservation },
        }
      : { ok: false, reason: "limit-reached" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Releases a reservation only when setup is known to have failed before a
 * usable Realtime session was returned. If settlement itself is unavailable,
 * the pending reservation remains and is conservatively charged on expiry.
 */
export async function settleSusanneRealtimeSetupFailure(
  budget: SusanneRealtimeBudgetReservation,
  now = new Date(),
): Promise<void> {
  try {
    await budget.ledger.settle({
      reservation: budget.reservation,
      chargedTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      status: "provider-error",
      now,
      limits: budget.limits,
    });
  } catch {
    // Fail closed and preserve the pending full-ceiling reservation. The
    // durable ledger will promote it when its existing 15-minute TTL expires.
  }
}
