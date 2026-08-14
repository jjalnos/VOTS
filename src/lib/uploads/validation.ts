import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor } from "@/lib/auth/policy";
import { can } from "@/lib/auth/policy";
import type { ArchiveItem } from "@/lib/domain/types";

export const uploadMetadataSchema = z
  .object({
    survivorId: z.string().trim().min(1).optional(),
    familyId: z.string().trim().min(1).optional(),
    title: z.string().trim().min(3).max(180),
    itemType: z.enum(["document", "photograph", "audio", "video", "artifact", "other"]),
    sourceContributor: z.string().trim().min(3).max(240),
    originalLanguage: z.enum(["en", "es", "other"]),
    consentRights: z.enum(["owned", "permission", "documented_restriction"]),
    rightsStatement: z.string().trim().min(8).max(2_000),
  })
  .refine((value) => Boolean(value.survivorId || value.familyId), {
    message: "A survivor or family association is required.",
    path: ["familyId"],
  });

export type UploadMetadataInput = z.input<typeof uploadMetadataSchema>;

export class UploadValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: string[],
  ) {
    super(message);
  }
}

export function createPrivateArchiveItem(
  input: UploadMetadataInput,
  actor: Actor,
  options: { id?: string; now?: string } = {},
): ArchiveItem {
  const parsed = uploadMetadataSchema.safeParse(input);
  if (!parsed.success) {
    throw new UploadValidationError(
      "Upload metadata is incomplete.",
      parsed.error.issues.map((issue) => issue.message),
    );
  }

  const familyId = parsed.data.familyId ?? actor.familyId;
  const curatorAllowed = can(actor, "create_record");
  const familyAllowed = Boolean(familyId && can(actor, "contribute_upload", familyId));
  if (!curatorAllowed && !familyAllowed) {
    throw new UploadValidationError("This account cannot contribute to that family group.", [
      "Family contributors may upload only to their invited family group.",
    ]);
  }

  const now = options.now ?? new Date().toISOString();
  return {
    id: options.id ?? randomUUID(),
    survivorId: parsed.data.survivorId,
    familyId,
    title: parsed.data.title,
    itemType: parsed.data.itemType,
    sourceContributor: parsed.data.sourceContributor,
    originalLanguage: parsed.data.originalLanguage,
    consentRights: parsed.data.consentRights,
    rightsStatement: parsed.data.rightsStatement,
    visibility: "private",
    reviewStatus: "pending",
    uploadedBy: actor.userId,
    createdAt: now,
    updatedAt: now,
  };
}
