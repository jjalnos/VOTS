import type { ExternalUsageRecordStatus, UsageSnapshot } from "@/lib/ai/usage-ledger";

export const NEW_RELIC_TOKEN_USAGE_EVENT_TYPE = "VotsAiTokenUsage";

const NEW_RELIC_EVENTS_HOST = "insights-collector.newrelic.com";
const DEFAULT_TIMEOUT_MS = 2_000;

export interface SettledTokenUsageEventInput {
  provider: "openai";
  model: string;
  result: ExternalUsageRecordStatus;
  inputTokens: number;
  outputTokens: number;
  chargedTokens: number;
  reservedTokens: number;
  snapshot: UsageSnapshot;
  durationMs: number;
  timestamp: Date;
}

export interface TokenUsageTelemetry {
  recordSettledUsage(input: SettledTokenUsageEventInput): Promise<void>;
}

export class NewRelicTokenUsageDeliveryError extends Error {}

class DisabledTokenUsageTelemetry implements TokenUsageTelemetry {
  async recordSettledUsage(): Promise<void> {}
}

const disabledTelemetry = new DisabledTokenUsageTelemetry();

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function utilizationPercent(tokens: number, limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.round((nonNegativeInteger(tokens) / nonNegativeInteger(limit)) * 10_000) / 100;
}

function runtimeEnvironment(): "production" | "development" | "test" | "unknown" {
  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.NODE_ENV === "development") return "development";
  if (process.env.NODE_ENV === "test") return "test";
  return "unknown";
}

function buildEvent(input: SettledTokenUsageEventInput) {
  const dailyTokens = nonNegativeInteger(input.snapshot.daily.tokens);
  const dailyTokenLimit = nonNegativeInteger(input.snapshot.daily.tokenLimit);
  const monthlyTokens = nonNegativeInteger(input.snapshot.monthly.tokens);
  const monthlyTokenLimit = nonNegativeInteger(input.snapshot.monthly.tokenLimit);

  return {
    eventType: NEW_RELIC_TOKEN_USAGE_EVENT_TYPE,
    serviceName: "voices-of-the-shoah",
    runtime: "cloudways-next",
    environment: runtimeEnvironment(),
    scope: "external-research",
    phase: "settled",
    provider: input.provider,
    model: input.model.slice(0, 255),
    result: input.result,
    inputTokens: nonNegativeInteger(input.inputTokens),
    outputTokens: nonNegativeInteger(input.outputTokens),
    chargedTokens: nonNegativeInteger(input.chargedTokens),
    reservedTokens: nonNegativeInteger(input.reservedTokens),
    dailyTokens,
    dailyTokenLimit,
    dailyUtilizationPct: utilizationPercent(dailyTokens, dailyTokenLimit),
    monthlyTokens,
    monthlyTokenLimit,
    monthlyUtilizationPct: utilizationPercent(monthlyTokens, monthlyTokenLimit),
    durationMs: nonNegativeInteger(input.durationMs),
    timestamp: input.timestamp.getTime(),
  };
}

export class NewRelicTokenUsageTelemetry implements TokenUsageTelemetry {
  private readonly endpoint: string;

  constructor(
    accountId: string,
    private readonly licenseKey: string,
    private readonly request: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    if (!/^\d+$/.test(accountId) || !licenseKey || timeoutMs < 1) {
      throw new NewRelicTokenUsageDeliveryError(
        "New Relic token-usage telemetry is not configured safely.",
      );
    }
    this.endpoint = `https://${NEW_RELIC_EVENTS_HOST}/v1/accounts/${accountId}/events`;
  }

  async recordSettledUsage(input: SettledTokenUsageEventInput): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.request(this.endpoint, {
        method: "POST",
        headers: {
          "Api-Key": this.licenseKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildEvent(input)),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        // Do not inspect the response body: an upstream body may echo an
        // operational value that must never reach application logs or clients.
        throw new NewRelicTokenUsageDeliveryError(
          "New Relic token-usage telemetry could not be delivered.",
        );
      }
    } catch (error) {
      if (error instanceof NewRelicTokenUsageDeliveryError) throw error;
      throw new NewRelicTokenUsageDeliveryError(
        "New Relic token-usage telemetry could not be delivered.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getTokenUsageTelemetry(): TokenUsageTelemetry {
  if (process.env.NEW_RELIC_TOKEN_USAGE_EVENTS_ENABLED !== "true") {
    return disabledTelemetry;
  }
  const accountId = process.env.NEW_RELIC_ACCOUNT_ID;
  const licenseKey = process.env.NEW_RELIC_LICENSE_KEY;
  if (!accountId || !licenseKey) return disabledTelemetry;
  try {
    return new NewRelicTokenUsageTelemetry(accountId, licenseKey);
  } catch {
    return disabledTelemetry;
  }
}

export async function recordSettledTokenUsageBestEffort(
  input: SettledTokenUsageEventInput,
  telemetry: TokenUsageTelemetry = getTokenUsageTelemetry(),
): Promise<void> {
  try {
    await telemetry.recordSettledUsage(input);
  } catch {
    // The PostgreSQL ledger and its existing high-usage alert remain
    // authoritative. Observability must never change a provider outcome.
  }
}
