import type { Actor } from "@/lib/auth/policy";
import type {
  ArchiveItem,
  AuditEvent,
  ExtractedFact,
  Family,
  FileVersion,
  Locale,
  PublicCatalog,
  PublicRelease,
  Source,
  Story,
  Survivor,
  TimelineEvent,
  User,
} from "@/lib/domain/types";

export interface CuratorWorkspace {
  survivors: Survivor[];
  archiveItems: ArchiveItem[];
  sources: Source[];
  stories: Story[];
  timelineEvents: TimelineEvent[];
  releases: PublicRelease[];
  facts: ExtractedFact[];
}

export interface FamilyWorkspace {
  family: Family;
  survivors: Survivor[];
  archiveItems: ArchiveItem[];
}

/**
 * Everything the archive upload page needs to offer real choices instead of
 * free-text identifiers: the family groups and survivors an administrator can
 * associate an original with, plus their own most recent uploads so a
 * contribution is immediately visible after it is stored.
 */
export interface UploadContext {
  families: Family[];
  survivors: Survivor[];
  recentUploads: ArchiveItem[];
}

export interface PrivateUploadRecord {
  archiveItem: ArchiveItem;
  fileVersion: FileVersion;
  auditEvent: AuditEvent;
}

export interface ArchiveRepository {
  publicCatalog(locale: Locale): Promise<PublicCatalog>;
  curatorWorkspace(actor: Actor): Promise<CuratorWorkspace>;
  familyWorkspace(actor: Actor): Promise<FamilyWorkspace | null>;
  adminUsers(actor: Actor): Promise<User[]>;
  uploadContext(actor: Actor): Promise<UploadContext>;
  validatePrivateUpload(actor: Actor, archiveItem: ArchiveItem): Promise<void>;
  persistPrivateUpload(actor: Actor, record: PrivateUploadRecord): Promise<void>;
}

export class RepositoryAuthorizationError extends Error {}

export class RepositoryValidationError extends Error {}
