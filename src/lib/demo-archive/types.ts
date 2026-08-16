export const DEMO_ARCHIVE_ITEM_TYPES = [
  "document",
  "photograph",
  "audio",
  "video",
] as const;

export type DemoArchiveItemType = (typeof DEMO_ARCHIVE_ITEM_TYPES)[number];
export type DemoArchiveStatus =
  | "needs-review"
  | "processing"
  | "ready"
  | "approved-private";
export type DemoArchiveExtractionStatus =
  | "text-ready"
  | "metadata-only"
  | "awaiting-ocr"
  | "awaiting-transcription"
  | "awaiting-text-extraction";
export type DemoArchiveScanStatus = "quarantined" | "cleared" | "blocked";

export interface DemoArchiveRecord {
  id: string;
  title: string;
  survivorName: string;
  itemType: DemoArchiveItemType;
  mediaType: DemoArchiveItemType;
  mimeType: string;
  originalFilename: string;
  byteSize: number;
  fileSize: number;
  sourceContributor: string;
  originalLanguage: string;
  consentRights: string;
  rightsStatement: string;
  historicalDate?: string;
  notes?: string;
  tags: string[];
  visibility: "private";
  status: DemoArchiveStatus;
  reviewStatus: DemoArchiveStatus;
  extractionStatus: DemoArchiveExtractionStatus;
  scanStatus: DemoArchiveScanStatus;
  createdAt: string;
  uploadedAt: string;
  previewUrl?: string;
}

export interface DemoArchiveStoredRecord extends DemoArchiveRecord {
  workspaceId: string;
  checksumSha256: string;
  extractedText?: string;
  previewable: boolean;
}

export interface DemoArchiveContentRecord {
  record: DemoArchiveStoredRecord;
  content: Uint8Array<ArrayBuffer>;
}

export interface DemoArchiveListInput {
  query: string;
  survivor: string;
  itemType: DemoArchiveItemType | "all";
  status: DemoArchiveStatus | "all";
  page: number;
  pageSize: number;
}

export interface DemoArchiveListResult {
  items: DemoArchiveStoredRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: {
    survivors: string[];
    types: Array<{ value: DemoArchiveItemType; count: number }>;
    statuses: Array<{ value: DemoArchiveStatus; count: number }>;
  };
}
