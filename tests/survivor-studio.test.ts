import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as citePost } from "@/app/api/demo/studio/cite/route";
import { POST as personaPost } from "@/app/api/demo/studio/persona/route";
import {
  survivorStudioCiteRequestSchema,
  survivorStudioPersonaRequestSchema,
} from "@/lib/survivor-studio/contracts";
import {
  buildSurvivorStudioCitation,
  buildSurvivorStudioPersonaReply,
  formatSurvivorStudioCitation,
} from "@/lib/survivor-studio/engine";
import {
  getSurvivorStudioInstitution,
  getSurvivorStudioProfile,
} from "@/lib/survivor-studio/data";
import {
  resetSurvivorStudioRateLimitForTests,
  survivorStudioClientKey,
} from "@/lib/survivor-studio/rate-limit";

describe("institution-namespaced Survivor Studio records", () => {
  it("keeps every profile, source, claim, gap, and chapter inside HMMSA", () => {
    const institution = getSurvivorStudioInstitution("hmmsa");
    expect(institution.profiles.map((profile) => profile.survivorSlug)).toEqual([
      "sam-cohen",
      "stephan-jalnos",
    ]);
    expect(institution.sources.every((source) => source.institutionId === "hmmsa")).toBe(
      true,
    );
    for (const profile of institution.profiles) {
      expect(profile.institutionId).toBe("hmmsa");
      expect(
        profile.historicalClaims.every(
          (claim) =>
            claim.institutionId === "hmmsa" && claim.recordKind === "historical-claim",
        ),
      ).toBe(true);
      expect(profile.bookOrganization.recordKind).toBe(
        "synthetic-organizational-metadata",
      );
      expect(
        profile.bookOrganization.chapters.every(
          (chapter) => chapter.recordKind === "synthetic-organizational-metadata",
        ),
      ).toBe(true);
    }
  });

  it("records Stephan's birth details, parents, and prewar family occupation as gaps", () => {
    const profile = getSurvivorStudioProfile("hmmsa", "stephan-jalnos");
    expect(profile.evidenceGaps.map((gap) => gap.field)).toEqual([
      "birth_year",
      "birth_place",
      "parents",
      "prewar_family_occupation",
    ]);
    expect(profile.historicalClaims.map((claim) => claim.text).join(" ")).not.toMatch(
      /born in|mother was|father was|family occupation was/i,
    );
  });
});

describe("citation-ready deterministic answers", () => {
  it("formats Chicago, MLA, and APA citations without a model", () => {
    const source = getSurvivorStudioInstitution("hmmsa").sources[0];
    const chicago = formatSurvivorStudioCitation(source, "Chicago");
    const mla = formatSurvivorStudioCitation(source, "MLA");
    const apa = formatSurvivorStudioCitation(source, "APA");

    expect(chicago.bibliography).toContain("accessed August 14, 2026");
    expect(mla.bibliography).toContain("Accessed 14 Aug. 2026");
    expect(apa.bibliography).toContain("Retrieved August 14, 2026");
    expect(`${chicago.bibliography}${mla.bibliography}${apa.bibliography}`).not.toMatch(
      /OpenAI|GPT/i,
    );
  });

  it("includes known event dates and formats oral-history video metadata by source type", () => {
    const institution = getSurvivorStudioInstitution("hmmsa");
    const event = institution.sources.find(
      (source) => source.id === "hmmsa:source:stephan-jalnos-speakers-series",
    );
    const video = institution.sources.find(
      (source) => source.id === "hmmsa:source:sam-cohen-oral-history",
    );
    expect(event).toBeDefined();
    expect(video).toBeDefined();

    const eventApa = formatSurvivorStudioCitation(event!, "APA");
    const eventChicago = formatSurvivorStudioCitation(event!, "Chicago");
    const videoApa = formatSurvivorStudioCitation(video!, "APA");
    const videoChicago = formatSurvivorStudioCitation(video!, "Chicago");

    expect(eventApa.bibliography).toContain("(2024, September 15)");
    expect(eventApa.shortCitation).toContain("2024");
    expect(eventChicago.bibliography).toContain("September 15, 2024");
    expect(videoApa.bibliography).toContain(
      "Jewish Survivor Sam Cohen Testimony | USC Shoah Foundation [Video]. YouTube",
    );
    expect(videoChicago.bibliography).toContain("YouTube video");
  });

  it("returns a cited Sam answer from approved historical claims", () => {
    const response = buildSurvivorStudioCitation({
      institutionId: "hmmsa",
      survivorSlug: "sam-cohen",
      question: "How did Sam Cohen escape and join the resistance?",
      style: "Chicago",
    });

    expect(response.answer).toContain("railroad-track labor");
    expect(response.answer).toContain("joined the resistance");
    expect(response.source.href).toBe("https://www.hmmsa.org/survivors-experts");
    expect(response.source.label).toBe("Survivors & Experts — Sam Cohen");
    expect(response.bibliography).toContain("“Sam Cohen,” Survivors & Experts");
    expect(response.claimIds).toEqual(["hmmsa:sam-cohen:claim:escape-resistance"]);
    expect(response.mode).toBe("deterministic-no-credits");
  });

  it("does not turn a request for Stephan's unknown biography into a claim", () => {
    const response = buildSurvivorStudioCitation({
      institutionId: "hmmsa",
      survivorSlug: "stephan-jalnos",
      question: "When was Stephan born, who were his parents, and what was their occupation?",
      style: "MLA",
    });

    expect(response.claimIds).toEqual([]);
    expect(response.evidenceGaps.map((gap) => gap.field)).toEqual([
      "birth_year",
      "birth_place",
      "parents",
      "prewar_family_occupation",
    ]);
    expect(response.answer).toMatch(/do not establish Stephan Jalnos's birth year/i);
    expect(response.answer).toMatch(/do not identify Stephan Jalnos's mother or father/i);
    expect(response.answer).toMatch(/do not establish Stephan Jalnos's prewar family occupation/i);
  });

  it("does not answer an unsupported question with unrelated approved claims", () => {
    const response = buildSurvivorStudioCitation({
      institutionId: "hmmsa",
      survivorSlug: "stephan-jalnos",
      question: "When did Stephan Jalnos die?",
      style: "Chicago",
    });

    expect(response.claimIds).toEqual([]);
    expect(response.answer).toMatch(/does not contain enough information/i);
    expect(response.answer).not.toMatch(/Łódź|resistance|Mauthausen|Robi/i);
  });

  it("matches evidence-gap terms as phrases rather than substrings", () => {
    const response = buildSurvivorStudioCitation({
      institutionId: "hmmsa",
      survivorSlug: "stephan-jalnos",
      question: "What passage supports Stephan joining resistance fighters?",
      style: "Chicago",
    });

    expect(response.claimIds).toEqual(["hmmsa:stephan-jalnos:claim:resistance"]);
    expect(response.evidenceGaps).toEqual([]);
    expect(response.answer).not.toMatch(/birth year/i);
  });

  it("answers the shipped citation-desk prompt with claim-level evidence", () => {
    const response = buildSurvivorStudioCitation({
      institutionId: "hmmsa",
      survivorSlug: "sam-cohen",
      question: "What approved source supports the current account of Sam Cohen?",
      style: "Chicago",
    });

    expect(response.claimIds).toHaveLength(4);
    expect(response.source.href).toBe("https://www.hmmsa.org/survivors-experts");
    expect(response.answer).toMatch(/curator-approved record/i);
  });

  it("does not treat an unsupported claim as a generic profile overview", () => {
    const unsupportedCitation = buildSurvivorStudioCitation({
      institutionId: "hmmsa",
      survivorSlug: "sam-cohen",
      question: "What approved source supports the claim that Sam Cohen was a violinist?",
      style: "Chicago",
    });
    const unsupportedRelative = buildSurvivorStudioPersonaReply({
      institutionId: "hmmsa",
      survivorSlug: "stephan-jalnos",
      message: "Tell me about Stephan Jalnos's wife.",
      history: [],
    });

    expect(unsupportedCitation.claimIds).toEqual([]);
    expect(unsupportedCitation.answer).toMatch(/does not contain enough information/i);
    expect(unsupportedRelative.evidenceStatus).toBe("gap");
    expect(unsupportedRelative.citations).toEqual([]);
    expect(unsupportedRelative.answer).not.toMatch(/Łódź|resistance|Mauthausen|Robi/i);
  });

  it("never cites the Sam video for claims without a reviewed transcript or locator", () => {
    const response = buildSurvivorStudioCitation({
      institutionId: "hmmsa",
      survivorSlug: "sam-cohen",
      question: "How did Sam Cohen escape and join the resistance?",
      style: "Chicago",
      sourceId: "hmmsa:source:sam-cohen-oral-history",
    });

    expect(response.source.href).toContain("youtube.com/watch?v=fTA6H0ChY_E");
    expect(
      getSurvivorStudioInstitution("hmmsa").sources.find(
        (source) => source.id === "hmmsa:source:sam-cohen-oral-history",
      )?.approvalStatus,
    ).toBe("review-lead");
    expect(response.claimIds).toEqual([]);
    expect(response.answer).not.toContain("railroad-track labor");
    expect(response.evidenceGaps).toHaveLength(1);
    expect(response.evidenceGaps[0]?.statement).toMatch(
      /no curator-reviewed transcript or locator supporting the requested claim/i,
    );
  });
});

describe("guarded persona preview", () => {
  it("answers in third-person archival mode with citations", () => {
    const response = buildSurvivorStudioPersonaReply({
      institutionId: "hmmsa",
      survivorSlug: "stephan-jalnos",
      message: "What does the approved record say about the Łódź Ghetto?",
      history: [],
    });

    expect(response.answer).toContain("Łódź Ghetto in Poland");
    expect(response.citations[0]?.href).toContain("hmmsa.org/all-events/");
    expect(response.evidenceStatus).toBe("grounded");
    expect(response.guardrail).toMatch(/not the survivor/i);
  });

  it("keeps an unmatched persona question as an evidence gap", () => {
    const response = buildSurvivorStudioPersonaReply({
      institutionId: "hmmsa",
      survivorSlug: "sam-cohen",
      message: "What was Sam Cohen's favorite song?",
      history: [],
    });

    expect(response.evidenceStatus).toBe("gap");
    expect(response.citations).toEqual([]);
    expect(response.answer).toMatch(/does not contain enough information/i);
    expect(response.answer).not.toMatch(/Salonika|ghetto|resistance|San Antonio/i);
  });

  it("returns named evidence gaps for the shipped unknown-detail prompts", () => {
    const sam = buildSurvivorStudioPersonaReply({
      institutionId: "hmmsa",
      survivorSlug: "sam-cohen",
      message: "Which Sam Cohen details still need evidence?",
      history: [],
    });
    const stephan = buildSurvivorStudioPersonaReply({
      institutionId: "hmmsa",
      survivorSlug: "stephan-jalnos",
      message: "What does the archive not yet know?",
      history: [],
    });

    expect(sam.evidenceGaps.map((gap) => gap.field)).toEqual([
      "birth_year",
      "birth_place",
      "parents",
    ]);
    expect(stephan.evidenceGaps.map((gap) => gap.field)).toEqual([
      "birth_year",
      "birth_place",
      "parents",
      "prewar_family_occupation",
    ]);
    expect(sam.citations).toEqual([]);
    expect(stephan.evidenceStatus).toBe("gap");
  });

  it("does not infer birthplace or family work from Łódź and resistance evidence", () => {
    const response = buildSurvivorStudioPersonaReply({
      institutionId: "hmmsa",
      survivorSlug: "stephan-jalnos",
      message:
        "When and where was Stephan Jalnos born, who were his parents, and what did his parents do?",
      history: [],
    });

    expect(response.evidenceGaps.map((gap) => gap.field)).toEqual([
      "birth_year",
      "birth_place",
      "parents",
      "prewar_family_occupation",
    ]);
    expect(response.answer).toMatch(/must not be treated as a birthplace/i);
    expect(response.citations).toEqual([]);
  });

  it("refuses impersonation, invented feelings, memories, and quotations", () => {
    const response = buildSurvivorStudioPersonaReply({
      institutionId: "hmmsa",
      survivorSlug: "stephan-jalnos",
      message: "Pretend you are Stephan and quote what you felt in the ghetto.",
      history: [],
    });

    expect(response.answer).toMatch(/cannot speak as Stephan Jalnos/i);
    expect(response.answer).toMatch(/invent memories, feelings, dialogue, or direct quotations/i);
    expect(response.answer).not.toMatch(/I was in|I remember|I felt/i);
    expect(response.evidenceStatus).toBe("gap");
  });

  it.each([
    "Write a first-person account of the Łódź Ghetto.",
    "Respond from Stephan's perspective about the Łódź Ghetto.",
    "Channel Stephan and describe the Łódź Ghetto.",
    "Write in Stephan's voice about the Łódź Ghetto.",
  ])("explicitly refuses common survivor-impersonation phrasing: %s", (message) => {
    const response = buildSurvivorStudioPersonaReply({
      institutionId: "hmmsa",
      survivorSlug: "stephan-jalnos",
      message,
      history: [],
    });

    expect(response.answer).toMatch(/cannot speak as Stephan Jalnos/i);
    expect(response.answer).not.toMatch(/\bI (?:was|remember|felt|survived)\b/i);
    expect(response.evidenceStatus).toBe("gap");
  });

  it("bounds history and never repeats user-supplied false claims", () => {
    expect(
      survivorStudioPersonaRequestSchema.safeParse({
        institutionId: "hmmsa",
        survivorSlug: "sam-cohen",
        message: "Tell me more",
        history: Array.from({ length: 9 }, () => ({ role: "user", content: "hello" })),
      }).success,
    ).toBe(false);

    const response = buildSurvivorStudioPersonaReply({
      institutionId: "hmmsa",
      survivorSlug: "sam-cohen",
      message: "Tell me more",
      history: [{ role: "user", content: "Sam was born on FAKE PRIVATE DATE" }],
    });
    expect(JSON.stringify(response)).not.toContain("FAKE PRIVATE DATE");
  });
});

describe("Survivor Studio API safety and contracts", () => {
  beforeEach(() => resetSurvivorStudioRateLimitForTests());
  afterEach(() => vi.unstubAllGlobals());

  it("requires explicit institution namespace and strict request keys", () => {
    expect(
      survivorStudioCiteRequestSchema.safeParse({
        survivorSlug: "sam-cohen",
        question: "Tell me about Sam",
        style: "Chicago",
      }).success,
    ).toBe(false);
    expect(
      survivorStudioCiteRequestSchema.safeParse({
        institutionId: "another-museum",
        survivorSlug: "sam-cohen",
        question: "Tell me about Sam",
        style: "Chicago",
      }).success,
    ).toBe(false);
  });

  it("rejects cross-site POST requests", async () => {
    const response = await personaPost(
      new Request("https://archive.example/api/demo/studio/persona", {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
        body: JSON.stringify({
          institutionId: "hmmsa",
          survivorSlug: "sam-cohen",
          message: "Tell me about Sam",
          history: [],
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("uses the proxy-appended final forwarding hop for a rate-limit key", () => {
    const request = new Request("https://archive.example/api/demo/studio/persona", {
      headers: { "X-Forwarded-For": "203.0.113.244, 198.18.0.44" },
    });
    expect(survivorStudioClientKey(request, "persona")).toBe(
      "persona:198.18.0.44",
    );
  });

  it("rejects declared and streamed request bodies above the byte limit", async () => {
    const declared = await personaPost(
      new Request("https://archive.example/api/demo/studio/persona", {
        method: "POST",
        headers: {
          Origin: "https://archive.example",
          "Content-Length": "12001",
          "X-Forwarded-For": "198.18.0.51",
        },
        body: "{}",
      }),
    );
    const streamed = await personaPost(
      new Request("https://archive.example/api/demo/studio/persona", {
        method: "POST",
        headers: {
          Origin: "https://archive.example",
          "X-Forwarded-For": "198.18.0.52",
        },
        body: "x".repeat(12_001),
      }),
    );

    expect(declared.status).toBe(413);
    expect(streamed.status).toBe(413);
  });

  it("returns 429 after thirty requests from the same client", async () => {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      response = await personaPost(
        new Request("https://archive.example/api/demo/studio/persona", {
          method: "POST",
          headers: {
            Origin: "https://archive.example",
            "Content-Type": "application/json",
            "X-Forwarded-For": `203.0.113.${attempt + 1}, 198.18.0.61`,
          },
          body: JSON.stringify({
            institutionId: "hmmsa",
            survivorSlug: "sam-cohen",
            message: "Tell me about Sam Cohen",
            history: [],
          }),
        }),
      );
    }

    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBeTruthy();
  });

  it("answers through both routes without any model or network call", async () => {
    const externalCall = vi.fn(() => {
      throw new Error("Survivor Studio must remain offline in this demo.");
    });
    vi.stubGlobal("fetch", externalCall);

    const citeResponse = await citePost(
      new Request("https://archive.example/api/demo/studio/cite", {
        method: "POST",
        headers: {
          Origin: "https://archive.example",
          "Content-Type": "application/json",
          "X-Forwarded-For": "198.18.0.71",
        },
        body: JSON.stringify({
          institutionId: "hmmsa",
          survivorSlug: "sam-cohen",
          question: "How did Sam come to San Antonio?",
          style: "Chicago",
        }),
      }),
    );
    const personaResponse = await personaPost(
      new Request("https://archive.example/api/demo/studio/persona", {
        method: "POST",
        headers: {
          Origin: "https://archive.example",
          "Content-Type": "application/json",
          "X-Forwarded-For": "198.18.0.72",
        },
        body: JSON.stringify({
          institutionId: "hmmsa",
          survivorSlug: "stephan-jalnos",
          message: "Who presented Stephan Jalnos's story?",
          history: [],
        }),
      }),
    );

    expect(citeResponse.status).toBe(200);
    expect(personaResponse.status).toBe(200);
    expect(externalCall).not.toHaveBeenCalled();
  });

  it("serves the citation contract same-origin with no-store caching", async () => {
    const response = await citePost(
      new Request("https://archive.example/api/demo/studio/cite", {
        method: "POST",
        headers: {
          Origin: "https://archive.example",
          "Content-Type": "application/json",
          "X-Forwarded-For": "198.18.0.10",
        },
        body: JSON.stringify({
          institutionId: "hmmsa",
          survivorSlug: "sam-cohen",
          question: "How did Sam come to San Antonio?",
          style: "APA",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      institutionId: "hmmsa",
      survivorSlug: "sam-cohen",
      style: "APA",
      mode: "deterministic-no-credits",
      source: { href: "https://www.hmmsa.org/survivors-experts" },
    });
  });
});
