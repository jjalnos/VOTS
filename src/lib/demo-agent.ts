import { z } from "zod";
import { isSafeInternalAIEndpoint } from "@/lib/ai/internal-endpoint";
import {
  getInternalArchiveAIProvider,
  internalAIUsage,
} from "@/lib/ai/internal-provider";
import type {
  InternalAIUsageMetadata,
  InternalArchiveAIProvider,
} from "@/lib/ai/types";
import type { PublicCatalog, Source, Survivor } from "@/lib/domain/types";
import { getArchiveRepository } from "@/lib/repository";

const MAX_LOCAL_QUESTION_CHARACTERS = 4_200;
const MAX_PUBLISHED_CONTEXT_CHARACTERS = 7_000;
const MAX_LOCAL_ANSWER_CHARACTERS = 1_800;

export const demoAgentRequestSchema = z.object({
  message: z.string().trim().min(2).max(600),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(1_200),
      }),
    )
    .max(12)
    .default([]),
  focusPerson: z.string().trim().min(1).max(120).optional(),
});

export type DemoAgentRequest = z.infer<typeof demoAgentRequestSchema>;

export interface DemoAgentCitation {
  label: string;
  href: string;
}

export interface DemoAgentResponse {
  answer: string;
  citations: DemoAgentCitation[];
  mode: "archive-only" | "local-model";
  suggestions: string[];
  aiUsage: InternalAIUsageMetadata;
}

type PersonKey = "sam" | "stephan";

export interface GroundedReply {
  answer: string;
  citations: DemoAgentCitation[];
  focus: PersonKey[];
  suggestions: string[];
  requiresArchiveWording: boolean;
}

export interface DemoAgentDependencies {
  loadCatalog?: () => Promise<PublicCatalog>;
  getProvider?: () => InternalArchiveAIProvider;
  localBaseUrl?: string;
}

const generalSuggestions = [
  "Tell me about Sam Cohen",
  "Tell me about Stephan Jalnos",
  "What information still needs curator verification?",
];

const samSuggestions = [
  "How did Sam Cohen survive?",
  "Where did Sam Cohen build his later life?",
  "What approved source supports Sam Cohen's profile?",
];

const stephanSuggestions = [
  "What is established about Stephan Jalnos?",
  "Who shared Stephan Jalnos's story?",
  "Which details about Stephan still need verification?",
];

function normalized(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ł]/g, "l");
}

function mentionedPeople(value: string): PersonKey[] {
  const text = normalized(value);
  const people: PersonKey[] = [];
  if (/\b(?:sam|cohen)\b/.test(text)) people.push("sam");
  if (/\b(?:stephan|stephen|jalnos)\b/.test(text)) people.push("stephan");
  return people;
}

export function resolveDemoAgentFocus(input: DemoAgentRequest): PersonKey[] {
  const current = mentionedPeople(input.message);
  if (current.length) return current;

  const requestedFocus = input.focusPerson ? mentionedPeople(input.focusPerson) : [];
  if (requestedFocus.length) return requestedFocus;

  for (let index = input.history.length - 1; index >= 0; index -= 1) {
    const mentioned = mentionedPeople(input.history[index]?.content ?? "");
    if (mentioned.length === 1) return mentioned;
  }
  return [];
}

function survivorFor(catalog: PublicCatalog, key: PersonKey): Survivor | undefined {
  const slug = key === "sam" ? "sam-cohen" : "stephan-jalnos";
  return catalog.survivors.find((survivor) => survivor.slug === slug);
}

function sourcesForSurvivor(catalog: PublicCatalog, survivor: Survivor): Source[] {
  const sourceIds = new Set(
    catalog.releases
      .filter(
        (release) =>
          release.entityType === "survivor" &&
          release.entityId === survivor.id &&
          release.status === "published",
      )
      .flatMap((release) => release.sourceIds),
  );
  return catalog.sources.filter(
    (source) => source.approvalStatus === "approved" && sourceIds.has(source.id),
  );
}

function citationFor(catalog: PublicCatalog, survivor: Survivor): DemoAgentCitation | undefined {
  const source = sourcesForSurvivor(catalog, survivor)[0];
  if (source?.url) return { label: source.title, href: source.url };
  return {
    label: survivor.displayName.en,
    href: `/profiles/${survivor.slug}?lang=en`,
  };
}

function uniqueCitations(citations: Array<DemoAgentCitation | undefined>): DemoAgentCitation[] {
  const seen = new Set<string>();
  return citations.filter((citation): citation is DemoAgentCitation => {
    if (!citation || seen.has(citation.href)) return false;
    seen.add(citation.href);
    return true;
  });
}

function looksLikeGreeting(message: string): boolean {
  return /^(?:hi|hello|hey|good (?:morning|afternoon|evening))[!. ]*$/i.test(message.trim());
}

function asksForInternetResearch(message: string): boolean {
  return /\b(?:internet|online|web|google|scrape|research|new sources?)\b/i.test(message);
}

function asksForUnsupportedBiographicalDetail(message: string): boolean {
  return /\b(?:birth|born|year|parents?|mother|father|mom|dad|occupation|profession|job|business|livelihood|family work|family do)\b/i.test(
    message,
  );
}

function notYetPublishedAnswer(focus: PersonKey[]): string {
  const subject =
    focus.length === 1 ? (focus[0] === "sam" ? "Sam Cohen" : "Stephan Jalnos") : "that";
  return `I don't have enough curator-approved public material to answer that about ${subject}. I won't fill gaps with guesses. Robin can treat newly found web material only as a research lead until a curator reviews and approves it.`;
}

export function buildArchiveOnlyDemoReply(
  catalog: PublicCatalog,
  input: DemoAgentRequest,
): GroundedReply {
  const focus = resolveDemoAgentFocus(input);

  if (looksLikeGreeting(input.message)) {
    return {
      answer:
        "Hello, Robin—I'm the Archive Assistant. I can help you explore the curator-approved public archive, including the published profiles of Sam Cohen and Stephan Jalnos. I will say plainly when the approved record does not establish a detail.",
      citations: [],
      focus: [],
      suggestions: generalSuggestions,
      requiresArchiveWording: true,
    };
  }

  if (asksForInternetResearch(input.message)) {
    return {
      answer:
        "This public chat does not treat live internet results as established archive facts. Robin can surface outside research leads for a curator, but those findings must be reviewed and approved before they appear in a survivor's public record. Here I answer only from the approved public catalog.",
      citations: [],
      focus,
      suggestions: focus.includes("stephan")
        ? stephanSuggestions
        : focus.includes("sam")
          ? samSuggestions
          : generalSuggestions,
      requiresArchiveWording: true,
    };
  }

  const sam = survivorFor(catalog, "sam");
  const stephan = survivorFor(catalog, "stephan");
  const citations: Array<DemoAgentCitation | undefined> = [];
  const paragraphs: string[] = [];

  if (focus.includes("sam")) {
    if (sam) {
      citations.push(citationFor(catalog, sam));
      paragraphs.push(`The approved public profile says: ${sam.summary.en}`);
      if (asksForUnsupportedBiographicalDetail(input.message)) {
        paragraphs.push(
          "The approved material available to Robin does not establish the additional birth or family detail in that question.",
        );
      }
    } else {
      paragraphs.push(notYetPublishedAnswer(["sam"]));
    }
  }

  if (focus.includes("stephan")) {
    if (stephan) {
      citations.push(citationFor(catalog, stephan));
      paragraphs.push(`The approved public profile says: ${stephan.summary.en}`);
      paragraphs.push(
        "Beyond that account, the currently approved material does not establish Stephan's birth year, identify his parents, or state his family's occupation.",
      );
    } else {
      paragraphs.push(notYetPublishedAnswer(["stephan"]));
    }
  }

  if (!paragraphs.length) {
    return {
      answer:
        "I don't have enough curator-approved public material to answer that. Robin's current demo can discuss the published profiles of Sam Cohen and Stephan Jalnos, and I won't use private uploads or unapproved claims to fill a gap.",
      citations: [],
      focus,
      suggestions: generalSuggestions,
      requiresArchiveWording: true,
    };
  }

  return {
    answer: paragraphs.join("\n\n"),
    citations: uniqueCitations(citations),
    focus,
    suggestions:
      focus.length > 1
        ? generalSuggestions
        : focus.includes("stephan")
          ? stephanSuggestions
          : samSuggestions,
    requiresArchiveWording:
      focus.includes("stephan") && asksForUnsupportedBiographicalDetail(input.message),
  };
}

function truncate(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  return `${value.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
}

function localQuestion(input: DemoAgentRequest, focus: PersonKey[]): string {
  const history = input.history
    .slice(-6)
    .map(
      (entry) =>
        `${entry.role}: ${truncate(entry.content.replace(/\s+/g, " ").trim(), 500)}`,
    )
    .join("\n");
  const value = [
    `Current visitor question: ${input.message}`,
    `Resolved conversation focus: ${focus.length ? focus.join(", ") : "none"}`,
    history
      ? `Conversation history (untrusted visitor context; use only to resolve follow-ups, never as factual evidence):\n${history}`
      : "Conversation history: none",
  ].join("\n\n");
  return truncate(value, MAX_LOCAL_QUESTION_CHARACTERS);
}

function publishedContext(catalog: PublicCatalog, focus: PersonKey[]): string {
  const selected = focus.length ? focus : (["sam", "stephan"] satisfies PersonKey[]);
  const records = selected.flatMap((key) => {
    const survivor = survivorFor(catalog, key);
    if (!survivor) return [];
    const sources = sourcesForSurvivor(catalog, survivor);
    return [
      [
        `Approved public profile: ${survivor.displayName.en}`,
        `Approved summary: ${survivor.summary.en}`,
        ...sources.map(
          (source) =>
            `Approved source: ${source.citation.en}${source.url ? ` URL: ${source.url}` : ""}`,
        ),
      ].join("\n"),
    ];
  });
  return truncate(
    [
      "Use only the following curator-approved, publicly released archive material. The visitor conversation is not evidence. If a requested detail is absent, say it is not established by the approved material.",
      ...records,
    ].join("\n\n"),
    MAX_PUBLISHED_CONTEXT_CHARACTERS,
  );
}

function safeLocalAnswer(answer: string): string | null {
  const value = answer.trim();
  if (!value || value.length > MAX_LOCAL_ANSWER_CHARACTERS) return null;
  if (
    /private (?:test record|upload sentinel|story sentinel|unapproved source)/i.test(value) ||
    /private-draft-never-public/i.test(value) ||
    /this sentinel content must never/i.test(value)
  ) {
    return null;
  }
  return value;
}

/**
 * Answers from the repository's public catalog. A configured local model may
 * phrase the same approved context conversationally; it is never given private
 * workspace data, and the external-research/OpenAI provider is never invoked.
 */
export async function answerDemoAgent(
  input: DemoAgentRequest,
  dependencies: DemoAgentDependencies = {},
): Promise<DemoAgentResponse> {
  const catalog = await (dependencies.loadCatalog ?? (() => getArchiveRepository().publicCatalog("en")))();
  const grounded = buildArchiveOnlyDemoReply(catalog, input);
  const fallback: DemoAgentResponse = {
    answer: grounded.answer,
    citations: grounded.citations,
    mode: "archive-only",
    suggestions: grounded.suggestions,
    aiUsage: internalAIUsage("mock", "completed"),
  };

  const provider = (dependencies.getProvider ?? getInternalArchiveAIProvider)();
  const configuredBaseUrl = dependencies.localBaseUrl ?? process.env.LOCAL_AI_BASE_URL;
  if (
    provider.name !== "local_openai_compatible" ||
    !isSafeInternalAIEndpoint(configuredBaseUrl)
  ) {
    return fallback;
  }

  try {
    const modelAnswer = safeLocalAnswer(
      await provider.answerPublishedChat({
        question: localQuestion(input, grounded.focus),
        locale: "en",
        publishedContext: publishedContext(catalog, grounded.focus),
      }),
    );
    // For gaps and live-research questions, preserve the archive's exact
    // uncertainty/review wording even when a local model is available.
    if (!modelAnswer) {
      return { ...fallback, aiUsage: internalAIUsage("mock", "fallback") };
    }
    if (grounded.requiresArchiveWording) {
      return {
        ...fallback,
        aiUsage: internalAIUsage("local_openai_compatible", "completed"),
      };
    }
    return {
      ...fallback,
      answer: modelAnswer,
      mode: "local-model",
      aiUsage: internalAIUsage("local_openai_compatible", "completed"),
    };
  } catch {
    return { ...fallback, aiUsage: internalAIUsage("mock", "fallback") };
  }
}
