import { beforeEach, describe, expect, it } from "vitest";
import { POST as postPublishedChat } from "@/app/api/chat/route";
import {
  checkPublicChatRateLimit,
  resetPublicChatRateLimitForTests,
} from "@/lib/chat/rate-limit";
import { trustedProxyClientAddress } from "@/lib/http/request";

beforeEach(() => resetPublicChatRateLimitForTests());

describe("shared HTTP request controls", () => {
  it("accepts IP literals only and follows the Cloudways proxy header order", () => {
    expect(trustedProxyClientAddress(new Request("https://archive.example", {
      headers: {
        "X-Real-IP": "192.0.2.10",
        "X-Forwarded-For": "203.0.113.10, 198.51.100.10",
        "CF-Connecting-IP": "198.18.0.10",
      },
    }))).toBe("192.0.2.10");
    expect(trustedProxyClientAddress(new Request("https://archive.example", {
      headers: {
        "X-Real-IP": "caller-controlled-text",
        "X-Forwarded-For": "203.0.113.11, 198.51.100.11",
        "CF-Connecting-IP": "198.18.0.11",
      },
    }))).toBe("198.51.100.11");
    expect(trustedProxyClientAddress(new Request("https://archive.example", {
      headers: {
        "X-Forwarded-For": "not-an-ip",
        "CF-Connecting-IP": "198.18.0.12",
      },
    }))).toBe("198.18.0.12");
    expect(trustedProxyClientAddress(new Request("https://archive.example", {
      headers: { "X-Real-IP": "not-an-ip" },
    }))).toBe("unknown");
  });

  it("rejects declared and streamed public-chat bodies over 4 KiB", async () => {
    const declared = await postPublishedChat(new Request("https://archive.example/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "4097",
        "X-Real-IP": "198.51.100.50",
      },
      body: "{}",
    }));
    const streamed = await postPublishedChat(new Request("https://archive.example/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Real-IP": "198.51.100.51",
      },
      body: "x".repeat(4_097),
    }));

    expect(declared.status).toBe(413);
    expect(streamed.status).toBe(413);
  });

  it("does not let a changing first XFF hop evade the per-client chat limit", () => {
    let result;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      result = checkPublicChatRateLimit(
        new Request("https://archive.example/api/chat", {
          headers: {
            "X-Forwarded-For": `203.0.113.${attempt + 1}, 198.51.100.60`,
          },
        }),
        1_000,
      );
    }
    expect(result?.allowed).toBe(false);
    expect(result?.remaining).toBe(0);
  });

  it("enforces a process-wide chat ceiling across distinct client buckets", () => {
    let result;
    for (let attempt = 0; attempt < 181; attempt += 1) {
      result = checkPublicChatRateLimit(
        new Request("https://archive.example/api/chat", {
          headers: { "X-Real-IP": `198.18.0.${attempt + 1}` },
        }),
        1_000,
      );
    }
    expect(result?.allowed).toBe(false);
    expect(result?.remaining).toBe(0);
  });
});
