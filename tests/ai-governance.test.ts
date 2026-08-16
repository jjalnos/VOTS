import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postPublishedChat } from "@/app/api/chat/route";
import {
  ExternalResearchGovernanceError,
  externalUsageLimitsFromEnvironment,
  runGovernedExternalResearch,
} from "@/lib/ai/external-governance";
import { getInternalArchiveAIProvider } from "@/lib/ai/internal-provider";
import { LocalOpenAICompatibleProvider } from "@/lib/ai/local-provider";
import { OpenAIResearchProvider } from "@/lib/ai/openai-research-provider";
import {
  EXTERNAL_RESEARCH_COST_ACKNOWLEDGEMENT,
  type ExternalResearchProvider,
  type ResearchRequest,
  type ResearchSuggestion,
} from "@/lib/ai/types";
import {
  DemoMemoryExternalUsageLedger,
  getExternalUsageLedger,
  resetDemoExternalUsageLedgerForTests,
  type ExternalUsageLedger,
} from "@/lib/ai/usage-ledger";
import {
  ResendUsageAlertAdapter,
  type UsageAlertAdapter,
} from "@/lib/ai/usage-alert";

const confirmedRequest: ResearchRequest = {
  query: "Find curator-reviewable source leads about Sam Cohen's oral history.",
  locale: "en",
  allowedDomains: ["hmmsa.org", "ushmm.org"],
  initiatedByUserId: "curator-test",
  curatorConfirmed: true,
  costAcknowledgement: EXTERNAL_RESEARCH_COST_ACKNOWLEDGEMENT,
};

function fakeOpenAIProvider(call = vi.fn()): ExternalResearchProvider {
  return {
    name: "openai",
    research: async () => {
      call();
      return {
        summary: "A bounded external research suggestion.",
        sources: [],
        provider: "openai",
        status: "suggested",
        requiresCuratorApproval: true,
        safetyNotice: "Curator review required.",
        providerUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } satisfies ResearchSuggestion;
    },
  };
}

const successfulAlertAdapter: UsageAlertAdapter = {
  name: "resend",
  sendHighUsageAlert: vi.fn().mockResolvedValue(undefined),
};

function durableTestLedger(): ExternalUsageLedger {
  const memory = new DemoMemoryExternalUsageLedger();
  return {
    mode: "postgres",
    durable: true,
    reserve: (input) => memory.reserve(input),
    settle: (input) => memory.settle(input),
    snapshot: (now, limits) => memory.snapshot(now, limits),
    claimAlert: (key) => memory.claimAlert(key),
    completeAlert: (key) => memory.completeAlert(key),
    releaseAlert: (key) => memory.releaseAlert(key),
  };
}

beforeEach(() => {
  resetDemoExternalUsageLedgerForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("internal archive AI isolation", () => {
  it("returns the deterministic provider when an internal URL points at OpenAI", async () => {
    vi.stubEnv("INTERNAL_AI_PROVIDER", "local_openai_compatible");
    vi.stubEnv("LOCAL_AI_BASE_URL", "https://api.openai.com");
    vi.stubEnv("LOCAL_AI_MODEL", "gpt-5");
    const request = vi.spyOn(globalThis, "fetch");

    const provider = getInternalArchiveAIProvider();
    const answer = await provider.answerPublishedChat({
      question: "Who was Sam Cohen?",
      locale: "en",
      publishedContext: "Approved archive context only.",
    });

    expect(provider.name).toBe("mock");
    expect("research" in provider).toBe(false);
    expect(answer).toBe("Approved archive context only.");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects an arbitrary public compatible endpoint when no exact allowlist exists", async () => {
    vi.stubEnv("INTERNAL_AI_PROVIDER", "local_openai_compatible");
    vi.stubEnv("LOCAL_AI_BASE_URL", "https://models.vendor.example");
    vi.stubEnv("LOCAL_AI_MODEL", "compatible-model");
    vi.stubEnv("LOCAL_AI_ALLOWED_HOSTS", "");
    const request = vi.spyOn(globalThis, "fetch");

    const provider = getInternalArchiveAIProvider();
    const answer = await provider.answerPublishedChat({
      question: "Who was Sam Cohen?",
      locale: "en",
      publishedContext: "Approved archive context only.",
    });

    expect(provider.name).toBe("mock");
    expect(answer).toBe("Approved archive context only.");
    expect(request).not.toHaveBeenCalled();
  });

  it("revalidates direct local-provider construction before the network boundary", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    const provider = new LocalOpenAICompatibleProvider(
      "https://chatgpt.com/backend-api",
      "external-model",
    );

    await expect(
      provider.answerPublishedChat({
        question: "question",
        locale: "en",
        publishedContext: "approved context",
      }),
    ).rejects.toThrow(/approved self-hosted endpoint/i);
    expect(request).not.toHaveBeenCalled();
  });

  it("revalidates the exact allowlist before a direct provider fetch", async () => {
    vi.stubEnv("LOCAL_AI_ALLOWED_HOSTS", "trusted.internal.example");
    const request = vi.spyOn(globalThis, "fetch");
    const provider = new LocalOpenAICompatibleProvider(
      "https://models.vendor.example",
      "compatible-model",
    );

    await expect(
      provider.answerPublishedChat({
        question: "question",
        locale: "en",
        publishedContext: "approved context",
      }),
    ).rejects.toThrow(/approved self-hosted endpoint/i);
    expect(request).not.toHaveBeenCalled();
  });

  it("allows a configured self-hosted OpenAI-compatible endpoint only", async () => {
    vi.stubEnv("INTERNAL_AI_PROVIDER", "local_openai_compatible");
    vi.stubEnv("LOCAL_AI_BASE_URL", "https://llm.internal.example");
    vi.stubEnv("LOCAL_AI_ALLOWED_HOSTS", "llm.internal.example");
    vi.stubEnv("LOCAL_AI_MODEL", "hermes-local");
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "Grounded local phrasing." } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = getInternalArchiveAIProvider();
    const answer = await provider.answerPublishedChat({
      question: "Who was Sam Cohen?",
      locale: "en",
      publishedContext: "Approved archive context only.",
    });

    expect(provider.name).toBe("local_openai_compatible");
    expect(answer).toBe("Grounded local phrasing.");
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toBe(
      "https://llm.internal.example/v1/chat/completions",
    );
  });

  it("never follows a self-hosted endpoint redirect with the private POST body", async () => {
    vi.stubEnv("LOCAL_AI_ALLOWED_HOSTS", "llm.internal.example");
    const parseBody = vi.fn();
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 307,
      json: parseBody,
    } as unknown as Response);
    const provider = new LocalOpenAICompatibleProvider(
      "https://llm.internal.example",
      "hermes-local",
    );

    await expect(provider.answerPublishedChat({
      question: "Who was Sam Cohen?",
      locale: "en",
      publishedContext: "PRIVATE ARCHIVE EVIDENCE",
    })).rejects.toThrow(/redirects are not accepted/i);

    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      redirect: "manual",
    });
    expect(parseBody).not.toHaveBeenCalled();
  });

  it("publishes explicit no-external-usage metadata from archive chat", async () => {
    vi.stubEnv("INTERNAL_AI_PROVIDER", "local_openai_compatible");
    vi.stubEnv("LOCAL_AI_BASE_URL", "https://api.openai.com");
    vi.stubEnv("LOCAL_AI_MODEL", "gpt-5");
    const request = vi.spyOn(globalThis, "fetch");

    const response = await postPublishedChat(
      new Request("https://archive.example/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Tell me about Sam Cohen", locale: "en" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.aiUsage).toMatchObject({
      scope: "internal-archive",
      mode: "deterministic-grounded-fallback",
      externalProviderCalled: false,
      externalBillableUsage: "none",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps internal routes free of the external/OpenAI provider module", () => {
    for (const file of [
      "src/app/api/chat/route.ts",
      "src/app/api/ai/extract/route.ts",
      "src/app/api/ai/translate/route.ts",
      "src/app/api/demo/agent/route.ts",
      "src/app/api/demo/studio/persona/route.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/external-provider|openai-research-provider|OPENAI_API_KEY/);
    }
    for (const file of [
      "src/lib/ai/internal-provider.ts",
      "src/lib/ai/internal-endpoint.ts",
      "src/lib/ai/local-provider.ts",
      "src/lib/ai/mock-provider.ts",
      "src/lib/demo-agent.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/external-provider|openai-research-provider|OPENAI_API_KEY/);
    }
  });
});

describe("external research governance", () => {
  it("does not call any network provider while external research is disabled", async () => {
    vi.stubEnv("EXTERNAL_RESEARCH_PROVIDER", "mock");
    vi.stubEnv("OPENAI_EXTERNAL_RESEARCH_ENABLED", "false");
    const request = vi.spyOn(globalThis, "fetch");

    const result = await runGovernedExternalResearch(confirmedRequest);

    expect(result.suggestion.provider).toBe("mock");
    expect(result.usage).toMatchObject({
      mode: "disabled-demo-fallback",
      status: "not-run",
      accounting: {
        mode: "demo-memory-non-durable",
        durable: false,
      },
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("selects durable PostgreSQL accounting automatically when DATABASE_URL exists", () => {
    vi.stubEnv("EXTERNAL_AI_USAGE_STORE", "");
    vi.stubEnv("DATABASE_URL", "postgresql://archive:test@127.0.0.1:5432/archive_test");

    const ledger = getExternalUsageLedger();

    expect(ledger.mode).toBe("postgres");
    expect(ledger.durable).toBe(true);
  });

  it("blocks live external research when only the demo-memory ledger is available", async () => {
    const call = vi.fn();
    const provider = fakeOpenAIProvider(call);

    await expect(
      runGovernedExternalResearch(confirmedRequest, {
        resolveProvider: () => ({ provider, model: "external", live: true }),
        ledger: new DemoMemoryExternalUsageLedger(),
        alertAdapter: successfulAlertAdapter,
      }),
    ).rejects.toMatchObject({ code: "usage-store-unavailable", httpStatus: 503 });
    expect(call).not.toHaveBeenCalled();
  });

  it("fails closed before OpenAI when the durable ledger cannot reserve", async () => {
    const call = vi.fn();
    const provider = fakeOpenAIProvider(call);
    const ledger = durableTestLedger();
    ledger.reserve = vi.fn().mockRejectedValue(
      new Error("postgresql://user:secret@database.internal/archive"),
    );

    await expect(
      runGovernedExternalResearch(confirmedRequest, {
        resolveProvider: () => ({ provider, model: "external", live: true }),
        ledger,
        alertAdapter: successfulAlertAdapter,
      }),
    ).rejects.toMatchObject({
      code: "usage-store-unavailable",
      httpStatus: 503,
      message: expect.not.stringContaining("secret"),
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("requires confirmation before an OpenAI provider can be invoked", async () => {
    const call = vi.fn();
    const provider = fakeOpenAIProvider(call);
    const unconfirmed = {
      ...confirmedRequest,
      curatorConfirmed: false,
    } as unknown as ResearchRequest;

    await expect(
      runGovernedExternalResearch(unconfirmed, {
        resolveProvider: () => ({ provider, model: "external", live: true }),
        ledger: durableTestLedger(),
        alertAdapter: successfulAlertAdapter,
      }),
    ).rejects.toMatchObject({ code: "confirmation-required", httpStatus: 400 });
    expect(call).not.toHaveBeenCalled();
  });

  it("treats confirmed true as insufficient without this request's exact cost acknowledgement", async () => {
    const call = vi.fn();
    const provider = fakeOpenAIProvider(call);
    const resolveProvider = vi.fn(() => ({ provider, model: "external", live: true }));
    const confirmedWithoutCostConsent = {
      ...confirmedRequest,
      costAcknowledgement: undefined,
    } as unknown as ResearchRequest;

    await expect(
      runGovernedExternalResearch(confirmedWithoutCostConsent, {
        resolveProvider,
        ledger: durableTestLedger(),
        alertAdapter: successfulAlertAdapter,
      }),
    ).rejects.toMatchObject({
      code: "cost-acknowledgement-required",
      httpStatus: 400,
    });
    expect(resolveProvider).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it("rejects a stale or altered cost acknowledgement before provider resolution", async () => {
    const call = vi.fn();
    const provider = fakeOpenAIProvider(call);
    const resolveProvider = vi.fn(() => ({ provider, model: "external", live: true }));

    await expect(
      runGovernedExternalResearch({
        ...confirmedRequest,
        costAcknowledgement: "CLICKSMITH_PAYS_SOMETHING_ELSE",
      } as unknown as ResearchRequest, {
        resolveProvider,
        ledger: durableTestLedger(),
        alertAdapter: successfulAlertAdapter,
      }),
    ).rejects.toMatchObject({ code: "cost-acknowledgement-required" });
    expect(resolveProvider).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it("enforces hard daily limits before the external provider call", async () => {
    vi.stubEnv("EXTERNAL_AI_DAILY_TOKEN_LIMIT", "100");
    vi.stubEnv("EXTERNAL_AI_MONTHLY_TOKEN_LIMIT", "1000");
    const call = vi.fn();
    const provider = fakeOpenAIProvider(call);

    await expect(
      runGovernedExternalResearch(confirmedRequest, {
        resolveProvider: () => ({ provider, model: "external", live: true }),
        ledger: durableTestLedger(),
        alertAdapter: successfulAlertAdapter,
      }),
    ).rejects.toMatchObject({ code: "usage-limit-reached", httpStatus: 429 });
    expect(call).not.toHaveBeenCalled();
  });

  it("enforces the hard per-request character limit before provider resolution can spend", async () => {
    vi.stubEnv("EXTERNAL_AI_MAX_QUERY_CHARACTERS", "10");
    const call = vi.fn();
    const provider = fakeOpenAIProvider(call);

    await expect(
      runGovernedExternalResearch(confirmedRequest, {
        resolveProvider: () => ({ provider, model: "external", live: true }),
        ledger: durableTestLedger(),
        alertAdapter: successfulAlertAdapter,
      }),
    ).rejects.toMatchObject({ code: "request-too-large", httpStatus: 413 });
    expect(call).not.toHaveBeenCalled();
  });

  it("enforces the hard monthly request limit across UTC days", async () => {
    vi.stubEnv("EXTERNAL_AI_DAILY_REQUEST_LIMIT", "1");
    vi.stubEnv("EXTERNAL_AI_MONTHLY_REQUEST_LIMIT", "1");
    const call = vi.fn();
    const provider = fakeOpenAIProvider(call);
    const ledger = durableTestLedger();

    await runGovernedExternalResearch(confirmedRequest, {
      resolveProvider: () => ({ provider, model: "external", live: true }),
      ledger,
      alertAdapter: successfulAlertAdapter,
      now: () => new Date("2026-08-15T12:00:00.000Z"),
    });
    await expect(
      runGovernedExternalResearch(confirmedRequest, {
        resolveProvider: () => ({ provider, model: "external", live: true }),
        ledger,
        alertAdapter: successfulAlertAdapter,
        now: () => new Date("2026-08-16T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "usage-limit-reached", httpStatus: 429 });
    expect(call).toHaveBeenCalledOnce();
  });

  it("meters the isolated OpenAI path and exposes bounded usage metadata", async () => {
    const call = vi.fn();
    const provider = fakeOpenAIProvider(call);

    const result = await runGovernedExternalResearch(confirmedRequest, {
      resolveProvider: () => ({ provider, model: "external", live: true }),
      ledger: durableTestLedger(),
      alertAdapter: successfulAlertAdapter,
      now: () => new Date("2026-08-15T12:00:00.000Z"),
    });

    expect(call).toHaveBeenCalledOnce();
    expect(result.usage).toMatchObject({
      scope: "external-research",
      mode: "openai-metered",
      status: "completed",
      provider: "openai",
      request: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      daily: { period: "2026-08-15", requests: 1, tokens: 15 },
      monthly: { period: "2026-08", requests: 1, tokens: 15 },
    });
  });

  it("keeps a successful provider call durably chargeable when settlement is unavailable", async () => {
    const providerCall = vi.fn();
    const provider = fakeOpenAIProvider(providerCall);
    const memory = new DemoMemoryExternalUsageLedger();
    const settle = vi.fn().mockRejectedValue(new Error("temporary settlement failure"));
    let reservedCeiling = 0;
    const ledger: ExternalUsageLedger = {
      mode: "postgres",
      durable: true,
      reserve: async (input) => {
        reservedCeiling = input.reservedTokens;
        return memory.reserve(input);
      },
      settle,
      snapshot: (now, limits) => memory.snapshot(now, limits),
      claimAlert: (key) => memory.claimAlert(key),
      completeAlert: (key) => memory.completeAlert(key),
      releaseAlert: (key) => memory.releaseAlert(key),
    };
    const network = vi.spyOn(globalThis, "fetch");

    await expect(
      runGovernedExternalResearch(confirmedRequest, {
        resolveProvider: () => ({ provider, model: "external", live: true }),
        ledger,
        alertAdapter: successfulAlertAdapter,
        now: () => new Date("2026-08-15T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "usage-store-unavailable", httpStatus: 503 });

    expect(providerCall).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledOnce();
    expect(network).not.toHaveBeenCalled();
    expect(reservedCeiling).toBeGreaterThan(0);

    const limits = externalUsageLimitsFromEnvironment();
    const afterExpiry = await memory.snapshot(
      new Date("2026-08-15T12:16:00.000Z"),
      limits,
    );
    const repeatedSnapshot = await memory.snapshot(
      new Date("2026-08-15T12:17:00.000Z"),
      limits,
    );

    expect(afterExpiry.daily).toMatchObject({ requests: 1, tokens: reservedCeiling });
    expect(afterExpiry.monthly).toMatchObject({ requests: 1, tokens: reservedCeiling });
    expect(repeatedSnapshot.daily).toMatchObject({ requests: 1, tokens: reservedCeiling });
    expect(repeatedSnapshot.monthly).toMatchObject({ requests: 1, tokens: reservedCeiling });
  });

  it("deduplicates high-usage alerts for the same UTC period", async () => {
    vi.stubEnv("EXTERNAL_AI_DAILY_REQUEST_LIMIT", "2");
    vi.stubEnv("EXTERNAL_AI_MONTHLY_REQUEST_LIMIT", "100");
    vi.stubEnv("EXTERNAL_AI_ALERT_THRESHOLD_PERCENT", "50");
    const provider = fakeOpenAIProvider();
    const send = vi.fn().mockResolvedValue(undefined);
    const alertAdapter: UsageAlertAdapter = { name: "resend", sendHighUsageAlert: send };
    const ledger = durableTestLedger();
    const dependencies = {
      resolveProvider: () => ({ provider, model: "external", live: true }),
      ledger,
      alertAdapter,
      now: () => new Date("2026-08-15T12:00:00.000Z"),
    };

    const first = await runGovernedExternalResearch(confirmedRequest, dependencies);
    const second = await runGovernedExternalResearch(confirmedRequest, dependencies);

    expect(first.usage.alert.status).toBe("sent");
    expect(second.usage.alert.status).toBe("deduplicated");
    expect(send).toHaveBeenCalledOnce();
  });

  it("blocks a concurrent metered call while the durable alert claim is pending", async () => {
    vi.stubEnv("EXTERNAL_AI_DAILY_REQUEST_LIMIT", "2");
    vi.stubEnv("EXTERNAL_AI_MONTHLY_REQUEST_LIMIT", "100");
    vi.stubEnv("EXTERNAL_AI_ALERT_THRESHOLD_PERCENT", "50");
    const providerCall = vi.fn();
    const provider = fakeOpenAIProvider(providerCall);
    let deliver: (() => void) | undefined;
    const send = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => {
        deliver = resolve;
      }),
    );
    const alertAdapter: UsageAlertAdapter = { name: "resend", sendHighUsageAlert: send };
    const ledger = durableTestLedger();
    const dependencies = {
      resolveProvider: () => ({ provider, model: "external", live: true }),
      ledger,
      alertAdapter,
      now: () => new Date("2026-08-15T12:00:00.000Z"),
    };

    const first = runGovernedExternalResearch(confirmedRequest, dependencies);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    await expect(
      runGovernedExternalResearch(confirmedRequest, dependencies),
    ).rejects.toMatchObject({ code: "usage-alert-unavailable", httpStatus: 503 });
    expect(providerCall).not.toHaveBeenCalled();

    deliver?.();
    await first;
    expect(providerCall).toHaveBeenCalledOnce();
  });

  it("implements PostgreSQL limit serialization and durable alert claims", () => {
    const source = readFileSync("src/lib/ai/postgres-usage-ledger.ts", "utf8");
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("external_ai_usage_alert_claims");
    expect(source).toMatch(/ON CONFLICT \(alert_key\) DO NOTHING/);
    expect(source).toContain("external_ai_usage_reservations");
    expect(source).toContain("external_ai_usage_records");
  });

  it("atomically promotes expired PostgreSQL reservations at their reserved ceiling", () => {
    const source = readFileSync("src/lib/ai/postgres-usage-ledger.ts", "utf8");
    const cleanupStart = source.indexOf("private async cleanupExpired");
    const cleanupEnd = source.indexOf("private async windowSnapshot", cleanupStart);
    const cleanup = source.slice(cleanupStart, cleanupEnd);

    expect(cleanup).toMatch(/WITH expired AS \([\s\S]*DELETE FROM external_ai_usage_reservations/);
    expect(cleanup).toMatch(/RETURNING id, actor_id, provider, model, reserved_tokens, created_at/);
    expect(cleanup).toMatch(/INSERT INTO external_ai_usage_records/);
    expect(cleanup).toMatch(/0, 0, reserved_tokens,[\s\S]*'provider-error'/);
    expect(cleanup).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
    expect(source.match(/pg_advisory_xact_lock\(hashtext\('hmmsa_external_ai_usage_v1'\)\)/g)).toHaveLength(3);
  });

  it("blocks the metered call if a required high-usage alert fails", async () => {
    vi.stubEnv("EXTERNAL_AI_DAILY_REQUEST_LIMIT", "1");
    vi.stubEnv("EXTERNAL_AI_MONTHLY_REQUEST_LIMIT", "100");
    vi.stubEnv("EXTERNAL_AI_ALERT_THRESHOLD_PERCENT", "100");
    const call = vi.fn();
    const provider = fakeOpenAIProvider(call);
    const alertAdapter: UsageAlertAdapter = {
      name: "resend",
      sendHighUsageAlert: vi.fn().mockRejectedValue(new Error("provider details")),
    };

    await expect(
      runGovernedExternalResearch(confirmedRequest, {
        resolveProvider: () => ({ provider, model: "external", live: true }),
        ledger: durableTestLedger(),
        alertAdapter,
      }),
    ).rejects.toMatchObject({
      code: "usage-alert-unavailable",
      httpStatus: 503,
      message: expect.not.stringContaining("provider details"),
    });
    expect(call).not.toHaveBeenCalled();
  });
});

describe("provider and alert boundary details", () => {
  it("the OpenAI adapter refuses an unconfirmed request before fetch", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    const provider = new OpenAIResearchProvider("secret-key", "external-model", 100);

    await expect(
      provider.research({
        ...confirmedRequest,
        curatorConfirmed: false,
      } as unknown as ResearchRequest),
    ).rejects.toThrow(/explicit curator confirmation/i);
    expect(request).not.toHaveBeenCalled();
  });

  it("the OpenAI adapter refuses confirmed true without exact per-request cost acknowledgement", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    const provider = new OpenAIResearchProvider("secret-key", "external-model", 100);

    await expect(
      provider.research({
        ...confirmedRequest,
        costAcknowledgement: undefined,
      } as unknown as ResearchRequest),
    ).rejects.toThrow(/per-request cost acknowledgement/i);
    expect(request).not.toHaveBeenCalled();
  });

  it("the confirmed OpenAI adapter calls only the isolated Responses endpoint with an output cap", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: "Reviewable source leads.",
          usage: { input_tokens: 40, output_tokens: 12, total_tokens: 52 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const provider = new OpenAIResearchProvider("secret-key", "external-model", 175);

    const result = await provider.research(confirmedRequest);

    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
    const init = request.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "external-model",
      store: false,
      max_output_tokens: 175,
      max_tool_calls: 1,
    });
    expect(body.tools).toEqual([
      expect.objectContaining({ type: "web_search" }),
    ]);
    expect(body.input).toContain(confirmedRequest.query);
    expect(result.providerUsage).toEqual({
      inputTokens: 40,
      outputTokens: 12,
      totalTokens: 52,
    });
  });

  it("keeps only bounded HTTPS sources from the curator-approved domain set", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: "Reviewable source leads.",
          output: [
            {
              type: "web_search_call",
              action: {
                sources: [
                  { title: "Museum profile", url: "https://www.hmmsa.org/survivors-experts" },
                  { title: "Subdomain record", url: "https://collections.ushmm.org/item/1" },
                  { title: "Executable", url: "javascript:alert(1)" },
                  { title: "Wrong host", url: "https://attacker.example/redirect" },
                  { title: "Insecure", url: "http://hmmsa.org/record" },
                  { title: "Credentials", url: "https://user:pass@hmmsa.org/private" },
                ],
              },
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const provider = new OpenAIResearchProvider("secret-key", "external-model", 100);

    const result = await provider.research(confirmedRequest);

    expect(result.sources).toEqual([
      { title: "Museum profile", url: "https://www.hmmsa.org/survivors-experts" },
      { title: "Subdomain record", url: "https://collections.ushmm.org/item/1" },
    ]);
  });

  it("never includes the Resend credential or response body in an alert error", async () => {
    const secret = "re_secret_that_must_not_leak";
    const request = vi.fn().mockResolvedValue(
      new Response(`provider echoed ${secret}`, { status: 500 }),
    );
    const adapter = new ResendUsageAlertAdapter(
      secret,
      "Archive Alerts <alerts@example.org>",
      "support@clicksmith.net",
      request,
    );

    let message = "";
    try {
      await adapter.sendHighUsageAlert({
        periods: ["daily"],
        accountingMode: "demo-memory-non-durable",
        thresholdPercent: 80,
        snapshot: {
          daily: { period: "2026-08-15", requests: 20, requestLimit: 25, tokens: 1, tokenLimit: 100 },
          monthly: { period: "2026-08", requests: 20, requestLimit: 250, tokens: 1, tokenLimit: 1000 },
        },
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/could not be delivered/i);
    expect(message).not.toContain(secret);
    expect(message).not.toContain("provider echoed");
  });

  it("exposes sanitized governance errors", () => {
    const error = new ExternalResearchGovernanceError(
      "usage-limit-reached",
      429,
      "The external research usage limit has been reached.",
    );
    expect(JSON.stringify(error)).not.toMatch(/API|secret|key/i);
  });
});
