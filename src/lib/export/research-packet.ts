import type { ExtractedFact, Locale, Source, Survivor } from "@/lib/domain/types";

function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function renderApprovedResearchPacket(input: {
  survivor: Survivor;
  locale: Locale;
  facts: ExtractedFact[];
  sources: Source[];
  approvedBy: string;
  exportedAt?: string;
}): string {
  const approvedFacts = input.facts.filter((fact) => fact.status === "approved");
  const approvedSources = input.sources.filter((source) => source.approvalStatus === "approved");
  const exportedAt = input.exportedAt ?? new Date().toISOString();

  const factLines = approvedFacts.length
    ? approvedFacts.map(
        (fact) =>
          `- **${fact.field}:** ${fact.value[input.locale]}  \n  Source locator: ${fact.sourceLocator}`,
      )
    : ["- No approved extracted facts were included."];
  const sourceLines = approvedSources.length
    ? approvedSources.map(
        (source, index) =>
          `${index + 1}. ${source.citation[input.locale]}${source.url ? ` — ${source.url}` : ""}`,
      )
    : ["1. No approved sources were included."];

  return [
    "---",
    `title: ${yamlString(input.survivor.displayName[input.locale])}`,
    `survivor_id: ${yamlString(input.survivor.id)}`,
    `locale: ${input.locale}`,
    `approved_by: ${yamlString(input.approvedBy)}`,
    `exported_at: ${yamlString(exportedAt)}`,
    "export_mode: approved-research-packet",
    "---",
    "",
    `# ${input.survivor.displayName[input.locale]}`,
    "",
    "> Export-only research packet. This file does not sync with Obsidian and contains only approved records.",
    "",
    "## Curator-approved summary",
    "",
    input.survivor.summary[input.locale],
    "",
    "## Approved facts",
    "",
    ...factLines,
    "",
    "## Approved sources",
    "",
    ...sourceLines,
    "",
  ].join("\n");
}
