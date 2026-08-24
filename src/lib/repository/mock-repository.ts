import { randomUUID } from "node:crypto";
import type { Actor } from "@/lib/auth/policy";
import { can } from "@/lib/auth/policy";
import type { ArchiveItem, ReviewDecision } from "@/lib/domain/types";
import {
  seedArchiveItems,
  seedFamilies,
  seedPublicReleases,
  seedSources,
  seedStories,
  seedSurvivors,
  seedTimelineEvents,
  seedUsers,
} from "@/lib/data/seed";
import { getPublicCatalog } from "@/lib/data/public-catalog";
import type { ArchiveRepository, PrivateUploadRecord } from "@/lib/repository/types";
import {
  RepositoryAuthorizationError,
  RepositoryValidationError,
} from "@/lib/repository/types";

// Runtime state lives on globalThis for the same reason as the database
// client: in development, route handlers and server components compile into
// separate module graphs, and module-local arrays would give the upload API
// and the upload page two different stores.
const mockStateGlobal = globalThis as typeof globalThis & {
  hmmsaMockRepositoryState?: {
    runtimeItems: ArchiveItem[];
    runtimeUploads: PrivateUploadRecord[];
    runtimeDecisions: ReviewDecision[];
  };
};
mockStateGlobal.hmmsaMockRepositoryState ??= {
  runtimeItems: [...seedArchiveItems],
  runtimeUploads: [],
  runtimeDecisions: [],
};
const { runtimeItems, runtimeUploads, runtimeDecisions } =
  mockStateGlobal.hmmsaMockRepositoryState;

function requirePermission(actor: Actor, action: Parameters<typeof can>[1]): void {
  if (!can(actor, action)) throw new RepositoryAuthorizationError("Access denied.");
}

function validateAssociation(actor: Actor, item: ArchiveItem): void {
  const survivor = item.survivorId
    ? seedSurvivors.find((candidate) => candidate.id === item.survivorId)
    : undefined;
  const familyId = item.familyId ?? survivor?.familyId;
  if (!familyId || !seedFamilies.some((family) => family.id === familyId)) {
    throw new RepositoryValidationError("The selected family association does not exist.");
  }
  if (survivor && item.familyId && survivor.familyId !== item.familyId) {
    throw new RepositoryValidationError("The survivor and family associations do not match.");
  }
  const staffAllowed = can(actor, "create_record") || can(actor, "upload_original");
  const familyAllowed = can(actor, "contribute_upload", familyId);
  if (!staffAllowed && !familyAllowed) {
    throw new RepositoryAuthorizationError("This account cannot contribute to that family group.");
  }
}

export const mockArchiveRepository: ArchiveRepository = {
  async publicCatalog(locale) {
    return getPublicCatalog(locale);
  },

  async curatorWorkspace(actor) {
    requirePermission(actor, "view_archive_workspace");
    return {
      survivors: [...seedSurvivors],
      archiveItems: [...runtimeItems],
      sources: [...seedSources],
      stories: [...seedStories],
      timelineEvents: [...seedTimelineEvents],
      releases: [...seedPublicReleases],
      facts: [],
    };
  },

  async familyWorkspace(actor) {
    if (!actor.familyId || !can(actor, "view_family_workspace", actor.familyId)) {
      throw new RepositoryAuthorizationError("Access denied.");
    }
    const family = seedFamilies.find((candidate) => candidate.id === actor.familyId);
    if (!family) return null;
    return {
      family,
      survivors: seedSurvivors.filter((survivor) => survivor.familyId === actor.familyId),
      archiveItems: runtimeItems.filter((item) => item.familyId === actor.familyId),
    };
  },

  async adminUsers(actor) {
    requirePermission(actor, "manage_access");
    return [...seedUsers];
  },

  async uploadContext(actor) {
    requirePermission(actor, "upload_original");
    return {
      families: [...seedFamilies],
      survivors: [...seedSurvivors],
      recentUploads: runtimeItems
        .filter((item) => item.uploadedBy === actor.userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8),
    };
  },

  async validatePrivateUpload(actor, archiveItem) {
    validateAssociation(actor, archiveItem);
  },

  async persistPrivateUpload(actor, record) {
    validateAssociation(actor, record.archiveItem);
    if (
      record.archiveItem.visibility !== "private" ||
      record.archiveItem.reviewStatus !== "pending" ||
      record.archiveItem.uploadedBy !== actor.userId ||
      record.fileVersion.archiveItemId !== record.archiveItem.id ||
      record.auditEvent.entityId !== record.archiveItem.id
    ) {
      throw new RepositoryValidationError("Private upload persistence invariants failed.");
    }
    runtimeItems.push(record.archiveItem);
    runtimeUploads.push(record);
  },

  async archiveItemDetail(actor, itemId) {
    requirePermission(actor, "view_archive_workspace");
    const item = runtimeItems.find((candidate) => candidate.id === itemId);
    if (!item) return null;
    return {
      item,
      fileVersions: runtimeUploads
        .filter((record) => record.fileVersion.archiveItemId === itemId)
        .map((record) => record.fileVersion)
        .sort((a, b) => b.versionNumber - a.versionNumber),
      // Reversed before sorting so decisions sharing a timestamp — two clicks
      // inside the same millisecond — still read newest first.
      decisions: runtimeDecisions
        .filter((decision) => decision.entityId === itemId)
        .reverse()
        .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)),
    };
  },

  async recordReviewDecision(actor, input) {
    requirePermission(actor, "review_content");
    const index = runtimeItems.findIndex((candidate) => candidate.id === input.itemId);
    if (index === -1) {
      throw new RepositoryValidationError("That upload no longer exists.");
    }
    const decidedAt = new Date().toISOString();
    // Visibility is deliberately preserved: a decision is judgement, not publication.
    const updated: ArchiveItem = {
      ...runtimeItems[index],
      reviewStatus: input.decision === "approve" ? "approved" : "rejected",
      updatedAt: decidedAt,
    };
    runtimeItems[index] = updated;
    runtimeDecisions.push({
      id: randomUUID(),
      entityType: "archive_item",
      entityId: input.itemId,
      decision: input.decision,
      rationale: input.rationale,
      decidedBy: actor.userId,
      decidedAt,
    });
    return updated;
  },
};

export function resetMockUploadsForTests(): void {
  // Replaces every entry, not just appended ones: a review decision rewrites a
  // seeded item in place, so truncating alone would leak state between tests.
  runtimeItems.splice(0, runtimeItems.length, ...seedArchiveItems);
  runtimeUploads.splice(0);
  runtimeDecisions.splice(0);
}
