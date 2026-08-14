import { z } from "zod";
import {
  SURVIVOR_STUDIO_INSTITUTION_IDS,
  SURVIVOR_STUDIO_SURVIVOR_SLUGS,
  hasSurvivorStudioProfile,
  type SurvivorStudioCitationStyle,
  type SurvivorStudioEvidenceGap,
  type SurvivorStudioInstitutionId,
  type SurvivorStudioSurvivorSlug,
} from "@/lib/survivor-studio/data";

const institutionIdSchema = z.enum(SURVIVOR_STUDIO_INSTITUTION_IDS);
const survivorSlugSchema = z.enum(SURVIVOR_STUDIO_SURVIVOR_SLUGS);
const citationStyleSchema = z.enum(["Chicago", "MLA", "APA"]);
const historyEntrySchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(800),
  })
  .strict();

function requireInstitutionProfile(
  value: {
    institutionId: SurvivorStudioInstitutionId;
    survivorSlug: SurvivorStudioSurvivorSlug;
  },
  context: z.RefinementCtx,
): void {
  if (hasSurvivorStudioProfile(value.institutionId, value.survivorSlug)) return;
  context.addIssue({
    code: "custom",
    path: ["survivorSlug"],
    message: "That survivor profile is not available for the selected institution.",
  });
}

export const survivorStudioCiteRequestSchema = z
  .object({
    institutionId: institutionIdSchema,
    survivorSlug: survivorSlugSchema,
    question: z.string().trim().min(2).max(700),
    style: citationStyleSchema,
    sourceId: z.string().trim().min(1).max(180).optional(),
  })
  .strict()
  .superRefine(requireInstitutionProfile);

export const survivorStudioPersonaRequestSchema = z
  .object({
    institutionId: institutionIdSchema,
    survivorSlug: survivorSlugSchema,
    message: z.string().trim().min(2).max(700),
    history: z.array(historyEntrySchema).max(8).default([]),
  })
  .strict()
  .superRefine(requireInstitutionProfile);

export type SurvivorStudioCiteRequest = z.infer<
  typeof survivorStudioCiteRequestSchema
>;
export type SurvivorStudioPersonaRequest = z.infer<
  typeof survivorStudioPersonaRequestSchema
>;

export interface SurvivorStudioSourceLink {
  id: string;
  label: string;
  href: string;
}

export interface SurvivorStudioCiteResponse {
  institutionId: SurvivorStudioInstitutionId;
  survivorSlug: SurvivorStudioSurvivorSlug;
  citation: string;
  bibliography: string;
  shortCitation: string;
  source: SurvivorStudioSourceLink;
  style: SurvivorStudioCitationStyle;
  answer: string;
  claimIds: string[];
  evidenceGaps: SurvivorStudioEvidenceGap[];
  mode: "deterministic-no-credits";
}

export interface SurvivorStudioPersonaResponse {
  institutionId: SurvivorStudioInstitutionId;
  survivorSlug: SurvivorStudioSurvivorSlug;
  answer: string;
  citations: Array<{ label: string; href: string }>;
  evidenceGaps: SurvivorStudioEvidenceGap[];
  evidenceStatus: "grounded" | "gap";
  guardrail: string;
  suggestions: string[];
  mode: "deterministic-no-credits";
}
