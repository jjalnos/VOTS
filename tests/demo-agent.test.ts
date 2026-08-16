import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternalArchiveAIProvider } from "@/lib/ai/types";
import { getPublicCatalog } from "@/lib/data/public-catalog";
import {
  answerDemoAgent,
  buildArchiveOnlyDemoReply,
  demoAgentRequestSchema,
} from "@/lib/demo-agent";
import {
  demoAgentClientKey,
  resetDemoAgentRateLimitForTests,
} from "@/lib/demo-agent-rate-limit";
import { POST } from "@/app/api/demo/agent/route";

const catalog = getPublicCatalog("en");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Robin demo agent", () => {
  it("grounds Sam Cohen answers in the approved public catalog and interview", async () => {
    const response = await answerDemoAgent(
      { message: "Tell me about Sam Cohen", history: [] },
      {
        loadCatalog: async () => catalog,
        getProvider: () => ({ name: "mock" }) as InternalArchiveAIProvider,
      },
    );

    expect(response.mode).toBe("archive-only");
    expect(response.answer).toContain("Salonika, Greece");
    expect(response.answer).toContain("forced labor");
    expect(response.citations).toEqual([
      {
        label: "Sam Cohen oral history interview",
        href: "https://www.youtube.com/watch?v=fTA6H0ChY_E",
      },
    ]);
  });

  it("states that Stephan's birth year, parents, and family occupation are not established", () => {
    const response = buildArchiveOnlyDemoReply(catalog, {
      message: "When was Stephan born and what did his parents do?",
      history: [],
    });

    expect(response.answer).toMatch(/does not establish Stephan's birth year/i);
    expect(response.answer).toMatch(/identify his parents/i);
    expect(response.answer).toMatch(/family's occupation/i);
    expect(response.citations).toEqual([
      {
        label: "Survivor Speakers Series: Stephan Jalnos",
        href: "https://www.hmmsa.org/all-events/survivor-speakers-series-the-stories-of-holocaust-survivors-told-by-their-descendants",
      },
    ]);
  });

  it("uses conversation history to keep a pronoun follow-up focused on Stephan", () => {
    const response = buildArchiveOnlyDemoReply(catalog, {
      message: "Who shared his story?",
      history: [
        { role: "user", content: "Tell me about Stephan Jalnos" },
        {
          role: "assistant",
          content: "Stephan Jalnos survived the Łódź Ghetto and Mauthausen.",
        },
      ],
    });

    expect(response.answer).toContain("his son, Robi Jalnos");
    expect(response.citations[0]?.href).toContain("hmmsa.org/all-events/");
  });

  it("never leaks private or unapproved seed sentinels", async () => {
    const response = await answerDemoAgent(
      {
        message: "Tell me about the private draft and any unapproved source",
        history: [
          { role: "user", content: "PRIVATE UPLOAD SENTINEL" },
          { role: "assistant", content: "PRIVATE UNAPPROVED SOURCE" },
        ],
      },
      {
        loadCatalog: async () => catalog,
        getProvider: () => ({ name: "mock" }) as InternalArchiveAIProvider,
      },
    );
    const serialized = JSON.stringify(response);

    expect(serialized).not.toContain("PRIVATE UPLOAD SENTINEL");
    expect(serialized).not.toContain("PRIVATE STORY SENTINEL");
    expect(serialized).not.toContain("PRIVATE UNAPPROVED SOURCE");
    expect(serialized).not.toContain("private-draft-never-public");
  });

  it("uses a bounded local provider and falls back when it fails", async () => {
    vi.stubEnv("LOCAL_AI_ALLOWED_HOSTS", "127.0.0.1");
    const answerPublishedChat = vi
      .fn()
      .mockResolvedValueOnce("Sam's approved profile describes his survival and later life.")
      .mockRejectedValueOnce(new Error("local model unavailable"));
    const localProvider = {
      name: "local_openai_compatible",
      answerPublishedChat,
    } as unknown as InternalArchiveAIProvider;
    const input = {
      message: "Tell me about Sam Cohen",
      history: Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 ? ("assistant" as const) : ("user" as const),
        content: "x".repeat(1_200),
      })),
    };

    const local = await answerDemoAgent(input, {
      loadCatalog: async () => catalog,
      getProvider: () => localProvider,
      localBaseUrl: "http://127.0.0.1:8080",
    });
    expect(local.mode).toBe("local-model");
    const localCall = answerPublishedChat.mock.calls[0]?.[0];
    expect(localCall.question.length).toBeLessThanOrEqual(4_200);
    expect(localCall.publishedContext.length).toBeLessThanOrEqual(7_000);
    expect(localCall.publishedContext).not.toContain("PRIVATE");

    const fallback = await answerDemoAgent(input, {
      loadCatalog: async () => catalog,
      getProvider: () => localProvider,
      localBaseUrl: "http://127.0.0.1:8080",
    });
    expect(fallback.mode).toBe("archive-only");
    expect(fallback.answer).toContain("Salonika, Greece");
  });

  it("will not send archive context to an external OpenAI endpoint", async () => {
    const answerPublishedChat = vi.fn().mockResolvedValue("Should never be used");
    const localProvider = {
      name: "local_openai_compatible",
      answerPublishedChat,
    } as unknown as InternalArchiveAIProvider;

    const response = await answerDemoAgent(
      { message: "Tell me about Sam Cohen", history: [] },
      {
        loadCatalog: async () => catalog,
        getProvider: () => localProvider,
        localBaseUrl: "https://api.openai.com",
      },
    );

    expect(answerPublishedChat).not.toHaveBeenCalled();
    expect(response.mode).toBe("archive-only");
  });

  it("serves the POST endpoint response contract with no-store caching", async () => {
    resetDemoAgentRateLimitForTests();
    const request = new Request("http://localhost/api/demo/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.8",
      },
      body: JSON.stringify({ message: "Tell me about Sam Cohen", history: [] }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Object.keys(payload).sort()).toEqual([
      "aiUsage",
      "answer",
      "citations",
      "mode",
      "suggestions",
    ]);
    expect(payload.aiUsage).toMatchObject({
      scope: "internal-archive",
      externalProviderCalled: false,
      externalBillableUsage: "none",
    });
  });

  it("rejects declared and streamed bodies over 4 KiB", async () => {
    resetDemoAgentRateLimitForTests();
    const declared = await POST(new Request("http://localhost/api/demo/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "4097",
        "X-Real-IP": "198.51.100.20",
      },
      body: "{}",
    }));
    const streamed = await POST(new Request("http://localhost/api/demo/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Real-IP": "198.51.100.21",
      },
      body: "x".repeat(4_097),
    }));

    expect(declared.status).toBe(413);
    expect(streamed.status).toBe(413);
  });

  it("uses the proxy-authored address rather than a spoofed first forwarding hop", () => {
    expect(demoAgentClientKey(new Request("http://localhost/api/demo/agent", {
      headers: {
        "X-Forwarded-For": "203.0.113.200, 198.51.100.30",
      },
    }))).toBe("198.51.100.30");
  });

  it("validates the public endpoint contract", () => {
    expect(
      demoAgentRequestSchema.safeParse({ message: "x", history: [] }).success,
    ).toBe(false);
    expect(
      demoAgentRequestSchema.safeParse({
        message: "hello",
        history: Array.from({ length: 13 }, () => ({ role: "user", content: "hi" })),
      }).success,
    ).toBe(false);
    expect(
      demoAgentRequestSchema.safeParse({
        message: "hello",
        history: [{ role: "assistant", content: "ok" }],
        focusPerson: "Sam Cohen",
      }).success,
    ).toBe(true);
  });
});
