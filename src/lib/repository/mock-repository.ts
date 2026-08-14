import type { Actor } from "@/lib/auth/policy";
import { can } from "@/lib/auth/policy";
import type { ArchiveItem } from "@/lib/domain/types";
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

const runtimeItems = [...seedArchiveItems];
const runtimeUploads: PrivateUploadRecord[] = [];

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
  const curatorAllowed = can(actor, "create_record");
  const familyAllowed = can(actor, "contribute_upload", familyId);
  if (!curatorAllowed && !familyAllowed) {
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
};

export function resetMockUploadsForTests(): void {
  runtimeItems.splice(seedArchiveItems.length);
  runtimeUploads.splice(0);
}
