import type {
  SurvivorStudioCiteRequest,
  SurvivorStudioCiteResponse,
  SurvivorStudioPersonaRequest,
  SurvivorStudioPersonaResponse,
} from "@/lib/survivor-studio/contracts";
import {
  getSurvivorStudioInstitution,
  getSurvivorStudioProfile,
  getSurvivorStudioSource,
  type SurvivorStudioCitationStyle,
  type SurvivorStudioClaim,
  type SurvivorStudioEvidenceGap,
  type SurvivorStudioSource,
} from "@/lib/survivor-studio/data";

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesPhrase(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function formatAccessDate(value: string, style: SurvivorStudioCitationStyle): string {
  const [year, rawMonth, rawDay] = value.split("-");
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const mlaMonths = [
    "Jan.",
    "Feb.",
    "Mar.",
    "Apr.",
    "May",
    "June",
    "July",
    "Aug.",
    "Sept.",
    "Oct.",
    "Nov.",
    "Dec.",
  ];
  if (!year || !month || !day) return value;
  if (style === "MLA") return `${day} ${mlaMonths[month - 1]} ${year}`;
  return `${monthNames[month - 1]} ${day}, ${year}`;
}

function formatPublishedDate(
  value: string,
  style: SurvivorStudioCitationStyle,
): string {
  if (style !== "APA") return formatAccessDate(value, style);
  const [year, rawMonth, rawDay] = value.split("-");
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  if (!year || !month || !day) return value;
  return `${year}, ${monthNames[month - 1]} ${day}`;
}

export function formatSurvivorStudioCitation(
  source: SurvivorStudioSource,
  style: SurvivorStudioCitationStyle,
): { bibliography: string; shortCitation: string } {
  const accessDate = formatAccessDate(source.accessedOn, style);
  const publishedDate = source.publishedOn
    ? formatPublishedDate(source.publishedOn, style)
    : undefined;
  const creator = source.creator ?? source.publisher;
  const citedTitle = source.sectionTitle ?? source.title;
  const containerTitle = source.sectionTitle ? source.title : undefined;
  if (source.sourceType === "oral-history-video") {
    if (style === "MLA") {
      return {
        bibliography: `${creator}. “${source.title}.” ${source.publisher}, ${source.url}. Accessed ${accessDate}.`,
        shortCitation: `${creator}, “${source.title}.”`,
      };
    }
    if (style === "APA") {
      return {
        bibliography: `${creator}. (${publishedDate ?? "n.d."}). ${source.title} [Video]. ${source.publisher}. Retrieved ${accessDate}, from ${source.url}`,
        shortCitation: `(${creator}, ${source.publishedOn?.slice(0, 4) ?? "n.d."})`,
      };
    }
    return {
      bibliography: `${creator}, “${source.title},” ${source.publisher} video, accessed ${accessDate}, ${source.url}.`,
      shortCitation: `${creator}, “${source.title}.”`,
    };
  }
  if (style === "MLA") {
    return {
      bibliography: `“${citedTitle}.” ${containerTitle ? `${containerTitle}, ` : ""}${source.publisher}, ${publishedDate ? `${publishedDate}, ` : ""}${source.url}. Accessed ${accessDate}.`,
      shortCitation: `“${citedTitle}.”`,
    };
  }
  if (style === "APA") {
    return {
      bibliography: `${source.publisher}. (${publishedDate ?? "n.d."}). ${citedTitle}.${containerTitle ? ` In ${containerTitle}.` : ""} Retrieved ${accessDate}, from ${source.url}`,
      shortCitation: `(${source.publisher}, ${source.publishedOn?.slice(0, 4) ?? "n.d."})`,
    };
  }
  return {
    bibliography: `${source.publisherShort}, “${citedTitle},” ${containerTitle ? `${containerTitle}, ` : ""}${publishedDate ? `${publishedDate}, ` : ""}accessed ${accessDate}, ${source.url}.`,
    shortCitation: `${source.publisherShort}, “${citedTitle}.”`,
  };
}

function matchingGaps(
  gaps: SurvivorStudioEvidenceGap[],
  question: string,
): SurvivorStudioEvidenceGap[] {
  const intent = normalize(question);
  return gaps.filter((gap) =>
    gap.searchTerms.some((term) => includesPhrase(intent, normalize(term))),
  );
}

function scoreClaim(claim: SurvivorStudioClaim, question: string): number {
  const intent = normalize(question);
  return claim.topics.reduce((score, topic) => {
    const normalizedTopic = normalize(topic);
    if (!includesPhrase(intent, normalizedTopic)) return score;
    return score + (normalizedTopic.includes(" ") ? 3 : 1);
  }, 0);
}

function asksForProfileOverview(question: string): boolean {
  const intent = normalize(question);
  const person = "(?:sam cohen|stephan jalnos)";
  return [
    new RegExp(`^(?:please )?tell me about ${person}(?: right now)?$`),
    new RegExp(`^what is established about ${person}$`),
    new RegExp(`^what does the approved (?:archive|record) say about ${person}$`),
    new RegExp(`^what can i safely say about ${person}(?: right now)?$`),
    new RegExp(`^(?:give me )?(?:an )?(?:overview|summary)(?: of| about)? ${person}$`),
    new RegExp(`^summarize ${person}(?:'s approved record)?$`),
    new RegExp(`^what approved source supports the current account of ${person}$`),
    /^how should i cite the current account$/,
  ].some((pattern) => pattern.test(intent));
}

function asksForGapOverview(question: string): boolean {
  const intent = normalize(question);
  const person = "(?:(?:sam cohen|stephan jalnos) )?";
  return [
    new RegExp(`^which ${person}details still need evidence$`),
    /^what details still need curator verification$/,
    new RegExp(`^which ${person}details remain unsupported$`),
    /^what does the archive not yet know$/,
    /^which details are still unknown$/,
    /^(?:show me |what are the )?evidence gaps$/,
    /^(?:show me |what are the )?open questions$/,
  ].some((pattern) => pattern.test(intent));
}

function relevantClaims(
  claims: SurvivorStudioClaim[],
  question: string,
  hasSpecificGap: boolean,
): SurvivorStudioClaim[] {
  const ranked = claims
    .map((claim, index) => ({ claim, index, score: scoreClaim(claim, question) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ claim }) => claim);
  if (ranked.length) return ranked.slice(0, 4);
  if (hasSpecificGap) return [];
  return asksForProfileOverview(question) ? claims.slice(0, 4) : [];
}

function sourcesForClaims(
  institutionId: SurvivorStudioCiteRequest["institutionId"],
  claims: SurvivorStudioClaim[],
): SurvivorStudioSource[] {
  const seen = new Set<string>();
  return claims
    .flatMap((claim) => claim.sourceIds)
    .map((sourceId) => getSurvivorStudioSource(institutionId, sourceId))
    .filter((source): source is SurvivorStudioSource => {
      if (!source || seen.has(source.id)) return false;
      seen.add(source.id);
      return true;
    });
}

function sourceAllowedForProfile(
  source: SurvivorStudioSource,
  profile: ReturnType<typeof getSurvivorStudioProfile>,
): boolean {
  const profileSourceIds = new Set(
    profile.historicalClaims.flatMap((claim) => claim.sourceIds),
  );
  if (profile.survivorSlug === "sam-cohen") {
    profileSourceIds.add("hmmsa:source:sam-cohen-oral-history");
  }
  return profileSourceIds.has(source.id);
}

function buildGroundedAnswer(
  displayName: string,
  claims: SurvivorStudioClaim[],
  gaps: SurvivorStudioEvidenceGap[],
): string {
  const parts: string[] = [];
  if (claims.length) {
    parts.push(
      `The curator-approved record for ${displayName} establishes the following: ${claims
        .map((claim) => claim.text)
        .join(" ")}`,
    );
  }
  if (gaps.length) {
    parts.push(
      `${gaps.map((gap) => gap.statement).join(" ")} These remain evidence gaps; the assistant will not fill them with guesses.`,
    );
  }
  if (!parts.length) {
    parts.push(
      `The curator-approved record does not contain enough information to answer that question about ${displayName}. The assistant will not infer an answer.`,
    );
  }
  return parts.join("\n\n");
}

function asksForImpersonation(value: string): boolean {
  const normalizedValue = value.replace(/[’]/g, "'");
  return [
    /\b(?:pretend|roleplay|role play|act as|become|speak as|answer as|you are)\b/i,
    /\bfirst[- ]person\b/i,
    /\b(?:from|in) (?:sam(?: cohen)?|stephan(?: jalnos)?|his|her|the survivor)(?:'s)? perspective\b/i,
    /\bchannel (?:sam(?: cohen)?|stephan(?: jalnos)?|him|her|the survivor)\b/i,
    /\b(?:write|respond|answer|speak|narrate|tell (?:it|the story))\b[^.?!]{0,80}\b(?:in|using) (?:sam(?: cohen)?|stephan(?: jalnos)?|his|her|your|the survivor)(?:'s)? voice\b/i,
    /\bspeak for (?:sam(?: cohen)?|stephan(?: jalnos)?|him|her|the survivor)\b/i,
  ].some((pattern) => pattern.test(normalizedValue));
}

function asksForInnerLifeOrQuotation(value: string): boolean {
  return /\b(?:feel|felt|feeling|thoughts?|remember|memory|memories|quote|said|dialogue|exact words|what was it like)\b/i.test(
    value,
  );
}

function contextualIntent(input: SurvivorStudioPersonaRequest): string {
  const current = input.message.trim();
  if (!/^(?:tell me more|what about that|and then|why|how so)[?.! ]*$/i.test(current)) {
    return current;
  }
  const previousUserMessage = [...input.history]
    .reverse()
    .find((entry) => entry.role === "user")?.content;
  return previousUserMessage ? `${previousUserMessage} ${current}` : current;
}

function suggestionsFor(slug: SurvivorStudioPersonaRequest["survivorSlug"]): string[] {
  if (slug === "sam-cohen") {
    return [
      "What does the approved record say about Sam's escape?",
      "How did Sam come to San Antonio?",
      "Which Sam Cohen details still need evidence?",
    ];
  }
  return [
    "What is established about Stephan's wartime story?",
    "Who presented Stephan Jalnos's story?",
    "Which Stephan Jalnos details still need evidence?",
  ];
}

export function buildSurvivorStudioCitation(
  input: SurvivorStudioCiteRequest,
): SurvivorStudioCiteResponse {
  const profile = getSurvivorStudioProfile(input.institutionId, input.survivorSlug);
  const matchedGaps = asksForGapOverview(input.question)
    ? profile.evidenceGaps
    : matchingGaps(profile.evidenceGaps, input.question);
  const claims = relevantClaims(
    profile.historicalClaims,
    input.question,
    matchedGaps.length > 0,
  );
  const claimSources = sourcesForClaims(input.institutionId, claims);
  const requestedSource = input.sourceId
    ? getSurvivorStudioSource(input.institutionId, input.sourceId)
    : undefined;
  if (input.sourceId && (!requestedSource || !sourceAllowedForProfile(requestedSource, profile))) {
    throw new Error("The requested source is not approved for this institution profile.");
  }
  const source =
    requestedSource ??
    claimSources[0] ??
    getSurvivorStudioSource(
      input.institutionId,
      profile.historicalClaims[0]?.sourceIds[0] ?? "",
    );
  if (!source) throw new Error("No approved source is available for this profile.");
  const sourceClaims = claims.filter((claim) => claim.sourceIds.includes(source.id));
  const sourceEvidenceGap: SurvivorStudioEvidenceGap | undefined =
    input.sourceId && claims.length > 0 && sourceClaims.length === 0
      ? {
          id: `${source.id}:gap:claim-level-evidence`,
          institutionId: input.institutionId,
          survivorSlug: input.survivorSlug,
          field: "claim_level_source_evidence",
          statement: `The approved studio record includes “${source.title}” as source metadata, but it has no curator-reviewed transcript or locator supporting the requested claim.`,
          searchTerms: [],
          status: "not-established-in-approved-record",
        }
      : undefined;
  const gaps = sourceEvidenceGap ? [...matchedGaps, sourceEvidenceGap] : matchedGaps;
  const formatted = formatSurvivorStudioCitation(source, input.style);

  return {
    institutionId: input.institutionId,
    survivorSlug: input.survivorSlug,
    citation: formatted.bibliography,
    bibliography: formatted.bibliography,
    shortCitation: formatted.shortCitation,
    source: {
      id: source.id,
      label: source.sectionTitle
        ? `${source.title} — ${source.sectionTitle}`
        : source.title,
      href: source.url,
    },
    style: input.style,
    answer: buildGroundedAnswer(profile.displayName, sourceClaims, gaps),
    claimIds: sourceClaims.map((claim) => claim.id),
    evidenceGaps: gaps,
    mode: "deterministic-no-credits",
  };
}

export function buildSurvivorStudioPersonaReply(
  input: SurvivorStudioPersonaRequest,
): SurvivorStudioPersonaResponse {
  const profile = getSurvivorStudioProfile(input.institutionId, input.survivorSlug);
  const intent = contextualIntent(input);
  const gaps = asksForGapOverview(intent)
    ? profile.evidenceGaps
    : matchingGaps(profile.evidenceGaps, intent);
  const claims = relevantClaims(profile.historicalClaims, intent, gaps.length > 0);
  const sources = sourcesForClaims(input.institutionId, claims);
  const boundaryRequested =
    asksForImpersonation(intent) || asksForInnerLifeOrQuotation(intent);
  const boundary = boundaryRequested
    ? `I cannot speak as ${profile.displayName} or invent memories, feelings, dialogue, or direct quotations. `
    : "";
  const answer = `${boundary}${buildGroundedAnswer(
    profile.displayName,
    claims,
    gaps,
  )}`.trim();

  return {
    institutionId: input.institutionId,
    survivorSlug: input.survivorSlug,
    answer,
    citations: sources.map((source) => ({ label: source.title, href: source.url })),
    evidenceGaps: gaps,
    evidenceStatus: gaps.length || !claims.length || boundaryRequested ? "gap" : "grounded",
    guardrail: profile.personaGuardrails.identityNotice,
    suggestions: suggestionsFor(input.survivorSlug),
    mode: "deterministic-no-credits",
  };
}

export function listSurvivorStudioProfiles(
  institutionId: SurvivorStudioCiteRequest["institutionId"],
) {
  return getSurvivorStudioInstitution(institutionId).profiles;
}
