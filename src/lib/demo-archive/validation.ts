import path from "node:path";
import { z } from "zod";
import {
  DEMO_ARCHIVE_ITEM_TYPES,
  type DemoArchiveExtractionStatus,
  type DemoArchiveItemType,
  type DemoArchiveScanStatus,
  type DemoArchiveStoredRecord,
} from "@/lib/demo-archive/types";

export const DEMO_ARCHIVE_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const DEMO_ARCHIVE_MAX_REQUEST_BYTES = 9 * 1024 * 1024;
export const DEMO_ARCHIVE_LIMITED_TEXT_REVIEW_MAX_BYTES = 500_000;
export const DEMO_ARCHIVE_WORKSPACE_QUOTA_BYTES = 500 * 1024 * 1024;
export const DEMO_ARCHIVE_GLOBAL_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
export const DEMO_ARCHIVE_MAX_RECORDS = 500;

const metadataSchema = z
  .object({
    clientId: z.string().trim().max(120).optional(),
    survivorName: z.string().trim().min(1).max(160),
    title: z.string().trim().min(3).max(180),
    itemType: z.enum(DEMO_ARCHIVE_ITEM_TYPES),
    sourceContributor: z.string().trim().min(2).max(240),
    originalLanguage: z.string().trim().min(2).max(80),
    consentRights: z.string().trim().min(2).max(120),
    rightsStatement: z.string().trim().min(8).max(2_000),
    historicalDate: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(4_000).optional(),
    tags: z.array(z.string().trim().min(1).max(60)).max(16).default([]),
    visibility: z.literal("private"),
  })
  .strict();

export type DemoArchiveUploadMetadata = z.infer<typeof metadataSchema>;

interface AllowedFile {
  itemType: DemoArchiveItemType;
  mimeType: string;
  previewable: boolean;
  extractionStatus: DemoArchiveExtractionStatus;
  signature: (bytes: Uint8Array) => boolean;
}

function starts(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return Buffer.from(bytes.subarray(start, start + length)).toString("ascii");
}

function looksTextual(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.byteLength, 8_192));
  return !sample.includes(0);
}

function zip(bytes: Uint8Array): boolean {
  return starts(bytes, [0x50, 0x4b, 0x03, 0x04]);
}

function ole(bytes: Uint8Array): boolean {
  return starts(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
}

function mp4(bytes: Uint8Array): boolean {
  return ascii(bytes, 4, 4) === "ftyp";
}

const ALLOWED_FILES: Record<string, AllowedFile> = {
  pdf: {
    itemType: "document",
    mimeType: "application/pdf",
    previewable: true,
    extractionStatus: "awaiting-text-extraction",
    signature: (bytes) => ascii(bytes, 0, 5) === "%PDF-",
  },
  txt: {
    itemType: "document",
    mimeType: "text/plain; charset=utf-8",
    previewable: true,
    extractionStatus: "text-ready",
    signature: looksTextual,
  },
  md: {
    itemType: "document",
    mimeType: "text/markdown; charset=utf-8",
    previewable: true,
    extractionStatus: "text-ready",
    signature: looksTextual,
  },
  csv: {
    itemType: "document",
    mimeType: "text/csv; charset=utf-8",
    previewable: true,
    extractionStatus: "text-ready",
    signature: looksTextual,
  },
  rtf: {
    itemType: "document",
    mimeType: "application/rtf",
    previewable: false,
    extractionStatus: "awaiting-text-extraction",
    signature: (bytes) => ascii(bytes, 0, 5) === "{\\rtf",
  },
  doc: {
    itemType: "document",
    mimeType: "application/msword",
    previewable: false,
    extractionStatus: "awaiting-text-extraction",
    signature: ole,
  },
  docx: {
    itemType: "document",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    previewable: false,
    extractionStatus: "awaiting-text-extraction",
    signature: zip,
  },
  xls: {
    itemType: "document",
    mimeType: "application/vnd.ms-excel",
    previewable: false,
    extractionStatus: "awaiting-text-extraction",
    signature: ole,
  },
  xlsx: {
    itemType: "document",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    previewable: false,
    extractionStatus: "awaiting-text-extraction",
    signature: zip,
  },
  jpg: {
    itemType: "photograph",
    mimeType: "image/jpeg",
    previewable: true,
    extractionStatus: "awaiting-ocr",
    signature: (bytes) => starts(bytes, [0xff, 0xd8, 0xff]),
  },
  jpeg: {
    itemType: "photograph",
    mimeType: "image/jpeg",
    previewable: true,
    extractionStatus: "awaiting-ocr",
    signature: (bytes) => starts(bytes, [0xff, 0xd8, 0xff]),
  },
  png: {
    itemType: "photograph",
    mimeType: "image/png",
    previewable: true,
    extractionStatus: "awaiting-ocr",
    signature: (bytes) => starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  webp: {
    itemType: "photograph",
    mimeType: "image/webp",
    previewable: true,
    extractionStatus: "awaiting-ocr",
    signature: (bytes) => ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP",
  },
  tif: {
    itemType: "photograph",
    mimeType: "image/tiff",
    previewable: false,
    extractionStatus: "awaiting-ocr",
    signature: (bytes) =>
      starts(bytes, [0x49, 0x49, 0x2a, 0x00]) || starts(bytes, [0x4d, 0x4d, 0x00, 0x2a]),
  },
  tiff: {
    itemType: "photograph",
    mimeType: "image/tiff",
    previewable: false,
    extractionStatus: "awaiting-ocr",
    signature: (bytes) =>
      starts(bytes, [0x49, 0x49, 0x2a, 0x00]) || starts(bytes, [0x4d, 0x4d, 0x00, 0x2a]),
  },
  mp3: {
    itemType: "audio",
    mimeType: "audio/mpeg",
    previewable: true,
    extractionStatus: "awaiting-transcription",
    signature: (bytes) =>
      ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] ?? 0) >= 0xe0),
  },
  wav: {
    itemType: "audio",
    mimeType: "audio/wav",
    previewable: true,
    extractionStatus: "awaiting-transcription",
    signature: (bytes) => ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE",
  },
  m4a: {
    itemType: "audio",
    mimeType: "audio/mp4",
    previewable: true,
    extractionStatus: "awaiting-transcription",
    signature: mp4,
  },
  aac: {
    itemType: "audio",
    mimeType: "audio/aac",
    previewable: true,
    extractionStatus: "awaiting-transcription",
    signature: (bytes) => bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xf6) === 0xf0,
  },
  ogg: {
    itemType: "audio",
    mimeType: "audio/ogg",
    previewable: true,
    extractionStatus: "awaiting-transcription",
    signature: (bytes) => ascii(bytes, 0, 4) === "OggS",
  },
  mp4: {
    itemType: "video",
    mimeType: "video/mp4",
    previewable: true,
    extractionStatus: "awaiting-transcription",
    signature: mp4,
  },
  m4v: {
    itemType: "video",
    mimeType: "video/mp4",
    previewable: true,
    extractionStatus: "awaiting-transcription",
    signature: mp4,
  },
  mov: {
    itemType: "video",
    mimeType: "video/quicktime",
    previewable: true,
    extractionStatus: "awaiting-transcription",
    signature: mp4,
  },
  webm: {
    itemType: "video",
    mimeType: "video/webm",
    previewable: true,
    extractionStatus: "awaiting-transcription",
    signature: (bytes) => starts(bytes, [0x1a, 0x45, 0xdf, 0xa3]),
  },
};

export interface ValidatedArchiveFile {
  extension: string;
  itemType: DemoArchiveItemType;
  mimeType: string;
  previewable: boolean;
  extractionStatus: DemoArchiveExtractionStatus;
  initialScanStatus: DemoArchiveScanStatus;
}

export type LimitedTextSafetyReviewResult =
  | { ok: true; text: string }
  | {
      ok: false;
      reason:
        | "ineligible-format"
        | "oversize"
        | "invalid-utf8"
        | "empty"
        | "control-characters"
        | "bidi-controls";
    };

/**
 * A deliberately narrow, curator-invoked check for bounded UTF-8 text. This is
 * not an antivirus or malware scan and must never be used to clear other file
 * families.
 */
export function reviewLimitedArchiveText(
  record: Pick<
    DemoArchiveStoredRecord,
    "itemType" | "mimeType" | "originalFilename" | "extractionStatus"
  >,
  bytes: Uint8Array,
): LimitedTextSafetyReviewResult {
  const extension = path.extname(record.originalFilename).slice(1).toLocaleLowerCase("en");
  const expectedMimeType = extension === "txt"
    ? "text/plain; charset=utf-8"
    : extension === "md"
      ? "text/markdown; charset=utf-8"
      : null;
  if (
    record.itemType !== "document" ||
    record.extractionStatus !== "text-ready" ||
    !expectedMimeType ||
    record.mimeType !== expectedMimeType
  ) {
    return { ok: false, reason: "ineligible-format" };
  }
  if (!bytes.byteLength || bytes.byteLength > DEMO_ARCHIVE_LIMITED_TEXT_REVIEW_MAX_BYTES) {
    return { ok: false, reason: bytes.byteLength ? "oversize" : "empty" };
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: "invalid-utf8" };
  }
  if (!text.trim()) return { ok: false, reason: "empty" };
  if (/\u0000|[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text)) {
    return { ok: false, reason: "control-characters" };
  }
  if (/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(text)) {
    return { ok: false, reason: "bidi-controls" };
  }
  return { ok: true, text };
}

export function parseDemoArchiveMetadata(value: FormDataEntryValue | null):
  | { ok: true; value: DemoArchiveUploadMetadata }
  | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "Upload metadata is required." };
  }
  let input: unknown;
  try {
    input = JSON.parse(value);
  } catch {
    return { ok: false, error: "Upload metadata must be valid JSON." };
  }
  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Upload metadata is incomplete.",
    };
  }
  return {
    ok: true,
    value: {
      ...parsed.data,
      tags: [...new Set(parsed.data.tags.map((tag) => tag.toLocaleLowerCase("en")))],
    },
  };
}

export function validateDemoArchiveFile(
  file: File,
  bytes: Uint8Array,
  requestedType: DemoArchiveItemType,
): { ok: true; value: ValidatedArchiveFile } | { ok: false; error: string } {
  if (!file.name.trim() || !file.size) {
    return { ok: false, error: "The selected file is empty or has no usable filename." };
  }
  if (file.size > DEMO_ARCHIVE_MAX_FILE_BYTES) {
    return { ok: false, error: "Files must be 8 MB or smaller in this live demo." };
  }
  const extension = path.extname(file.name).slice(1).toLocaleLowerCase("en");
  const allowed = ALLOWED_FILES[extension];
  if (!allowed) {
    return {
      ok: false,
      error: "Use a supported document, photograph, audio recording, or video format.",
    };
  }
  if (allowed.itemType !== requestedType) {
    return {
      ok: false,
      error: `This file is a ${allowed.itemType}; update the record type before uploading.`,
    };
  }
  if (!allowed.signature(bytes.subarray(0, 8_192))) {
    return {
      ok: false,
      error: "The file contents do not match its extension, so it was not stored.",
    };
  }
  if (allowed.extractionStatus === "text-ready" && !decodeValidatedPlainText(bytes)) {
    return {
      ok: false,
      error: "The text file is not valid UTF-8 plain text, so it was not stored.",
    };
  }
  return {
    ok: true,
    value: {
      extension,
      itemType: allowed.itemType,
      mimeType: allowed.mimeType,
      previewable: allowed.previewable,
      extractionStatus: allowed.extractionStatus,
      initialScanStatus: "quarantined",
    },
  };
}

export function decodeValidatedPlainText(bytes: Uint8Array): string | undefined {
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/[^\t\n\r\x20-\x7e\u00a0-\uffff]/u.test(value)) return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 500_000) : undefined;
  } catch {
    return undefined;
  }
}

export function extractedArchiveText(
  bytes: Uint8Array,
  validation: ValidatedArchiveFile,
): string | undefined {
  if (validation.extractionStatus !== "text-ready") return undefined;
  return decodeValidatedPlainText(bytes);
}
