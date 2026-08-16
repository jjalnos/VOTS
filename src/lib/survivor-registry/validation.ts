import {
  REGISTRY_GENERATIONS,
  type RegistryGeneration,
  type RegistryListInput,
  type RegistryPersonInput,
} from "@/lib/survivor-registry/types";

const GENERATIONS = new Set<string>(REGISTRY_GENERATIONS);

const MAX_NAME = 120;
const MAX_SHORT = 160;
const MAX_TEXT = 2_000;
const MAX_LIST_ITEMS = 12;

function cleanLine(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function cleanText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maximum);
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => cleanLine(entry, MAX_SHORT))
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS);
}

export type RegistryPersonParse =
  | { ok: true; input: RegistryPersonInput }
  | { ok: false; error: string };

export function parseRegistryPersonInput(payload: unknown): RegistryPersonParse {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "A person record payload is required." };
  }
  const raw = payload as Record<string, unknown>;
  const firstName = cleanLine(raw.firstName, MAX_NAME);
  const lastName = cleanLine(raw.lastName, MAX_NAME);
  if (!firstName && !lastName) {
    return { ok: false, error: "A first or last name is required." };
  }
  const generation = cleanLine(raw.generation, 40);
  if (!GENERATIONS.has(generation)) {
    return { ok: false, error: "Choose a valid generation label." };
  }
  const email = cleanLine(raw.email, MAX_SHORT);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "The email address is not valid." };
  }
  return {
    ok: true,
    input: {
      firstName,
      lastName,
      title: cleanLine(raw.title, 40),
      generation: generation as RegistryGeneration,
      familyThread: cleanLine(raw.familyThread, MAX_SHORT),
      countryOfOrigin: cleanLine(raw.countryOfOrigin, MAX_SHORT),
      dateOfBirth: cleanLine(raw.dateOfBirth, 40),
      dateOfDeath: cleanLine(raw.dateOfDeath, 40),
      camps: cleanList(raw.camps),
      fateNotes: cleanList(raw.fateNotes),
      address: cleanLine(raw.address, MAX_SHORT),
      city: cleanLine(raw.city, MAX_SHORT),
      state: cleanLine(raw.state, 40),
      zip: cleanLine(raw.zip, 20),
      email,
      phone: cleanLine(raw.phone, 60),
      deceased: raw.deceased === true,
      notes: cleanText(raw.notes, MAX_TEXT),
    },
  };
}

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export function parseRegistryListInput(url: URL): RegistryListInput {
  const generation = (url.searchParams.get("generation") ?? "all").trim();
  const status = (url.searchParams.get("status") ?? "all").trim();
  return {
    query: cleanLine(url.searchParams.get("q"), 160),
    generation: GENERATIONS.has(generation) ? (generation as RegistryGeneration) : "all",
    family: cleanLine(url.searchParams.get("family"), MAX_SHORT) || "all",
    status: status === "living" || status === "deceased" ? status : "all",
    page: positiveInteger(url.searchParams.get("page"), 1, 10_000),
    pageSize: positiveInteger(url.searchParams.get("pageSize"), 25, 100),
  };
}
