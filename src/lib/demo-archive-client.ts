export type DemoArchiveMediaType = "document" | "photograph" | "audio" | "video";

export type DemoArchiveStatus =
  | "Private · needs review"
  | "Private · processing"
  | "Private · ready"
  | "Approved for private use";

export interface DemoArchiveRecord {
  id: string;
  title: string;
  survivorName: string;
  mediaType: DemoArchiveMediaType;
  mimeType: string;
  originalFilename: string;
  fileSize: number;
  uploadedAt: string;
  sourceContributor: string;
  originalLanguage: string;
  consentRights: string;
  rightsStatement: string;
  status: DemoArchiveStatus;
  historicalDate?: string;
  notes?: string;
  tags: string[];
  previewUrl?: string;
  duration?: string;
  dimensions?: string;
  pageCount?: number;
  extractionStatus?: string;
  scanStatus?: string;
}

export interface DemoArchiveFilters {
  query: string;
  survivor: string;
  mediaType: DemoArchiveMediaType | "all";
  status: "all" | "needs-review" | "processing" | "ready" | "approved-private";
  page: number;
  pageSize: number;
}

export interface DemoArchiveLibraryPage {
  items: DemoArchiveRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  limitations: string[];
}

export interface DemoArchiveUploadMetadata {
  clientId: string;
  survivorName: string;
  title: string;
  itemType: DemoArchiveMediaType;
  sourceContributor: string;
  originalLanguage: string;
  consentRights: string;
  rightsStatement: string;
  historicalDate?: string;
  notes?: string;
  tags: string[];
  visibility: "private";
}

export interface DemoArchiveUploadResult {
  record: DemoArchiveRecord;
  limitations: string[];
}

export interface DemoArchiveTextClearanceResult {
  record: {
    id: string;
    scanStatus: "cleared";
    previewUrl?: string;
  };
  status: "cleared" | "already-cleared";
}

export interface DemoArchiveFileValidation {
  mediaType?: DemoArchiveMediaType;
  error?: string;
}

export class DemoArchiveApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DemoArchiveApiError";
    this.status = status;
  }
}

export function demoArchiveErrorStatus(value: unknown): number | undefined {
  return value instanceof DemoArchiveApiError ? value.status : undefined;
}

export const DEMO_ARCHIVE_MAX_FILES = 6;
export const DEMO_ARCHIVE_MAX_FILE_BYTES = 8 * 1024 * 1024;

export const DEMO_ARCHIVE_ACCEPT = [
  ".pdf",
  ".txt",
  ".md",
  ".rtf",
  ".doc",
  ".docx",
  ".csv",
  ".xls",
  ".xlsx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tif",
  ".tiff",
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".mp4",
  ".m4v",
  ".mov",
  ".webm",
].join(",");

const extensionTypes: Record<string, DemoArchiveMediaType> = {
  pdf: "document",
  txt: "document",
  md: "document",
  rtf: "document",
  doc: "document",
  docx: "document",
  csv: "document",
  xls: "document",
  xlsx: "document",
  jpg: "photograph",
  jpeg: "photograph",
  png: "photograph",
  webp: "photograph",
  tif: "photograph",
  tiff: "photograph",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  aac: "audio",
  ogg: "audio",
  mp4: "video",
  m4v: "video",
  mov: "video",
  webm: "video",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeMediaType(value: unknown): DemoArchiveMediaType | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "document") return "document";
  if (["photograph", "photo", "image"].includes(normalized)) return "photograph";
  if (normalized === "audio") return "audio";
  if (normalized === "video") return "video";
  return undefined;
}

function normalizeStatus(value: unknown): DemoArchiveStatus {
  if (typeof value !== "string") return "Private · needs review";
  const normalized = value.toLowerCase();
  if (normalized.includes("processing") || normalized.includes("transcription")) {
    return "Private · processing";
  }
  if (normalized.includes("approved")) return "Approved for private use";
  if (normalized.includes("ready")) return "Private · ready";
  return "Private · needs review";
}

export function archiveRecordFromUnknown(value: unknown): DemoArchiveRecord | null {
  if (!isObject(value)) return null;
  const id = asString(value.id);
  const title = asString(value.title);
  const mediaType = normalizeMediaType(value.mediaType ?? value.itemType ?? value.type);
  if (!id || !title || !mediaType) return null;

  return {
    id,
    title,
    survivorName: asString(value.survivorName ?? value.person ?? value.survivor, "Unassigned"),
    mediaType,
    mimeType: asString(value.mimeType ?? value.contentType, "application/octet-stream"),
    originalFilename: asString(value.originalFilename ?? value.fileName ?? value.filename, title),
    fileSize: asNumber(value.fileSize ?? value.byteSize ?? value.size),
    uploadedAt: asString(value.uploadedAt ?? value.createdAt, new Date(0).toISOString()),
    sourceContributor: asString(value.sourceContributor ?? value.contributor, "Not recorded"),
    originalLanguage: asString(value.originalLanguage ?? value.language, "Not recorded"),
    consentRights: asString(value.consentRights ?? value.rightsBasis, "Review required"),
    rightsStatement: asString(
      value.rightsStatement,
      "Private archive record. Rights require curator review before any publication.",
    ),
    status: normalizeStatus(value.status ?? value.reviewStatus ?? value.extractionStatus),
    historicalDate: asString(value.historicalDate ?? value.captureDate ?? value.dateCreated) || undefined,
    notes: asString(value.notes ?? value.description) || undefined,
    tags: asStringArray(value.tags),
    previewUrl: asString(value.previewUrl ?? value.privatePreviewUrl) || undefined,
    duration: asString(value.duration) || undefined,
    dimensions: asString(value.dimensions) || undefined,
    pageCount: asNumber(value.pageCount) || undefined,
    extractionStatus: asString(value.extractionStatus) || undefined,
    scanStatus: asString(value.scanStatus) || undefined,
  };
}

function libraryPageFromUnknown(value: unknown, requested: DemoArchiveFilters): DemoArchiveLibraryPage {
  if (!isObject(value)) throw new Error("The archive library response was not recognized.");
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.records)
      ? value.records
      : null;
  if (!rawItems) throw new Error("The archive library response did not include a record list.");
  const items = rawItems
    .map(archiveRecordFromUnknown)
    .filter((item): item is DemoArchiveRecord => Boolean(item));
  const pagination = isObject(value.pagination) ? value.pagination : value;
  const total = asNumber(pagination.total, items.length);
  const pageSize = Math.max(1, asNumber(pagination.pageSize, requested.pageSize));
  const page = Math.max(1, asNumber(pagination.page, requested.page));
  const totalPages = Math.max(1, asNumber(pagination.totalPages, Math.ceil(total / pageSize)));
  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    limitations: asStringArray(value.limitations),
  };
}

function responseError(value: unknown, fallback: string): string {
  return isObject(value) && typeof value.error === "string" ? value.error : fallback;
}

export async function getDemoArchiveLibrary(
  filters: DemoArchiveFilters,
  signal?: AbortSignal,
): Promise<DemoArchiveLibraryPage> {
  const params = new URLSearchParams({
    q: filters.query,
    survivor: filters.survivor,
    type: filters.mediaType,
    status: filters.status,
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
  const response = await fetch(`/api/demo/archive?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const fallback = response.status === 401
      ? "Sign in with an authorized archive account to open Robin’s private library."
      : "The private archive library could not be loaded.";
    throw new DemoArchiveApiError(responseError(payload, fallback), response.status);
  }
  return libraryPageFromUnknown(payload, filters);
}

export async function clearDemoArchiveText(
  recordId: string,
): Promise<DemoArchiveTextClearanceResult> {
  const response = await fetch(
    `/api/demo/archive/${encodeURIComponent(recordId)}/text-clearance`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmed: true,
        acknowledgement: "RUN_LIMITED_TEXT_SAFETY_REVIEW",
      }),
      cache: "no-store",
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new DemoArchiveApiError(
      responseError(payload, "The limited text safety review could not be completed."),
      response.status,
    );
  }
  if (!isObject(payload) || !isObject(payload.record) || !isObject(payload.clearance)) {
    throw new Error("The text clearance response was not recognized.");
  }
  const id = asString(payload.record.id);
  const scanStatus = asString(payload.record.scanStatus);
  const status = asString(payload.clearance.status);
  if (
    id !== recordId ||
    scanStatus !== "cleared" ||
    (status !== "cleared" && status !== "already-cleared")
  ) {
    throw new Error("The text clearance response did not confirm a private clearance.");
  }
  return {
    record: {
      id,
      scanStatus,
      previewUrl: asString(payload.record.previewUrl) || undefined,
    },
    status,
  };
}

function uploadedRecordFromUnknown(value: unknown): DemoArchiveUploadResult | null {
  if (!isObject(value)) return null;
  const direct = archiveRecordFromUnknown(value.record ?? value.archiveItem);
  if (direct) return { record: direct, limitations: asStringArray(value.limitations) };
  if (Array.isArray(value.accepted) && value.accepted.length) {
    const first = value.accepted[0];
    const record = archiveRecordFromUnknown(isObject(first) ? first.record ?? first : first);
    if (record) return { record, limitations: asStringArray(value.limitations) };
  }
  return null;
}

function uploadRejectionFromUnknown(value: unknown): string | undefined {
  if (!isObject(value) || !Array.isArray(value.rejected) || !value.rejected.length) return undefined;
  const first = value.rejected[0];
  return isObject(first) && typeof first.reason === "string" ? first.reason : undefined;
}

export function validateDemoArchiveFile(file: File): DemoArchiveFileValidation {
  if (!file.name.trim()) return { error: "This file does not have a usable filename." };
  if (file.size <= 0) return { error: "This file is empty." };
  if (file.size > DEMO_ARCHIVE_MAX_FILE_BYTES) {
    return { error: "This live demo accepts files up to 8 MB each." };
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mediaType = extensionTypes[extension];
  if (!mediaType) {
    return {
      error: "Use a document, photograph, audio recording, or video in a supported format.",
    };
  }
  return { mediaType };
}

export function uploadDemoArchiveFile(
  file: File,
  metadata: DemoArchiveUploadMetadata,
  onProgress: (progress: number) => void,
): Promise<DemoArchiveUploadResult> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append("files", file, file.name);
    body.append("metadata", JSON.stringify(metadata));
    request.open("POST", "/api/demo/archive");
    request.setRequestHeader("Idempotency-Key", metadata.clientId);
    request.responseType = "json";
    request.timeout = 120_000;
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    });
    request.addEventListener("load", () => {
      const payload: unknown = request.response;
      if (request.status < 200 || request.status >= 300) {
        const fallback = request.status === 401
          ? "Sign in with an authorized archive account before saving private originals."
          : "The private upload could not be saved.";
        reject(new DemoArchiveApiError(responseError(payload, fallback), request.status));
        return;
      }
      const result = uploadedRecordFromUnknown(payload);
      if (!result) {
        reject(new Error(uploadRejectionFromUnknown(payload) ?? "The archive accepted the request but returned an unrecognized record."));
        return;
      }
      onProgress(100);
      resolve(result);
    });
    request.addEventListener("error", () => {
      reject(new Error("The archive connection was interrupted during upload."));
    });
    request.addEventListener("abort", () => {
      reject(new Error("The upload was cancelled."));
    });
    request.addEventListener("timeout", () => {
      reject(new Error("The private upload took too long. Retry this original; its idempotency key prevents a duplicate record."));
    });
    request.send(body);
  });
}

export function formatArchiveBytes(bytes: number): string {
  if (!bytes) return "Size not reported";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
