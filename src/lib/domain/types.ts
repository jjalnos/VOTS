export const ROLES = ["admin", "curator", "family", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export type LocalizedText = Record<Locale, string>;
export type ReviewStatus = "pending" | "in_review" | "approved" | "rejected";
export type Visibility = "private" | "family" | "public";
export type PublicationStatus = "draft" | "published" | "withdrawn";
export type SuggestionStatus = "suggested" | "approved" | "rejected";

export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  familyId?: string;
  mfaRequired: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Family {
  id: string;
  name: string;
  invitationOnly: true;
  createdAt: string;
  updatedAt: string;
}

export interface Survivor {
  id: string;
  slug: string;
  familyId: string;
  displayName: LocalizedText;
  summary: LocalizedText;
  originalLanguage: Locale | "other";
  reviewStatus: ReviewStatus;
  isDemonstration: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Relationship {
  id: string;
  familyId: string;
  survivorId: string;
  relatedUserId?: string;
  relationshipLabel: LocalizedText;
  reviewStatus: ReviewStatus;
  createdBy: string;
  createdAt: string;
}

export interface ArchiveItem {
  id: string;
  survivorId?: string;
  familyId?: string;
  title: string;
  itemType: "document" | "photograph" | "audio" | "video" | "artifact" | "other";
  sourceContributor: string;
  originalLanguage: Locale | "other";
  consentRights: "owned" | "permission" | "documented_restriction";
  rightsStatement: string;
  visibility: Visibility;
  reviewStatus: ReviewStatus;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileVersion {
  id: string;
  archiveItemId: string;
  versionNumber: number;
  storageProvider: "local_mock" | "google_drive" | "object_storage";
  storageKey: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  checksumSha256: string;
  createdBy: string;
  createdAt: string;
}

export interface ExtractedFact {
  id: string;
  archiveItemId: string;
  field: string;
  value: LocalizedText;
  confidence?: number;
  sourceLocator: string;
  status: SuggestionStatus;
  generatedBy: "human" | "mock_ai" | "local_ai" | "openai";
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface Source {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  citation: LocalizedText;
  approvalStatus: ReviewStatus;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface Story {
  id: string;
  slug: string;
  survivorId?: string;
  familyId?: string;
  title: LocalizedText;
  dek: LocalizedText;
  body: LocalizedText;
  sourceIds: string[];
  reviewStatus: ReviewStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  survivorId?: string;
  familyId?: string;
  dateLabel: LocalizedText;
  sortDate?: string;
  title: LocalizedText;
  description: LocalizedText;
  sourceIds: string[];
  reviewStatus: ReviewStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewDecision {
  id: string;
  entityType: "archive_item" | "fact" | "source" | "story" | "timeline_event" | "translation" | "research";
  entityId: string;
  decision: "approve" | "reject" | "request_changes";
  rationale: string;
  decidedBy: string;
  decidedAt: string;
}

export interface PublicRelease {
  id: string;
  entityType: "survivor" | "archive_item" | "story" | "timeline_event";
  entityId: string;
  locale: Locale;
  status: PublicationStatus;
  sourceIds: string[];
  rightsSnapshot: string;
  publishedBy?: string;
  publishedAt?: string;
  withdrawnAt?: string;
}

export interface ChatCitation {
  id: string;
  label: string;
  href: string;
  sourceId: string;
}

export interface ChatSession {
  id: string;
  locale: Locale;
  visitorTokenHash?: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface AuditEvent {
  id: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  familyId?: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface PublicCatalog {
  survivors: Survivor[];
  stories: Story[];
  timelineEvents: TimelineEvent[];
  archiveItems: ArchiveItem[];
  sources: Source[];
  releases: PublicRelease[];
}
