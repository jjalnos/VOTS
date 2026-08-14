import type { ChatCitation, Locale, PublicCatalog } from "@/lib/domain/types";

export interface CitedAnswer {
  answer: string;
  citations: ChatCitation[];
  scopeNotice: string;
  generatedBy: "curated_retrieval_mock";
}

const stopWords = new Set([
  "the",
  "and",
  "for",
  "what",
  "how",
  "who",
  "this",
  "that",
  "los",
  "las",
  "una",
  "para",
  "que",
  "como",
  "qué",
  "cómo",
]);

function terms(question: string): string[] {
  return question
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !stopWords.has(term));
}

function overlapScore(haystack: string, needles: string[]): number {
  const normalized = haystack.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return needles.filter((term) => normalized.includes(term)).length;
}

export function answerFromPublishedCatalog(
  question: string,
  locale: Locale,
  catalog: PublicCatalog,
): CitedAnswer {
  const queryTerms = terms(question);
  const candidates = [
    ...catalog.survivors.map((record) => ({
      id: record.id,
      text: `${record.displayName[locale]} ${record.summary[locale]}`,
      href: `/profiles/${record.slug}?lang=${locale}`,
      label: record.displayName[locale],
    })),
    ...catalog.stories.map((story) => ({
      id: story.id,
      text: `${story.title[locale]} ${story.dek[locale]} ${story.body[locale]}`,
      href: `/stories?lang=${locale}#${story.slug}`,
      label: story.title[locale],
    })),
    ...catalog.timelineEvents.map((event) => ({
      id: event.id,
      text: `${event.dateLabel[locale]} ${event.title[locale]} ${event.description[locale]}`,
      href: `/timeline?lang=${locale}#${event.id}`,
      label: event.title[locale],
    })),
  ];
  const selected = candidates
    .map((candidate) => ({ ...candidate, score: overlapScore(candidate.text, queryTerms) }))
    .sort((left, right) => right.score - left.score)
    .find((candidate) => queryTerms.length > 0 && candidate.score >= 2);
  const approvedSource = catalog.sources[0];

  if (!selected || !approvedSource) {
    return {
      answer:
        locale === "es"
          ? "No encuentro una respuesta respaldada por material publicado del museo. Intente preguntar sobre un perfil, historia o evento que aparezca en el archivo público."
          : "I cannot find an answer supported by published museum material. Try asking about a profile, story, or event that appears in the public archive.",
      citations: [],
      scopeNotice:
        locale === "es"
          ? "No se consultaron cargas privadas ni fuentes sin aprobar."
          : "No private uploads or unapproved sources were searched.",
      generatedBy: "curated_retrieval_mock",
    };
  }

  return {
    answer:
      locale === "es"
        ? `${selected.text} Esta respuesta se limita al registro de demostración publicado.`
        : `${selected.text} This answer is limited to the published demonstration record.`,
    citations: [
      {
        id: `citation-${selected.id}`,
        label: selected.label,
        href: selected.href,
        sourceId: approvedSource.id,
      },
    ],
    scopeNotice:
      locale === "es"
        ? "Respuesta basada únicamente en material publicado y fuentes aprobadas."
        : "Answer based only on published material and approved sources.",
    generatedBy: "curated_retrieval_mock",
  };
}
