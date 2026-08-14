import { afterEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import { createAuditEvent } from "@/lib/audit/events";
import type { FileVersion } from "@/lib/domain/types";
import { configuredDataAdapter } from "@/lib/repository";
import {
  mockArchiveRepository,
  resetMockUploadsForTests,
} from "@/lib/repository/mock-repository";
import { createPrivateArchiveItem } from "@/lib/uploads/validation";

const family: Actor = {
  userId: "user-family-demo",
  email: "family@archive.local",
  displayName: "Family",
  roles: ["family"],
  familyId: "family-demo",
  mfaVerified: true,
};

afterEach(() => resetMockUploadsForTests());

describe("repository boundary", () => {
  it("rejects unsupported data adapters", () => {
    expect(configuredDataAdapter("mock")).toBe("mock");
    expect(configuredDataAdapter("postgres")).toBe("postgres");
    expect(() => configuredDataAdapter("automatic")).toThrow(/Unsupported DATA_ADAPTER/);
  });

  it("persists only invariant-safe private uploads for the invited family", async () => {
    const archiveItem = createPrivateArchiveItem(
      {
        familyId: "family-demo",
        title: "Private family letter",
        itemType: "document",
        sourceContributor: "Invited contributor",
        originalLanguage: "en",
        consentRights: "permission",
        rightsStatement: "Permission recorded for curator review.",
      },
      family,
      { id: "upload-repository-test", now: "2026-08-13T00:00:00.000Z" },
    );
    const fileVersion: FileVersion = {
      id: "file-version-test",
      archiveItemId: archiveItem.id,
      versionNumber: 1,
      storageProvider: "local_mock",
      storageKey: "private/test",
      originalFilename: "letter.pdf",
      mediaType: "application/pdf",
      byteSize: 42,
      checksumSha256: "0".repeat(64),
      createdBy: family.userId,
      createdAt: archiveItem.createdAt,
    };
    const auditEvent = createAuditEvent(family, {
      action: "archive_item.uploaded_private",
      entityType: "archive_item",
      entityId: archiveItem.id,
      familyId: archiveItem.familyId,
      metadata: { visibility: "private" },
    }, archiveItem.createdAt);
    await mockArchiveRepository.persistPrivateUpload(family, { archiveItem, fileVersion, auditEvent });
    const workspace = await mockArchiveRepository.familyWorkspace(family);
    expect(workspace?.archiveItems.some((item) => item.id === archiveItem.id)).toBe(true);
    await expect(mockArchiveRepository.persistPrivateUpload(family, {
      archiveItem: { ...archiveItem, visibility: "public" },
      fileVersion,
      auditEvent,
    })).rejects.toThrow(/invariants/);
  });
});
