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
  validatePrivateUpload(actor: Actor, archiveItem: ArchiveItem): Promise<void>;
  persistPrivateUpload(actor: Actor, record: PrivateUploadRecord): Promise<void>;
}

export class RepositoryAuthorizationError extends Error {}

export class RepositoryValidationError extends Error {}
