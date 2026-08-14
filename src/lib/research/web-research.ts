import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const APPROVED_RESEARCH_SURVIVORS = [
  "Sam Cohen",
  "Stephan Jalnos",
] as const;

export type ApprovedResearchSurvivor =
  (typeof APPROVED_RESEARCH_SURVIVORS)[number];

export const KNOWN_RESEARCH_SOURCE_IDS = [
  "sam-hmmsa-profile",
  "sam-youtube-testimony",
  "stephan-hmmsa-event",
  "stephan-hmmsa-profile",
] as const;

export type KnownResearchSourceId =
  (typeof KNOWN_RESEARCH_SOURCE_IDS)[number];

export interface KnownResearchSource {
  id: KnownResearchSourceId;
  survivorName: ApprovedResearchSurvivor;
  title: string;
  url: string;
  publisher: string;
}

export const KNOWN_RESEARCH_SOURCES: readonly KnownResearchSource[] = [
  {
    id: "sam-hmmsa-profile",
    survivorName: "Sam Cohen",
    title: "Local Holocaust Survivors: Sam Cohen",
    url: "https://www.hmmsa.org/survivors-experts",
    publisher: "The Holocaust Memorial Museum of San Antonio",
  },
  {
    id: "sam-youtube-testimony",
    survivorName: "Sam Cohen",
    title: "Sam Cohen oral history interview",
    url: "https://www.youtube.com/watch?v=fTA6H0ChY_E",
    publisher: "USC Shoah Foundation via YouTube",
  },
  {
    id: "stephan-hmmsa-event",
    survivorName: "Stephan Jalnos",
    title: "Survivor Speakers Series: Stephan Jalnos",
    url: "https://www.hmmsa.org/all-events/survivor-speakers-series-the-stories-of-holocaust-survivors-told-by-their-descendants",
    publisher: "The Holocaust Memorial Museum of San Antonio",
  },
  {
    id: "stephan-hmmsa-profile",
    survivorName: "Stephan Jalnos",
    title: "Local Holocaust Survivors: Susanne Weisz Jalnos and Stephan Jalnos",
    url: "https://www.hmmsa.org/survivors-experts",
    publisher: "The Holocaust Memorial Museum of San Antonio",
  },
] as const;

const ALLOWED_HOSTNAMES = new Set([
  "hmmsa.org",
  "www.hmmsa.org",
  "youtube.com",
  "www.youtube.com",
]);

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MILLISECONDS = 7_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_500_000;
const MAX_PLAIN_TEXT_CHARACTERS = 120_000;
const ACCEPTED_CONTENT_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "text/plain",
]);

export type ResearchFetchErrorCode =
  | "invalid_url"
  | "blocked_url"
  | "dns_failure"
  | "blocked_address"
  | "redirect_error"
  | "timeout"
  | "upstream_error"
  | "content_type"
  | "content_too_large";

export class ResearchFetchError extends Error {
  constructor(
    readonly code: ResearchFetchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ResearchFetchError";
  }
}

export interface ResearchClaimSuggestion {
  id: string;
  subject: ApprovedResearchSurvivor;
  field: string;
  value: string;
  evidenceNote: string;
  sourceTitle: string;
  sourceUrl: string;
  status: "suggested";
}

export interface DemoResearchRun {
  survivorName: ApprovedResearchSurvivor;
  status: "suggested";
  requiresCuratorApproval: true;
  source: {
    title: string;
    url: string;
    publisher?: string;
    retrieval: "fetched" | "metadata-only";
    contentType?: string;
  };
  claims: ResearchClaimSuggestion[];
  evidenceNote: string;
  limitations: string[];
  safetyNotice: string;
}

export interface DemoResearchInput {
  survivorName: ApprovedResearchSurvivor;
  sourceId?: KnownResearchSourceId;
  sourceUrl?: string;
}

interface ResolvedAddress {
  address: string;
  family: number;
}

export interface WebResearchDependencies {
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<ResolvedAddress[]>;
  timeoutMilliseconds?: number;
  maxResponseBytes?: number;
}

interface SafeFetchedPage {
  title: string;
  finalUrl: string;
  contentType: string;
  text: string;
}

function parseIpv4(address: string): number[] | null {
  const pieces = address.split(".");
  if (pieces.length !== 4) return null;
  const octets = pieces.map((piece) => Number(piece));
  if (
    octets.some(
      (octet, index) =>
        !Number.isInteger(octet) ||
        octet < 0 ||
        octet > 255 ||
        String(octet) !== pieces[index],
    )
  ) {
    return null;
  }
  return octets;
}

function ipv4EmbeddedInIpv6(address: string): string | null {
  const dotted = address.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted && (address.startsWith("::ffff:") || address.startsWith("::"))) {
    return dotted;
  }
  if (!address.startsWith("::ffff:")) return null;
  const groups = address.slice("::ffff:".length).split(":");
  if (groups.length !== 2 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }
  const high = Number.parseInt(groups[0], 16);
  const low = Number.parseInt(groups[1], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

export function isPublicResearchAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  const ipv4 = parseIpv4(normalized);
  if (ipv4) {
    const [a, b] = ipv4;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0)
    ) {
      return false;
    }
    return true;
  }

  if (isIP(normalized) !== 6) return false;
  const mappedIpv4 = ipv4EmbeddedInIpv6(normalized);
  if (mappedIpv4) return isPublicResearchAddress(mappedIpv4);
  return !(
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89a-f]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  );
}

export function parseAllowedResearchUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ResearchFetchError("invalid_url", "Enter a complete HTTPS source URL.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(hostname) !== 0 ||
    !ALLOWED_HOSTNAMES.has(hostname)
  ) {
    throw new ResearchFetchError(
      "blocked_url",
      "This demo can retrieve only public HTTPS pages on HMMSA.org or YouTube.com.",
    );
  }
  if (url.href.length > 1_200) {
    throw new ResearchFetchError("invalid_url", "The source URL is too long.");
  }
  url.hostname = hostname;
  url.hash = "";
  return url;
}

async function defaultResolveHost(hostname: string): Promise<ResolvedAddress[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

async function assertPublicResolution(
  hostname: string,
  resolveHost: NonNullable<WebResearchDependencies["resolveHost"]>,
): Promise<void> {
  let addresses: ResolvedAddress[];
  try {
    addresses = await resolveHost(hostname);
  } catch {
    throw new ResearchFetchError("dns_failure", "The source host could not be resolved.");
  }
  if (!addresses.length) {
    throw new ResearchFetchError("dns_failure", "The source host did not resolve.");
  }
  if (addresses.some(({ address }) => !isPublicResearchAddress(address))) {
    throw new ResearchFetchError(
      "blocked_address",
      "The source resolved to an address that cannot be retrieved by the archive.",
    );
  }
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
    (entity, code: string) => {
      if (code.startsWith("#")) {
        const hexadecimal = code[1]?.toLowerCase() === "x";
        const number = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
        return Number.isFinite(number) && number > 0 && number <= 0x10ffff
          ? String.fromCodePoint(number)
          : " ";
      }
      return named[code.toLowerCase()] ?? " ";
    },
  );
}

export function stripHtmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(
        /<(script|style|noscript|template|svg|iframe|object)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
        " ",
      )
      .replace(/<(?:br|\/p|\/div|\/section|\/article|\/li|\/h[1-6])\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_PLAIN_TEXT_CHARACTERS);
}

function extractPageTitle(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "";
  return stripHtmlToText(match).replace(/\s+/g, " ").trim().slice(0, 180);
}

async function readBoundedResponseBody(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new ResearchFetchError(
      "content_too_large",
      "The source page is too large for this bounded demo research run.",
    );
  }
  if (!response.body) return "";

  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) {
        await reader.cancel();
        throw new ResearchFetchError(
          "content_too_large",
          "The source page is too large for this bounded demo research run.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function fetchSafePublicPage(
  rawUrl: string,
  dependencies: WebResearchDependencies = {},
): Promise<SafeFetchedPage> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const resolveHost = dependencies.resolveHost ?? defaultResolveHost;
  const timeoutMilliseconds =
    dependencies.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;
  const maxResponseBytes =
    dependencies.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  let currentUrl = parseAllowedResearchUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicResolution(currentUrl.hostname, resolveHost);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
    try {
      const response = await fetchImpl(currentUrl, {
        method: "GET",
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html, application/xhtml+xml, text/plain;q=0.8",
          "User-Agent":
            "HMMSA-Digital-Archive-Research-Demo/1.0 (curator-initiated; contact via hmmsa.org)",
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirectCount === MAX_REDIRECTS) {
          throw new ResearchFetchError("redirect_error", "The source redirected too many times.");
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new ResearchFetchError("redirect_error", "The source returned an invalid redirect.");
        }
        await response.body?.cancel();
        currentUrl = parseAllowedResearchUrl(new URL(location, currentUrl).href);
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();
        throw new ResearchFetchError(
          "upstream_error",
          `The source returned HTTP ${response.status}.`,
        );
      }
      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (!contentType || !ACCEPTED_CONTENT_TYPES.has(contentType)) {
        await response.body?.cancel();
        throw new ResearchFetchError(
          "content_type",
          "The source did not return a supported text page.",
        );
      }

      const rawBody = await readBoundedResponseBody(response, maxResponseBytes);
      return {
        title: extractPageTitle(rawBody),
        finalUrl: currentUrl.href,
        contentType,
        text: stripHtmlToText(rawBody),
      };
    } catch (error) {
      if (error instanceof ResearchFetchError) throw error;
      if (controller.signal.aborted) {
        throw new ResearchFetchError("timeout", "The source did not respond in time.");
      }
      throw new ResearchFetchError("upstream_error", "The source could not be retrieved.");
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ResearchFetchError("redirect_error", "The source redirected too many times.");
}

function normalizedEvidenceText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hasEvidence(text: string, ...phrases: string[]): boolean {
  const normalized = normalizedEvidenceText(text);
  return phrases.every((phrase) => normalized.includes(normalizedEvidenceText(phrase)));
}

interface ClaimTemplate {
  id: string;
  field: string;
  value: string;
  evidenceNote: string;
  evidencePhrases: string[];
}

const SAM_COHEN_CLAIMS: readonly ClaimTemplate[] = [
  {
    id: "sam-cohen-upbringing-place",
    field: "place_grew_up",
    value: "Sam Cohen grew up in Salonika, Greece.",
    evidenceNote: "The HMMSA survivor profile identifies Salonika, Greece as the place where Sam grew up.",
    evidencePhrases: ["Sam grew up", "Salonika, Greece"],
  },
  {
    id: "sam-cohen-ghetto-1943",
    field: "wartime_displacement",
    value: "German authorities forced Sam Cohen and his family into the ghetto after Passover in 1943.",
    evidenceNote: "The HMMSA profile dates the family's forced move into the ghetto to after Passover 1943.",
    evidencePhrases: ["Sam and his family were forced to move into the ghetto", "after Passover in 1943"],
  },
  {
    id: "sam-cohen-escape",
    field: "escape",
    value: "Sam Cohen and his friend Jacques escaped during railroad-track labor.",
    evidenceNote: "The HMMSA profile describes Sam and Jacques escaping during daily railroad-track work.",
    evidencePhrases: ["Sam and Jacques", "escaped", "laying down railroad tracks"],
  },
  {
    id: "sam-cohen-resistance",
    field: "resistance",
    value: "After escaping, Sam Cohen and Jacques joined the resistance.",
    evidenceNote: "The HMMSA profile states that they joined the resistance after their escape.",
    evidencePhrases: ["escaped", "joined the resistance"],
  },
  {
    id: "sam-cohen-san-antonio-1951",
    field: "arrival_san_antonio",
    value: "Sam Cohen moved from Greece to San Antonio in 1951.",
    evidenceNote: "The HMMSA profile gives 1951 as the year Sam moved from Greece to San Antonio.",
    evidencePhrases: ["Sam moved to San Antonio", "from Greece in 1951"],
  },
  {
    id: "sam-cohen-bookkeeper",
    field: "occupation_after_arrival",
    value: "The Jewish Federation helped Sam Cohen find work as a bookkeeper after he moved to San Antonio.",
    evidenceNote: "The HMMSA profile says the Jewish Federation helped Sam obtain a bookkeeping job.",
    evidencePhrases: ["Jewish Federation helped him get a job as a bookkeeper"],
  },
] as const;

const STEPHAN_JALNOS_CLAIMS: readonly ClaimTemplate[] = [
  {
    id: "stephan-jalnos-lodz-ghetto",
    field: "wartime_place",
    value: "HMMSA places Stephan Jalnos's survivor story in the Łódź Ghetto in Poland.",
    evidenceNote: "The HMMSA event description begins Stephan's story with the Łódź Ghetto in Poland.",
    evidencePhrases: ["STEPHAN JALNOS", "Lodz Ghetto in Poland"],
  },
  {
    id: "stephan-jalnos-resistance",
    field: "resistance",
    value: "HMMSA's event description says Stephan Jalnos joined resistance fighters.",
    evidenceNote: "The event description includes joining resistance fighters in its outline of Stephan's story.",
    evidencePhrases: ["STEPHAN JALNOS", "joining the resistance fighters"],
  },
  {
    id: "stephan-jalnos-mauthausen",
    field: "camp",
    value: "HMMSA's event description includes Mauthausen in Stephan Jalnos's survivor story.",
    evidenceNote: "The event description names Mauthausen as part of Stephan's story.",
    evidencePhrases: ["STEPHAN JALNOS", "Mathausen"],
  },
  {
    id: "stephan-jalnos-son-robi",
    field: "story_presenter",
    value: "Stephan Jalnos's son, Robi Jalnos, shared his father's survivor story for HMMSA's event.",
    evidenceNote: "The HMMSA event description identifies Robi Jalnos as Stephan's son and the person sharing the story.",
    evidencePhrases: ["Stephan's story", "shared by his son, Robi Jalnos"],
  },
] as const;

function knownSourceForId(sourceId: KnownResearchSourceId): KnownResearchSource {
  const source = KNOWN_RESEARCH_SOURCES.find((candidate) => candidate.id === sourceId);
  if (!source) throw new ResearchFetchError("invalid_url", "Choose a known research source.");
  return source;
}

function sourceMatchingUrl(
  url: string,
  survivorName: ApprovedResearchSurvivor,
): KnownResearchSource | undefined {
  const parsed = parseAllowedResearchUrl(url);
  return KNOWN_RESEARCH_SOURCES.find((source) => {
    if (source.survivorName !== survivorName) return false;
    const known = parseAllowedResearchUrl(source.url);
    return (
      known.hostname === parsed.hostname &&
      known.pathname === parsed.pathname &&
      known.search === parsed.search
    );
  });
}

function claimsForPage(
  survivorName: ApprovedResearchSurvivor,
  page: SafeFetchedPage,
  sourceTitle: string,
): ResearchClaimSuggestion[] {
  const canonicalPath = new URL(page.finalUrl).pathname;
  const templates =
    survivorName === "Sam Cohen" && canonicalPath === "/survivors-experts"
      ? SAM_COHEN_CLAIMS
      : survivorName === "Stephan Jalnos" && canonicalPath.startsWith("/all-events/")
        ? STEPHAN_JALNOS_CLAIMS
        : [];

  return templates
    .filter((template) => hasEvidence(page.text, ...template.evidencePhrases))
    .slice(0, 6)
    .map((template) => ({
      id: template.id,
      subject: survivorName,
      field: template.field,
      value: template.value,
      evidenceNote: template.evidenceNote,
      sourceTitle,
      sourceUrl: page.finalUrl,
      status: "suggested" as const,
    }));
}

function youtubeMetadataOnlyRun(
  survivorName: ApprovedResearchSurvivor,
  rawUrl: string,
  knownSource: KnownResearchSource | undefined,
): DemoResearchRun {
  const safeUrl = parseAllowedResearchUrl(rawUrl);
  return {
    survivorName,
    status: "suggested",
    requiresCuratorApproval: true,
    source: {
      title: knownSource?.title ?? "YouTube source",
      url: safeUrl.href,
      publisher: knownSource?.publisher,
      retrieval: "metadata-only",
    },
    claims: [],
    evidenceNote:
      "YouTube did not return a bounded text page. The source has been retained for curator review, but no biographical claim was extracted from video metadata.",
    limitations:
      survivorName === "Stephan Jalnos"
        ? ["This source does not establish Stephan Jalnos's birth year, parents, or prewar family occupation."]
        : ["A transcript must be reviewed before testimony details can be proposed as claims."],
    safetyNotice:
      "Nothing from internet research is added to the archive until Robin approves each individual claim and its source.",
  };
}

export async function runDemoWebResearch(
  input: DemoResearchInput,
  dependencies: WebResearchDependencies = {},
): Promise<DemoResearchRun> {
  if ((input.sourceId ? 1 : 0) + (input.sourceUrl ? 1 : 0) !== 1) {
    throw new ResearchFetchError(
      "invalid_url",
      "Choose one known source or provide one curator-supplied source URL.",
    );
  }

  const selectedKnownSource = input.sourceId
    ? knownSourceForId(input.sourceId)
    : sourceMatchingUrl(input.sourceUrl as string, input.survivorName);
  if (selectedKnownSource && selectedKnownSource.survivorName !== input.survivorName) {
    throw new ResearchFetchError(
      "invalid_url",
      "The chosen source belongs to a different approved survivor in this demo.",
    );
  }
  const rawUrl = selectedKnownSource?.url ?? (input.sourceUrl as string);
  const parsedUrl = parseAllowedResearchUrl(rawUrl);

  let page: SafeFetchedPage;
  try {
    page = await fetchSafePublicPage(parsedUrl.href, dependencies);
  } catch (error) {
    if (
      error instanceof ResearchFetchError &&
      selectedKnownSource &&
      (parsedUrl.hostname === "youtube.com" || parsedUrl.hostname === "www.youtube.com") &&
      error.code !== "invalid_url"
    ) {
      return youtubeMetadataOnlyRun(
        input.survivorName,
        parsedUrl.href,
        selectedKnownSource,
      );
    }
    throw error;
  }

  const sourceTitle =
    page.title || selectedKnownSource?.title || `${parsedUrl.hostname} research source`;
  const claims = claimsForPage(input.survivorName, page, sourceTitle);
  const limitations =
    input.survivorName === "Stephan Jalnos"
      ? ["This source does not establish Stephan Jalnos's birth year, parents, or prewar family occupation."]
      : claims.length
        ? ["Only claims matched directly to the retrieved page text are shown."]
        : ["No supported biographical claims were identified automatically; review the source manually."];
  return {
    survivorName: input.survivorName,
    status: "suggested",
    requiresCuratorApproval: true,
    source: {
      title: sourceTitle,
      url: page.finalUrl,
      publisher: selectedKnownSource?.publisher,
      retrieval: "fetched",
      contentType: page.contentType,
    },
    claims,
    evidenceNote: claims.length
      ? `${claims.length} source-matched claim${claims.length === 1 ? "" : "s"} returned for individual review.`
      : "The source was retrieved, but no claim met this demo's deterministic evidence rules.",
    limitations,
    safetyNotice:
      "Nothing from internet research is added to the archive until Robin approves each individual claim and its source.",
  };
}
