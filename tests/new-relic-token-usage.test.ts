import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getTokenUsageTelemetry,
  NewRelicTokenUsageDeliveryError,
  NewRelicTokenUsageTelemetry,
  recordSettledTokenUsageBestEffort,
  type SettledTokenUsageEventInput,
  type TokenUsageTelemetry,
} from "@/lib/observability/new-relic-token-usage";

const settledUsage: SettledTokenUsageEventInput = {
  provider: "openai",
  model: "gpt-external",
  result: "completed",
  inputTokens: 3_200,
  outputTokens: 900,
  chargedTokens: 4_100,
  reservedTokens: 5_000,
  snapshot: {
    daily: {
      period: "2026-08-21",
      requests: 4,
      requestLimit: 25,
      tokens: 48_000,
      tokenLimit: 60_000,
    },
    monthly: {
      period: "2026-08",
      requests: 40,
      requestLimit: 250,
      tokens: 510_000,
      tokenLimit: 600_000,
    },
  },
  durationMs: 1_234,
  timestamp: new Date("2026-08-21T12:34:56.000Z"),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("New Relic aggregate token telemetry", () => {
  it("is disabled by default even when account credentials are present", async () => {
    vi.stubEnv("NEW_RELIC_TOKEN_USAGE_EVENTS_ENABLED", "false");
    vi.stubEnv("NEW_RELIC_ACCOUNT_ID", "1234567");
    vi.stubEnv("NEW_RELIC_LICENSE_KEY", "nr-license-secret");
    const request = vi.spyOn(globalThis, "fetch");

    await getTokenUsageTelemetry().recordSettledUsage(settledUsage);

    expect(request).not.toHaveBeenCalled();
  });

  it("posts only a whitelisted aggregate event when explicitly enabled", async () => {
    vi.stubEnv("NEW_RELIC_TOKEN_USAGE_EVENTS_ENABLED", "true");
    vi.stubEnv("NEW_RELIC_ACCOUNT_ID", "1234567");
    vi.stubEnv("NEW_RELIC_LICENSE_KEY", "nr-license-secret");
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 202 }),
    );

    await getTokenUsageTelemetry().recordSettledUsage(settledUsage);

    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toBe(
      "https://insights-collector.newrelic.com/v1/accounts/1234567/events",
    );
    const init = request.mock.calls[0]?.[1] as RequestInit;
    const event = JSON.parse(String(init.body));
    expect(Object.keys(event).sort()).toEqual([
      "chargedTokens",
      "dailyTokenLimit",
      "dailyTokens",
      "dailyUtilizationPct",
      "durationMs",
      "environment",
      "eventType",
      "inputTokens",
      "model",
      "monthlyTokenLimit",
      "monthlyTokens",
      "monthlyUtilizationPct",
      "outputTokens",
      "phase",
      "provider",
      "reservedTokens",
      "result",
      "runtime",
      "scope",
      "serviceName",
      "timestamp",
    ].sort());
    expect(event).toMatchObject({
      eventType: "VotsAiTokenUsage",
      serviceName: "voices-of-the-shoah",
      runtime: "cloudways-next",
      scope: "external-research",
      phase: "settled",
      provider: "openai",
      model: "gpt-external",
      result: "completed",
      inputTokens: 3_200,
      outputTokens: 900,
      chargedTokens: 4_100,
      reservedTokens: 5_000,
      dailyTokens: 48_000,
      dailyTokenLimit: 60_000,
      dailyUtilizationPct: 80,
      monthlyTokens: 510_000,
      monthlyTokenLimit: 600_000,
      monthlyUtilizationPct: 85,
      durationMs: 1_234,
      timestamp: Date.parse("2026-08-21T12:34:56.000Z"),
    });
    const serialized = String(init.body);
    expect(serialized).not.toContain("nr-license-secret");
    expect(serialized).not.toMatch(/query|response|archive|family|actor|email|url|header/i);
  });

  it("requires an explicitly enabled, complete configuration", async () => {
    vi.stubEnv("NEW_RELIC_TOKEN_USAGE_EVENTS_ENABLED", "true");
    vi.stubEnv("NEW_RELIC_ACCOUNT_ID", "not-an-account-id");
    vi.stubEnv("NEW_RELIC_LICENSE_KEY", "nr-license-secret");
    const request = vi.spyOn(globalThis, "fetch");

    await getTokenUsageTelemetry().recordSettledUsage(settledUsage);

    expect(request).not.toHaveBeenCalled();
  });

  it("sanitizes delivery failures without reading an upstream response body", async () => {
    const secret = "nr-license-secret";
    const responseBody = vi.fn();
    const request = vi.fn().mockResolvedValue({
      ok: false,
      text: responseBody,
    } as unknown as Response);
    const telemetry = new NewRelicTokenUsageTelemetry(
      "1234567",
      secret,
      request as unknown as typeof fetch,
    );

    let message = "";
    try {
      await telemetry.recordSettledUsage(settledUsage);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/could not be delivered/i);
    expect(message).not.toContain(secret);
    expect(responseBody).not.toHaveBeenCalled();
  });

  it("aborts a stalled request promptly and remains fail-open to its caller", async () => {
    const request = vi.fn((_url: URL | RequestInfo, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
    );
    const telemetry = new NewRelicTokenUsageTelemetry(
      "1234567",
      "nr-license-secret",
      request as unknown as typeof fetch,
      5,
    );

    await expect(telemetry.recordSettledUsage(settledUsage)).rejects.toBeInstanceOf(
      NewRelicTokenUsageDeliveryError,
    );
    await expect(
      recordSettledTokenUsageBestEffort(settledUsage, telemetry),
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("swallows an adapter failure so usage accounting remains authoritative", async () => {
    const telemetry: TokenUsageTelemetry = {
      recordSettledUsage: vi.fn().mockRejectedValue(new Error("collector unavailable")),
    };

    await expect(
      recordSettledTokenUsageBestEffort(settledUsage, telemetry),
    ).resolves.toBeUndefined();
  });
});
