import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as routeModule from "@/app/api/email/open/[token]/route";
import { createOpenPixelHandlers } from "@/app/api/email/open/[token]/route";
import { createTrackingToken, hashTrackingToken, type EmailLogRecorder } from "@/lib/email/log";

// The smallest valid transparent 1x1 GIF the route serves.
const GIF_BYTES = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64").byteLength;

function harness(options: { fail?: boolean } = {}) {
  const opened: string[] = [];
  const tasks: Promise<void>[] = [];
  const recorder: EmailLogRecorder = {
    async record() {},
    async markOpened(hash) {
      if (options.fail) throw new Error("database down: password=hunter2");
      opened.push(hash);
    },
  };
  const handlers = createOpenPixelHandlers({
    recorder,
    schedule: (task) => {
      tasks.push(task());
    },
  });
  return { opened, tasks, ...handlers };
}

function request(token: string, init: RequestInit = {}) {
  return new Request(`https://archive.example/api/email/open/${token}`, init);
}

function context(token: string) {
  return { params: Promise.resolve({ token }) };
}

async function describeResponse(response: Response) {
  const body = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    headers: [...response.headers.entries()].sort(),
    length: body.byteLength,
    body: Buffer.from(body).toString("base64"),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/email/open/[token]", () => {
  it("answers valid, unknown and malformed tokens with the same GIF, status and headers", async () => {
    const { GET, opened, tasks } = harness();
    const valid = createTrackingToken();
    const shapes = [valid, createTrackingToken(), "abc", "x".repeat(43), "../etc", "", "%00"];
    const responses = await Promise.all(
      shapes.map(async (token) => describeResponse(await GET(request(token), context(token)))),
    );
    await Promise.all(tasks);

    for (const described of responses) {
      expect(described).toEqual(responses[0]);
    }
    expect(responses[0].status).toBe(200);
    expect(responses[0].length).toBe(GIF_BYTES);
    expect(responses[0].body.startsWith("R0lGODlh")).toBe(true);

    const headers = Object.fromEntries(responses[0].headers);
    expect(headers["content-type"]).toBe("image/gif");
    expect(headers["content-length"]).toBe(String(GIF_BYTES));
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["pragma"]).toBe("no-cache");
    expect(headers["x-robots-tag"]).toContain("noindex");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["set-cookie"]).toBeUndefined();

    // Only the two well-formed tokens were handed to the recorder, hashed.
    expect(opened).toEqual([hashTrackingToken(valid), hashTrackingToken(shapes[1])]);
    expect(opened.join(" ")).not.toContain(valid);
  });

  it("serves the GIF to an unauthenticated cross-site request", async () => {
    const { GET, opened, tasks } = harness();
    const token = createTrackingToken();
    const response = await GET(
      request(token, {
        headers: {
          Origin: "https://evil.example",
          Referer: "https://evil.example/page",
          "User-Agent": "Mozilla/5.0 (probe)",
          "X-Forwarded-For": "203.0.113.9",
        },
      }),
      context(token),
    );
    await Promise.all(tasks);
    expect(response.status).toBe(200);
    expect(opened).toEqual([hashTrackingToken(token)]);
    // Nothing from the request reached the recorder: only the hash did.
    expect(opened[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("still answers with the GIF when the database is down", async () => {
    const { GET, tasks } = harness({ fail: true });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const token = createTrackingToken();
    const response = await GET(request(token), context(token));
    await expect(Promise.all(tasks)).resolves.toBeDefined();
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(GIF_BYTES);
    expect(error).toHaveBeenCalledWith("Email open signal could not be recorded.");
    expect(JSON.stringify(error.mock.calls)).not.toContain("hunter2");
  });

  it("does not block the response on the recording", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handlers = createOpenPixelHandlers({
      recorder: {
        async record() {},
        async markOpened() {
          await gate;
        },
      },
      schedule: (task) => {
        void task();
      },
    });
    const token = createTrackingToken();
    const response = await handlers.GET(request(token), context(token));
    expect(response.status).toBe(200);
    release();
  });
});

describe("HEAD /api/email/open/[token]", () => {
  it("returns the same headers with no body and records nothing", async () => {
    const { HEAD, opened, tasks } = harness();
    const token = createTrackingToken();
    const response = await HEAD(request(token, { method: "HEAD" }), context(token));
    await Promise.all(tasks);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/gif");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.body).toBeNull();
    expect(opened).toEqual([]);
  });
});

describe("route module wiring", () => {
  it("is dynamic and exports GET and HEAD built from the default dependencies", () => {
    expect(routeModule.dynamic).toBe("force-dynamic");
    expect(typeof routeModule.GET).toBe("function");
    expect(typeof routeModule.HEAD).toBe("function");
  });

  it("has no middleware or proxy that could intercept the public pixel", () => {
    expect(existsSync("src/middleware.ts")).toBe(false);
    expect(existsSync("src/proxy.ts")).toBe(false);
    expect(existsSync("middleware.ts")).toBe(false);
    expect(existsSync("proxy.ts")).toBe(false);
  });
});
