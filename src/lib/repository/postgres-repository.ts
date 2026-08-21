import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  archiveItems as archiveItemsTable,
  auditEvents as auditEventsTable,
  extractedFacts as extractedFactsTable,
  families as familiesTable,
  familyMemberships as familyMembershipsTable,
  fileVersions as fileVersionsTable,
  publicReleases as publicReleasesTable,
  sources as sourcesTable,
  stories as storiesTable,
  survivors as survivorsTable,
  timelineEvents as timelineEventsTable,
  userRoles as userRolesTable,
  users as usersTable,
} from "@/db/schema";
import { can, type Actor } from "@/lib/auth/policy";
import type {
  ArchiveItem,
  ExtractedFact,
  Family,
  Locale,
  PublicRelease,
  Source,
  Story,
  Survivor,
  TimelineEvent,
  User,
} from "@/lib/domain/types";
import { buildPublicCatalog } from "@/lib/publication/catalog";
import type {
  ArchiveRepository,
  CuratorWorkspace,
  PrivateUploadRecord,
} from "@/lib/repository/types";
import {
  RepositoryAuthorizationError,
  RepositoryValidationError,
} from "@/lib/repository/types";

type ArchiveItemRow = typeof archiveItemsTable.$inferSelect;
type ExtractedFactRow = typeof extractedFactsTable.$inferSelect;
type FamilyRow = typeof familiesTable.$inferSelect;
type PublicReleaseRow = typeof publicReleasesTable.$inferSelect;
type SourceRow = typeof sourcesTable.$inferSelect;
type StoryRow = typeof storiesTable.$inferSelect;
type SurvivorRow = typeof survivorsTable.$inferSelect;
type TimelineEventRow = typeof timelineEventsTable.$inferSelect;

const itemTypes = new Set<ArchiveItem["itemType"]>([
  "document",
  "photograph",
  "audio",
  "video",
  "artifact",
  "other",
]);
const rightsTypes = new Set<ArchiveItem["consentRights"]>([
  "owned",
  "permission",
  "documented_restriction",
]);
const publicEntityTypes = new Set<PublicRelease["entityType"]>([
  "survivor",
  "archive_item",
  "story",
  "timeline_event",
]);
const factGenerators = new Set<ExtractedFact["generatedBy"]>([
  "human",
  "mock_ai",
  "local_ai",
  "openai",
]);

function iso(value: Date): string {
  return value.toISOString();
}

function mapFamily(row: FamilyRow): Family {
  return {
    id: row.id,
    name: row.name,
    invitationOnly: true,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapSurvivor(row: SurvivorRow): Survivor {
  return {
    id: row.id,
    slug: row.slug,
    familyId: row.familyId,
    displayName: row.displayName,
    summary: row.summary,
    originalLanguage: row.originalLanguage,
    reviewStatus: row.reviewStatus,
    isDemonstration: row.isDemonstration,
    portrait: row.portraitUrl
      ? {
          url: row.portraitUrl,
          credit: row.portraitCredit ?? "",
          rights: row.portraitRights ?? "",
        }
      : undefined,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapArchiveItem(row: ArchiveItemRow): ArchiveItem {
  const itemType = itemTypes.has(row.itemType as ArchiveItem["itemType"])
    ? (row.itemType as ArchiveItem["itemType"])
    : "other";
  const consentRights = rightsTypes.has(row.consentRights as ArchiveItem["consentRights"])
    ? (row.consentRights as ArchiveItem["consentRights"])
    : "documented_restriction";
  return {
    id: row.id,
    survivorId: row.survivorId ?? undefined,
    familyId: row.familyId ?? undefined,
    title: row.title,
    itemType,
    sourceContributor: row.sourceContributor,
    originalLanguage: row.originalLanguage,
    consentRights,
    rightsStatement: row.rightsStatement,
    visibility: row.visibility,
    reviewStatus: row.reviewStatus,
    uploadedBy: row.uploadedBy,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapSource(row: SourceRow): Source {
  return {
    id: row.id,
    title: row.title,
    publisher: row.publisher,
    url: row.url ?? undefined,
    citation: row.citation,
    approvalStatus: row.approvalStatus,
    approvedBy: row.approvedBy ?? undefined,
    approvedAt: row.approvedAt ? iso(row.approvedAt) : undefined,
    createdAt: iso(row.createdAt),
  };
}

function mapStory(row: StoryRow): Story {
  return {
    id: row.id,
    slug: row.slug,
    survivorId: row.survivorId ?? undefined,
    familyId: row.familyId ?? undefined,
    title: row.title,
    dek: row.dek,
    body: row.body,
    sourceIds: row.sourceIds,
    reviewStatus: row.reviewStatus,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapTimelineEvent(row: TimelineEventRow): TimelineEvent {
  return {
    id: row.id,
    survivorId: row.survivorId ?? undefined,
    familyId: row.familyId ?? undefined,
    dateLabel: row.dateLabel,
    sortDate: row.sortDate ? iso(row.sortDate) : undefined,
    title: row.title,
    description: row.description,
    sourceIds: row.sourceIds,
    reviewStatus: row.reviewStatus,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapPublicRelease(row: PublicReleaseRow): PublicRelease | null {
  if (
    !publicEntityTypes.has(row.entityType as PublicRelease["entityType"]) ||
    (row.locale !== "en" && row.locale !== "es")
  ) {
    return null;
  }
  return {
    id: row.id,
    entityType: row.entityType as PublicRelease["entityType"],
    entityId: row.entityId,
    locale: row.locale,
    status: row.status,
    sourceIds: row.sourceIds,
    rightsSnapshot: row.rightsSnapshot,
    publishedBy: row.publishedBy ?? undefined,
    publishedAt: row.publishedAt ? iso(row.publishedAt) : undefined,
    withdrawnAt: row.withdrawnAt ? iso(row.withdrawnAt) : undefined,
  };
}

function mapExtractedFact(row: ExtractedFactRow): ExtractedFact {
  const generatedBy = factGenerators.has(row.generatedBy as ExtractedFact["generatedBy"])
    ? (row.generatedBy as ExtractedFact["generatedBy"])
    : "human";
  return {
    id: row.id,
    archiveItemId: row.archiveItemId,
    field: row.field,
    value: row.value,
    confidence: row.confidence ?? undefined,
    sourceLocator: row.sourceLocator,
    status: row.status,
    generatedBy,
    reviewedBy: row.reviewedBy ?? undefined,
    reviewedAt: row.reviewedAt ? iso(row.reviewedAt) : undefined,
    createdAt: iso(row.createdAt),
  };
}

async function validateAssociation(actor: Actor, item: ArchiveItem): Promise<void> {
  const db = getDatabase();
  const familyRows = item.familyId
    ? await db.select({ id: familiesTable.id }).from(familiesTable).where(eq(familiesTable.id, item.familyId)).limit(1)
    : [];
  const survivorRows = item.survivorId
    ? await db
        .select({ id: survivorsTable.id, familyId: survivorsTable.familyId })
        .from(survivorsTable)
        .where(eq(survivorsTable.id, item.survivorId))
        .limit(1)
    : [];
  const survivor = survivorRows[0];
  const familyId = item.familyId ?? survivor?.familyId;
  if (!familyId || (item.familyId && !familyRows[0]) || (item.survivorId && !survivor)) {
    throw new RepositoryValidationError("The selected family or survivor association does not exist.");
  }
  if (survivor && item.familyId && survivor.familyId !== item.familyId) {
    throw new RepositoryValidationError("The survivor and family associations do not match.");
  }
  if (!can(actor, "create_record") && !can(actor, "contribute_upload", familyId)) {
    throw new RepositoryAuthorizationError("This account cannot contribute to that family group.");
  }
}

async function loadCuratorWorkspace(actor: Actor): Promise<CuratorWorkspace> {
  if (!can(actor, "view_archive_workspace")) {
    throw new RepositoryAuthorizationError("Access denied.");
  }
  const db = getDatabase();
  const [survivorRows, itemRows, sourceRows, storyRows, eventRows, releaseRows, factRows] =
    await Promise.all([
      // Ordered so the catalog is deterministic: without this, PostgreSQL
      // returns heap order, and a portrait update silently moves a survivor
      // to the end of every list that reads the catalog.
      db.select().from(survivorsTable).orderBy(survivorsTable.slug),
      db.select().from(archiveItemsTable),
      db.select().from(sourcesTable),
      db.select().from(storiesTable),
      db.select().from(timelineEventsTable).orderBy(asc(timelineEventsTable.sortDate)),
      db.select().from(publicReleasesTable),
      db.select().from(extractedFactsTable),
    ]);
  return {
    survivors: survivorRows.map(mapSurvivor),
    archiveItems: itemRows.map(mapArchiveItem),
    sources: sourceRows.map(mapSource),
    stories: storyRows.map(mapStory),
    timelineEvents: eventRows.map(mapTimelineEvent),
    releases: releaseRows.map(mapPublicRelease).filter((row): row is PublicRelease => Boolean(row)),
    facts: factRows.map(mapExtractedFact),
  };
}

export const postgresArchiveRepository: ArchiveRepository = {
  async publicCatalog(locale: Locale) {
    const db = getDatabase();
    const [survivorRows, itemRows, sourceRows, storyRows, eventRows, releaseRows] =
      await Promise.all([
        db.select().from(survivorsTable).where(eq(survivorsTable.reviewStatus, "approved")),
        db
          .select()
          .from(archiveItemsTable)
          .where(
            and(
              eq(archiveItemsTable.reviewStatus, "approved"),
              eq(archiveItemsTable.visibility, "public"),
            ),
          ),
        db.select().from(sourcesTable).where(eq(sourcesTable.approvalStatus, "approved")),
        db.select().from(storiesTable).where(eq(storiesTable.reviewStatus, "approved")),
        db
          .select()
          .from(timelineEventsTable)
          .where(eq(timelineEventsTable.reviewStatus, "approved"))
          .orderBy(asc(timelineEventsTable.sortDate)),
        db
          .select()
          .from(publicReleasesTable)
          .where(
            and(
              eq(publicReleasesTable.locale, locale),
              eq(publicReleasesTable.status, "published"),
              isNotNull(publicReleasesTable.publishedAt),
            ),
          ),
      ]);
    return buildPublicCatalog(
      {
        survivors: survivorRows.map(mapSurvivor),
        archiveItems: itemRows.map(mapArchiveItem),
        sources: sourceRows.map(mapSource),
        stories: storyRows.map(mapStory),
        timelineEvents: eventRows.map(mapTimelineEvent),
        releases: releaseRows
          .map(mapPublicRelease)
          .filter((row): row is PublicRelease => Boolean(row)),
      },
      locale,
    );
  },

  curatorWorkspace: loadCuratorWorkspace,

  async familyWorkspace(actor) {
    if (!actor.familyId || !can(actor, "view_family_workspace", actor.familyId)) {
      throw new RepositoryAuthorizationError("Access denied.");
    }
    const db = getDatabase();
    const [familyRows, survivorRows, itemRows] = await Promise.all([
      db.select().from(familiesTable).where(eq(familiesTable.id, actor.familyId)).limit(1),
      db.select().from(survivorsTable).where(eq(survivorsTable.familyId, actor.familyId)),
      db.select().from(archiveItemsTable).where(eq(archiveItemsTable.familyId, actor.familyId)),
    ]);
    const family = familyRows[0];
    if (!family) return null;
    return {
      family: mapFamily(family),
      survivors: survivorRows.map(mapSurvivor),
      archiveItems: itemRows.map(mapArchiveItem),
    };
  },

  async adminUsers(actor) {
    if (!can(actor, "manage_access")) {
      throw new RepositoryAuthorizationError("Access denied.");
    }
    const db = getDatabase();
    const [userRows, roleRows, membershipRows] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(userRolesTable),
      db
        .select()
        .from(familyMembershipsTable)
        .where(
          and(
            isNotNull(familyMembershipsTable.acceptedAt),
            isNull(familyMembershipsTable.revokedAt),
          ),
        ),
    ]);
    return userRows.map<User>((user) => {
      const roles = roleRows.filter((row) => row.userId === user.id).map((row) => row.role);
      const familyIds = membershipRows
        .filter((row) => row.userId === user.id)
        .map((row) => row.familyId);
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles,
        familyId: familyIds.length === 1 ? familyIds[0] : undefined,
        mfaRequired: user.mfaRequired,
        active: user.active,
        createdAt: iso(user.createdAt),
        updatedAt: iso(user.updatedAt),
      };
    });
  },

  validatePrivateUpload: validateAssociation,

  async persistPrivateUpload(actor, record: PrivateUploadRecord) {
    await validateAssociation(actor, record.archiveItem);
    const { archiveItem, fileVersion, auditEvent } = record;
    if (
      archiveItem.visibility !== "private" ||
      archiveItem.reviewStatus !== "pending" ||
      archiveItem.uploadedBy !== actor.userId ||
      fileVersion.archiveItemId !== archiveItem.id ||
      auditEvent.entityId !== archiveItem.id
    ) {
      throw new RepositoryValidationError("Private upload persistence invariants failed.");
    }
    const db = getDatabase();
    await db.transaction(async (transaction) => {
      await transaction.insert(archiveItemsTable).values({
        id: archiveItem.id,
        survivorId: archiveItem.survivorId,
        familyId: archiveItem.familyId,
        title: archiveItem.title,
        itemType: archiveItem.itemType,
        sourceContributor: archiveItem.sourceContributor,
        originalLanguage: archiveItem.originalLanguage,
        consentRights: archiveItem.consentRights,
        rightsStatement: archiveItem.rightsStatement,
        visibility: "private",
        reviewStatus: "pending",
        uploadedBy: actor.userId,
        createdAt: new Date(archiveItem.createdAt),
        updatedAt: new Date(archiveItem.updatedAt),
      });
      await transaction.insert(fileVersionsTable).values({
        id: fileVersion.id,
        archiveItemId: archiveItem.id,
        versionNumber: fileVersion.versionNumber,
        storageProvider: fileVersion.storageProvider,
        storageKey: fileVersion.storageKey,
        originalFilename: fileVersion.originalFilename,
        mediaType: fileVersion.mediaType,
        byteSize: fileVersion.byteSize,
        checksumSha256: fileVersion.checksumSha256,
        createdBy: actor.userId,
        createdAt: new Date(fileVersion.createdAt),
      });
      await transaction.insert(auditEventsTable).values({
        id: auditEvent.id,
        actorUserId: actor.userId,
        action: auditEvent.action,
        entityType: auditEvent.entityType,
        entityId: archiveItem.id,
        familyId: archiveItem.familyId,
        metadata: auditEvent.metadata,
        occurredAt: new Date(auditEvent.occurredAt),
      });
    });
  },
};
