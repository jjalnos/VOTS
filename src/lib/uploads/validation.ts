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
  const staffAllowed = can(actor, "create_record") || can(actor, "upload_original");
  const familyAllowed = Boolean(familyId && can(actor, "contribute_upload", familyId));
  if (!staffAllowed && !familyAllowed) {
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

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * File formats the archive accepts as originals. The list is deliberately
 * broad across scans, photographs, recordings, and documents while still
 * refusing executables, scripts, and archives — an original should always be
 * the material itself, never a container or a program.
 */
export const ACCEPTED_FILE_EXTENSIONS = [
  // Photographs and scans
  "jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif",
  // Documents
  "pdf", "doc", "docx", "rtf", "txt", "odt",
  // Audio
  "mp3", "m4a", "wav", "aac", "ogg", "flac",
  // Video
  "mp4", "mov", "m4v", "avi", "mkv", "webm",
] as const;

const acceptedExtensions = new Set<string>(ACCEPTED_FILE_EXTENSIONS);

/** The `accept` attribute for the upload form's file input. */
export const FILE_INPUT_ACCEPT = ACCEPTED_FILE_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");

export interface UploadFileCheck {
  filename: string;
  byteSize: number;
}

/**
 * Returns the reasons a file cannot be accepted, or an empty list when it can.
 * Browsers disagree about MIME types, so the extension is the contract and the
 * size keeps a single upload well inside what the database comfortably holds.
 */
export function uploadFileIssues(file: UploadFileCheck): string[] {
  const issues: string[] = [];
  if (file.byteSize < 1) {
    issues.push("The file is empty.");
  } else if (file.byteSize > MAX_UPLOAD_BYTES) {
    issues.push("The file is larger than the 25 MB limit.");
  }
  const name = file.filename.trim().toLocaleLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() ?? "" : "";
  if (!extension || !acceptedExtensions.has(extension)) {
    issues.push(
      "This file format is not accepted. Send photographs, scans, documents, audio, or video in a common format.",
    );
  }
  return issues;
}
