import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, handleDemoResearchPost } from "@/app/api/demo/research/route";
import {
  demoResearchClientKey,
  resetDemoResearchRateLimitForTests,
} from "@/lib/research/demo-research-rate-limit";
import {
  fetchSafePublicPage,
  isPublicResearchAddress,
  parseAllowedResearchUrl,
  ResearchFetchError,
  runDemoWebResearch,
  stripHtmlToText,
  type WebResearchDependencies,
} from "@/lib/research/web-research";

const publicResolver: NonNullable<WebResearchDependencies["resolveHost"]> = async () => [
  { address: "93.184.216.34", family: 4 },
];

const samPage = `<!doctype html>
  <html><head><title>Survivors &amp; Experts — HMMSA</title></head><body>
  <h2>Sam Cohen</h2>
  <p>Sam grew up in a small, modest house in Salonika, Greece.</p>
  <p>Sam and his family were forced to move into the ghetto by Germans after Passover in 1943.</p>
  <p>Sam and Jacques later escaped during their daily work laying down railroad tracks and joined the resistance.</p>
  <p>Sam moved to San Antonio, Texas from Greece in 1951 where the Jewish Federation helped him get a job as a bookkeeper.</p>
  </body></html>`;

const stephanPage = `<!doctype html>
  <html><head><title>Survivor Speakers Series — HMMSA</title></head><body>
  <h2>STEPHAN JALNOS</h2>
  <p>From the Lodz Ghetto in Poland, joining the resistance fighters, to Mathausen and more, hear Stephan's story of survivor shared by his son, Robi Jalnos.</p>
  </body></html>`;

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...init.headers },
  });
}

function fakeFetch(response: Response | (() => Response)): typeof fetch {
  return vi.fn(async () =>
    typeof response === "function" ? response() : response,
  ) as unknown as typeof fetch;
}

describe("demo web research safety", () => {
  beforeEach(() => resetDemoResearchRateLimitForTests());

  it("permits only exact allowlisted HTTPS hosts without credentials or custom ports", () => {
    expect(parseAllowedResearchUrl("https://www.hmmsa.org/survivors-experts").hostname).toBe(
      "www.hmmsa.org",
    );
    expect(() => parseAllowedResearchUrl("http://www.hmmsa.org/")).toThrow(
      ResearchFetchError,
    );
    expect(() => parseAllowedResearchUrl("https://hmmsa.org.evil.test/")).toThrow(
      ResearchFetchError,
    );
    expect(() => parseAllowedResearchUrl("https://user@hmmsa.org/")).toThrow(
      ResearchFetchError,
    );
    expect(() => parseAllowedResearchUrl("https://www.hmmsa.org:8443/")).toThrow(
      ResearchFetchError,
    );
    expect(() => parseAllowedResearchUrl("https://127.0.0.1/")).toThrow(
      ResearchFetchError,
    );
  });

  it("rejects private, loopback, link-local, reserved, and mapped addresses", () => {
    for (const address of [
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.5",
      "192.168.1.1",
      "203.0.113.8",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
    ]) {
      expect(isPublicResearchAddress(address), address).toBe(false);
    }
    expect(isPublicResearchAddress("93.184.216.34")).toBe(true);
    expect(isPublicResearchAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("validates DNS answers before fetching", async () => {
    const fetchImpl = fakeFetch(htmlResponse("<title>Never fetched</title>"));
    await expect(
      fetchSafePublicPage("https://www.hmmsa.org/survivors-experts", {
        fetchImpl,
        resolveHost: async () => [{ address: "127.0.0.1", family: 4 }],
      }),
    ).rejects.toMatchObject({ code: "blocked_address" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("revalidates redirects and will not follow one off the allowlist", async () => {
    const fetchImpl = fakeFetch(
      new Response(null, {
        status: 302,
        headers: { Location: "https://attacker.example/private" },
      }),
    );
    await expect(
      fetchSafePublicPage("https://www.hmmsa.org/survivors-experts", {
        fetchImpl,
        resolveHost: publicResolver,
      }),
    ).rejects.toMatchObject({ code: "blocked_url" });
  });

  it("bounds content type and response size", async () => {
    await expect(
      fetchSafePublicPage("https://www.hmmsa.org/file", {
        fetchImpl: fakeFetch(
          new Response("binary", { headers: { "Content-Type": "application/pdf" } }),
        ),
        resolveHost: publicResolver,
      }),
    ).rejects.toMatchObject({ code: "content_type" });

    await expect(
      fetchSafePublicPage("https://www.hmmsa.org/huge", {
        fetchImpl: fakeFetch(htmlResponse("x".repeat(201))),
        resolveHost: publicResolver,
        maxResponseBytes: 200,
      }),
    ).rejects.toMatchObject({ code: "content_too_large" });
  });

  it("removes active and hidden markup before evidence matching", () => {
    const text = stripHtmlToText(`
      <h1>Visible &amp; safe</h1>
      <script>Sam grew up in a forged place</script>
      <style>.secret { content: "hostile" }</style>
      <iframe>hidden evidence</iframe>
      <p>Curator text</p>
    `);
    expect(text).toContain("Visible & safe");
    expect(text).toContain("Curator text");
    expect(text).not.toContain("forged");
    expect(text).not.toContain("hostile");
    expect(text).not.toContain("hidden evidence");
    expect(stripHtmlToText("<p>Kept</p><script>unclosed hostile evidence")).toBe("Kept");
  });
});

describe("deterministic research suggestions", () => {
  it("returns separate, source-linked Sam Cohen claims without using a model", async () => {
    const result = await runDemoWebResearch(
      { survivorName: "Sam Cohen", sourceId: "sam-hmmsa-profile" },
      {
        fetchImpl: fakeFetch(htmlResponse(samPage)),
        resolveHost: publicResolver,
      },
    );

    expect(result.source.retrieval).toBe("fetched");
    expect(result.source.url).toBe("https://www.hmmsa.org/survivors-experts");
    expect(result.claims.map((claim) => claim.field)).toEqual([
      "place_grew_up",
      "wartime_displacement",
      "escape",
      "resistance",
      "arrival_san_antonio",
      "occupation_after_arrival",
    ]);
    expect(result.claims.every((claim) => claim.status === "suggested")).toBe(true);
    expect(result.claims.every((claim) => claim.sourceUrl === result.source.url)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/born|parent/i);
  });

  it("returns only source-supported Stephan claims and an explicit knowledge gap", async () => {
    const result = await runDemoWebResearch(
      { survivorName: "Stephan Jalnos", sourceId: "stephan-hmmsa-event" },
      {
        fetchImpl: fakeFetch(htmlResponse(stephanPage)),
        resolveHost: publicResolver,
      },
    );

    expect(result.claims).toHaveLength(4);
    expect(result.claims.map((claim) => claim.field)).toEqual([
      "wartime_place",
      "resistance",
      "camp",
      "story_presenter",
    ]);
    expect(result.limitations.join(" ")).toMatch(/birth year, parents, or prewar family occupation/i);
    expect(result.claims.map((claim) => claim.value).join(" ")).not.toMatch(
      /born|mother|family occupation/i,
    );
    expect(result.claims.map((claim) => claim.field)).not.toContain("parents");
  });

  it("retains a blocked YouTube source as metadata only and invents no claims", async () => {
    const result = await runDemoWebResearch(
      { survivorName: "Sam Cohen", sourceId: "sam-youtube-testimony" },
      {
        fetchImpl: vi.fn(async () => {
          throw new Error("blocked upstream");
        }) as unknown as typeof fetch,
        resolveHost: publicResolver,
      },
    );

    expect(result.source).toMatchObject({
      title: "Sam Cohen oral history interview",
      url: "https://www.youtube.com/watch?v=fTA6H0ChY_E",
      retrieval: "metadata-only",
    });
    expect(result.claims).toEqual([]);
    expect(result.evidenceNote).toMatch(/no biographical claim was extracted/i);
  });

  it("does not treat hostile script contents as Sam Cohen evidence", async () => {
    const result = await runDemoWebResearch(
      {
        survivorName: "Sam Cohen",
        sourceUrl: "https://www.hmmsa.org/survivors-experts?review=1",
      },
      {
        fetchImpl: fakeFetch(
          htmlResponse(
            `<title>Page</title><script>${samPage}</script><p>No matching biography in the visible page.</p>`,
          ),
        ),
        resolveHost: publicResolver,
      },
    );
    expect(result.claims).toEqual([]);
  });
});

describe("demo research API contract", () => {
  beforeEach(() => resetDemoResearchRateLimitForTests());

  it("lists the bounded no-credit source registry", async () => {
    const response = await GET();
    const payload = await response.json();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.mode).toBe("deterministic-no-credits");
    expect(payload.survivors).toEqual(["Sam Cohen", "Stephan Jalnos"]);
    expect(payload.sources).toHaveLength(4);
  });

  it("requires a same-origin, curator-confirmed request", async () => {
    const crossSite = await handleDemoResearchPost(
      new Request("https://archive.example/api/demo/research", {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
        body: JSON.stringify({
          survivorName: "Sam Cohen",
          sourceId: "sam-hmmsa-profile",
          confirmed: true,
        }),
      }),
    );
    expect(crossSite.status).toBe(403);

    const unconfirmed = await handleDemoResearchPost(
      new Request("https://archive.example/api/demo/research", {
        method: "POST",
        headers: { Origin: "https://archive.example" },
        body: JSON.stringify({
          survivorName: "Sam Cohen",
          sourceId: "sam-hmmsa-profile",
        }),
      }),
    );
    expect(unconfirmed.status).toBe(400);
  });

  it("serves a bounded successful POST response", async () => {
    const response = await handleDemoResearchPost(
      new Request("https://archive.example/api/demo/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://archive.example",
          "X-Forwarded-For": "198.20.1.8",
        },
        body: JSON.stringify({
          survivorName: "Stephan Jalnos",
          sourceId: "stephan-hmmsa-event",
          confirmed: true,
        }),
      }),
      {
        fetchImpl: fakeFetch(htmlResponse(stephanPage)),
        resolveHost: publicResolver,
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.status).toBe("suggested");
    expect(payload.requiresCuratorApproval).toBe(true);
    expect(payload.claims).toHaveLength(4);
  });

  it("rejects declared and streamed bodies over 4 KiB", async () => {
    const headers = {
      Origin: "https://archive.example",
      "Content-Type": "application/json",
    };
    const declared = await handleDemoResearchPost(
      new Request("https://archive.example/api/demo/research", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": "4097",
          "X-Real-IP": "198.51.100.40",
        },
        body: "{}",
      }),
    );
    const streamed = await handleDemoResearchPost(
      new Request("https://archive.example/api/demo/research", {
        method: "POST",
        headers: {
          ...headers,
          "X-Real-IP": "198.51.100.41",
        },
        body: "x".repeat(4_097),
      }),
    );

    expect(declared.status).toBe(413);
    expect(streamed.status).toBe(413);
  });

  it("uses the validated final forwarding hop for the client bucket", () => {
    expect(demoResearchClientKey(new Request("https://archive.example", {
      headers: {
        "X-Forwarded-For": "203.0.113.201, 198.51.100.42",
      },
    }))).toBe("198.51.100.42");
  });
});
