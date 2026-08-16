import {
  EXTERNAL_RESEARCH_COST_ACKNOWLEDGEMENT,
  type ResearchRequest,
  type ResearchSuggestion,
} from "@/lib/ai/types";
import {
  resolveExternalResearchProvider,
  type ExternalResearchProviderResolution,
} from "@/lib/ai/external-provider";
import { externalResearchInputTokenCeiling } from "@/lib/ai/openai-research-provider";
import {
  getExternalUsageLedger,
  type ExternalUsageLedger,
  type ExternalUsageLimits,
  type ExternalUsageStoreMode,
  type UsageReservationResult,
  type UsageSnapshot,
} from "@/lib/ai/usage-ledger";
import {
  getUsageAlertAdapter,
  type UsageAlertAdapter,
} from "@/lib/ai/usage-alert";

export type ExternalUsageStatus =
  | "not-run"
  | "completed"
  | "blocked"
  | "provider-error";

export type ExternalUsageAlertStatus =
  | "not-required"
  | "below-threshold"
  | "sent"
  | "deduplicated"
  | "failed";

export interface ExternalResearchUsageMetadata {
  scope: "external-research";
  mode: "disabled-demo-fallback" | "openai-metered";
  status: ExternalUsageStatus;
  provider: "mock" | "openai";
  accounting: {
    mode: ExternalUsageStoreMode;
    durable: boolean;
    warning: "demo-only; resets on process restart" | null;
  };
  request: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reservedTokenCeiling: number;
    hardTokenLimit: number;
    hardQueryCharacterLimit: number;
  };
  daily: UsageSnapshot["daily"];
  monthly: UsageSnapshot["monthly"];
  alert: {
    status: ExternalUsageAlertStatus;
    thresholdPercent: number;
    recipient: "support@clicksmith.net";
  };
}

export interface GovernedExternalResearchResult {
  suggestion: ResearchSuggestion;
  usage: ExternalResearchUsageMetadata;
}

export class ExternalResearchGovernanceError extends Error {
  constructor(
    public readonly code:
      | "confirmation-required"
      | "cost-acknowledgement-required"
      | "request-too-large"
      | "usage-store-unavailable"
      | "usage-limit-reached"
      | "usage-alert-unavailable"
      | "provider-error",
    public readonly httpStatus: 400 | 413 | 429 | 502 | 503,
    message: string,
    public readonly usage?: ExternalResearchUsageMetadata,
  ) {
    super(message);
  }
}

function configuredInteger(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new ExternalResearchGovernanceError(
      "usage-store-unavailable",
      503,
      "External research governance is not configured safely.",
    );
  }
  return value;
}

export function externalUsageLimitsFromEnvironment(): ExternalUsageLimits {
  const limits: ExternalUsageLimits = {
    maxQueryCharacters: configuredInteger("EXTERNAL_AI_MAX_QUERY_CHARACTERS", 800, 10),
    maxOutputTokens: configuredInteger("EXTERNAL_AI_MAX_OUTPUT_TOKENS", 900, 1),
    maxTokensPerRequest: configuredInteger("EXTERNAL_AI_MAX_TOKENS_PER_REQUEST", 5_000, 100),
    dailyRequestLimit: configuredInteger("EXTERNAL_AI_DAILY_REQUEST_LIMIT", 25, 1),
    monthlyRequestLimit: configuredInteger("EXTERNAL_AI_MONTHLY_REQUEST_LIMIT", 250, 1),
    dailyTokenLimit: configuredInteger("EXTERNAL_AI_DAILY_TOKEN_LIMIT", 60_000, 100),
    monthlyTokenLimit: configuredInteger("EXTERNAL_AI_MONTHLY_TOKEN_LIMIT", 600_000, 100),
    alertThresholdPercent: configuredInteger("EXTERNAL_AI_ALERT_THRESHOLD_PERCENT", 80, 1),
  };
  if (
    limits.alertThresholdPercent > 100 ||
    limits.dailyRequestLimit > limits.monthlyRequestLimit ||
    limits.dailyTokenLimit > limits.monthlyTokenLimit ||
    limits.maxOutputTokens > limits.maxTokensPerRequest
  ) {
    throw new ExternalResearchGovernanceError(
      "usage-store-unavailable",
      503,
      "External research governance is not configured safely.",
    );
  }
  return limits;
}

function emptySnapshot(now: Date, limits: ExternalUsageLimits): UsageSnapshot {
  return {
    daily: {
      period: now.toISOString().slice(0, 10),
      requests: 0,
      requestLimit: limits.dailyRequestLimit,
      tokens: 0,
      tokenLimit: limits.dailyTokenLimit,
    },
    monthly: {
      period: now.toISOString().slice(0, 7),
      requests: 0,
      requestLimit: limits.monthlyRequestLimit,
      tokens: 0,
      tokenLimit: limits.monthlyTokenLimit,
    },
  };
}

function usageMetadata(input: {
  provider: "mock" | "openai";
  status: ExternalUsageStatus;
  accountingMode: ExternalUsageStoreMode;
  accountingDurable?: boolean;
  snapshot: UsageSnapshot;
  limits: ExternalUsageLimits;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reservedTokens?: number;
  alertStatus?: ExternalUsageAlertStatus;
}): ExternalResearchUsageMetadata {
  return {
    scope: "external-research",
    mode: input.provider === "openai" ? "openai-metered" : "disabled-demo-fallback",
    status: input.status,
    provider: input.provider,
    accounting: {
      mode: input.accountingMode,
      durable: input.accountingDurable ?? false,
      warning: input.accountingDurable ? null : "demo-only; resets on process restart",
    },
    request: {
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      totalTokens: input.totalTokens ?? 0,
      reservedTokenCeiling: input.reservedTokens ?? 0,
      hardTokenLimit: input.limits.maxTokensPerRequest,
      hardQueryCharacterLimit: input.limits.maxQueryCharacters,
    },
    daily: input.snapshot.daily,
    monthly: input.snapshot.monthly,
    alert: {
      status: input.alertStatus ?? "not-required",
      thresholdPercent: input.limits.alertThresholdPercent,
      recipient: "support@clicksmith.net",
    },
  };
}

function atThreshold(
  requests: number,
  requestLimit: number,
  tokens: number,
  tokenLimit: number,
  percent: number,
): boolean {
  return requests * 100 >= requestLimit * percent || tokens * 100 >= tokenLimit * percent;
}

async function alertForHighUsage(input: {
  snapshot: UsageSnapshot;
  ledger: ExternalUsageLedger;
  adapter: UsageAlertAdapter;
  limits: ExternalUsageLimits;
}): Promise<ExternalUsageAlertStatus> {
  const periods: Array<"daily" | "monthly"> = [];
  if (
    atThreshold(
      input.snapshot.daily.requests,
      input.snapshot.daily.requestLimit,
      input.snapshot.daily.tokens,
      input.snapshot.daily.tokenLimit,
      input.limits.alertThresholdPercent,
    )
  ) periods.push("daily");
  if (
    atThreshold(
      input.snapshot.monthly.requests,
      input.snapshot.monthly.requestLimit,
      input.snapshot.monthly.tokens,
      input.snapshot.monthly.tokenLimit,
      input.limits.alertThresholdPercent,
    )
  ) periods.push("monthly");
  if (!periods.length) return "below-threshold";

  const claimed: Array<{ period: "daily" | "monthly"; key: string }> = [];
  let alreadySent = 0;
  for (const period of periods) {
    const window = input.snapshot[period].period;
    const key = `${period}:${window}:${input.limits.alertThresholdPercent}`;
    const claim = await input.ledger.claimAlert(key);
    if (claim === "claimed") claimed.push({ period, key });
    if (claim === "already-sent") alreadySent += 1;
    if (claim === "pending") {
      await Promise.all(claimed.map((item) => input.ledger.releaseAlert(item.key)));
      throw new Error("usage-alert-pending");
    }
  }
  if (!claimed.length && alreadySent) return "deduplicated";

  try {
    await input.adapter.sendHighUsageAlert({
      periods: claimed.map((item) => item.period),
      snapshot: input.snapshot,
      accountingMode: input.ledger.mode,
      thresholdPercent: input.limits.alertThresholdPercent,
    });
    await Promise.all(claimed.map((item) => input.ledger.completeAlert(item.key)));
    return "sent";
  } catch {
    await Promise.all(claimed.map((item) => input.ledger.releaseAlert(item.key)));
    throw new Error("usage-alert-failed");
  }
}

interface GovernanceDependencies {
  now?: () => Date;
  resolveProvider?: (maxOutputTokens: number) => ExternalResearchProviderResolution;
  ledger?: ExternalUsageLedger;
  alertAdapter?: UsageAlertAdapter;
}

export async function runGovernedExternalResearch(
  request: ResearchRequest,
  dependencies: GovernanceDependencies = {},
): Promise<GovernedExternalResearchResult> {
  const now = (dependencies.now ?? (() => new Date()))();
  const limits = externalUsageLimitsFromEnvironment();

  if (request.curatorConfirmed !== true) {
    throw new ExternalResearchGovernanceError(
      "confirmation-required",
      400,
      "Explicit curator confirmation is required for external research.",
    );
  }
  if (request.costAcknowledgement !== EXTERNAL_RESEARCH_COST_ACKNOWLEDGEMENT) {
    throw new ExternalResearchGovernanceError(
      "cost-acknowledgement-required",
      400,
      "This paid external research request requires an explicit cost acknowledgement.",
    );
  }
  if (request.query.length > limits.maxQueryCharacters) {
    throw new ExternalResearchGovernanceError(
      "request-too-large",
      413,
      "The external research request exceeds its hard size limit.",
    );
  }

  const resolution = (dependencies.resolveProvider ?? resolveExternalResearchProvider)(
    limits.maxOutputTokens,
  );

  if (!resolution.live || resolution.provider.name !== "openai") {
    const suggestion = await resolution.provider.research(request);
    return {
      suggestion,
      usage: usageMetadata({
        provider: "mock",
        status: "not-run",
        accountingMode: "demo-memory-non-durable",
        snapshot: emptySnapshot(now, limits),
        limits,
      }),
    };
  }

  let ledger: ExternalUsageLedger;
  try {
    ledger = dependencies.ledger ?? getExternalUsageLedger();
  } catch {
    throw new ExternalResearchGovernanceError(
      "usage-store-unavailable",
      503,
      "External research is unavailable because its usage controls are not ready.",
    );
  }
  if (!ledger.durable) {
    throw new ExternalResearchGovernanceError(
      "usage-store-unavailable",
      503,
      "Live external research requires durable usage accounting.",
    );
  }
  let alertAdapter: UsageAlertAdapter;
  try {
    alertAdapter = dependencies.alertAdapter ?? getUsageAlertAdapter();
  } catch {
    throw new ExternalResearchGovernanceError(
      "usage-alert-unavailable",
      503,
      "External research is unavailable because its usage controls are not ready.",
    );
  }

  const inputTokenCeiling = externalResearchInputTokenCeiling(request);
  const reservedTokens = inputTokenCeiling + limits.maxOutputTokens;
  if (reservedTokens > limits.maxTokensPerRequest) {
    let snapshot: UsageSnapshot;
    try {
      snapshot = await ledger.snapshot(now, limits);
    } catch {
      throw new ExternalResearchGovernanceError(
        "usage-store-unavailable",
        503,
        "External research is unavailable because durable usage accounting could not be reached.",
      );
    }
    throw new ExternalResearchGovernanceError(
      "request-too-large",
      413,
      "The external research request exceeds its hard token limit.",
      usageMetadata({
        provider: "openai",
        status: "blocked",
        accountingMode: ledger.mode,
        accountingDurable: ledger.durable,
        snapshot,
        limits,
        inputTokens: inputTokenCeiling,
        reservedTokens,
      }),
    );
  }

  let reservationResult: UsageReservationResult;
  try {
    reservationResult = await ledger.reserve({
      actorId: request.initiatedByUserId,
      provider: "openai",
      model: resolution.model ?? "configured-external-model",
      reservedTokens,
      now,
      limits,
    });
  } catch {
    throw new ExternalResearchGovernanceError(
      "usage-store-unavailable",
      503,
      "External research is unavailable because durable usage accounting could not be reached.",
    );
  }
  if (!reservationResult.allowed) {
    throw new ExternalResearchGovernanceError(
      "usage-limit-reached",
      429,
      "The external research usage limit has been reached.",
      usageMetadata({
        provider: "openai",
        status: "blocked",
        accountingMode: ledger.mode,
        accountingDurable: ledger.durable,
        snapshot: reservationResult.snapshot,
        limits,
        inputTokens: inputTokenCeiling,
        reservedTokens,
      }),
    );
  }

  let alertStatus: ExternalUsageAlertStatus;
  try {
    alertStatus = await alertForHighUsage({
      snapshot: reservationResult.snapshot,
      ledger,
      adapter: alertAdapter,
      limits,
    });
  } catch {
    let snapshot = reservationResult.snapshot;
    try {
      snapshot = await ledger.settle({
        reservation: reservationResult.reservation,
        chargedTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        status: "blocked",
        now,
        limits,
      });
    } catch {
      // The external provider has not been called. Preserve sanitized metadata
      // from the successful reservation and fail closed.
    }
    throw new ExternalResearchGovernanceError(
      "usage-alert-unavailable",
      503,
      "External research was blocked because the high-usage alert could not be delivered.",
      usageMetadata({
        provider: "openai",
        status: "blocked",
        accountingMode: ledger.mode,
        accountingDurable: ledger.durable,
        snapshot,
        limits,
        inputTokens: inputTokenCeiling,
        reservedTokens,
        alertStatus: "failed",
      }),
    );
  }

  let suggestion: ResearchSuggestion;
  try {
    suggestion = await resolution.provider.research(request);
  } catch {
    let snapshot = reservationResult.snapshot;
    try {
      snapshot = await ledger.settle({
        reservation: reservationResult.reservation,
        chargedTokens: reservedTokens,
        inputTokens: inputTokenCeiling,
        outputTokens: limits.maxOutputTokens,
        status: "provider-error",
        now,
        limits,
      });
    } catch {
      // A conservative reservation remains until expiry, when the durable
      // ledger promotes it to a charged provider-error record at the full
      // reserved ceiling. Never retry the provider from this request.
    }
    throw new ExternalResearchGovernanceError(
      "provider-error",
      502,
      "The external research provider could not complete the request.",
      usageMetadata({
        provider: "openai",
        status: "provider-error",
        accountingMode: ledger.mode,
        accountingDurable: ledger.durable,
        snapshot,
        limits,
        inputTokens: inputTokenCeiling,
        totalTokens: reservedTokens,
        reservedTokens,
        alertStatus,
      }),
    );
  }

  const reported = suggestion.providerUsage;
  const chargedTokens = reported?.totalTokens
    ? Math.max(reported.totalTokens, reported.inputTokens + reported.outputTokens)
    : reservedTokens;
  let snapshot: UsageSnapshot;
  try {
    snapshot = await ledger.settle({
      reservation: reservationResult.reservation,
      chargedTokens,
      inputTokens: reported?.inputTokens ?? inputTokenCeiling,
      outputTokens: reported?.outputTokens ?? limits.maxOutputTokens,
      status: "completed",
      now,
      limits,
    });
  } catch {
    // The provider may already have incurred a bill. The durable reservation is
    // intentionally left in place so expiry promotes it to a conservative
    // charged provider-error record instead of letting the call disappear.
    throw new ExternalResearchGovernanceError(
      "usage-store-unavailable",
      503,
      "The external research result was withheld because durable usage accounting could not be completed.",
    );
  }
  return {
    suggestion,
    usage: usageMetadata({
      provider: "openai",
      status: "completed",
      accountingMode: ledger.mode,
      accountingDurable: ledger.durable,
      snapshot,
      limits,
      inputTokens: reported?.inputTokens ?? inputTokenCeiling,
      outputTokens: reported?.outputTokens ?? limits.maxOutputTokens,
      totalTokens: chargedTokens,
      reservedTokens,
      alertStatus,
    }),
  };
}
