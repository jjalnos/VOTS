import { afterEach, describe, expect, it } from "vitest";
import { createAuditEvent } from "@/lib/audit/events";
import type { Actor } from "@/lib/auth/policy";
import { can } from "@/lib/auth/policy";
import { workspaceLinksFor } from "@/lib/auth/workspace-links";
import type { FileVersion } from "@/lib/domain/types";
import {
  mockArchiveRepository,
  resetMockUploadsForTests,
} from "@/lib/repository/mock-repository";
import { RepositoryAuthorizationError, RepositoryValidationError } from "@/lib/repository/types";
import { createPrivateArchiveItem } from "@/lib/uploads/validation";

const curator: Actor = {
  userId: "user-curator-demo",
  email: "curator@archive.local",
  displayName: "Curator",
  roles: ["curator"],
  mfaVerified: true,
};

const family: Actor = {
  userId: "user-family-demo",
  email: "family@archive.local",
  displayName: "Family",
  roles: ["family"],
  familyId: "family-demo",
  mfaVerified: true,
};

const viewer: Actor = {
  userId: "user-viewer-demo",
  email: "viewer@archive.local",
  displayName: "Viewer",
  roles: ["viewer"],
  mfaVerified: true,
};

async function seedUpload(id: string) {
  const archiveItem = createPrivateArchiveItem(
    {
      familyId: "family-demo",
      title: "Letter awaiting review",
      itemType: "document",
      sourceContributor: "Invited contributor",
      originalLanguage: "en",
      consentRights: "permission",
      rightsStatement: "Permission recorded for curator review.",
    },
    family,
    { id, now: "2026-08-24T00:00:00.000Z" },
  );
  const fileVersion: FileVersion = {
    id: `file-${id}`,
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
  const auditEvent = createAuditEvent(
    family,
    {
      action: "archive_item.uploaded_private",
      entityType: "archive_item",
      entityId: archiveItem.id,
      familyId: archiveItem.familyId,
      metadata: { visibility: "private" },
    },
    archiveItem.createdAt,
  );
  await mockArchiveRepository.persistPrivateUpload(family, { archiveItem, fileVersion, auditEvent });
  return archiveItem;
}

afterEach(() => resetMockUploadsForTests());

describe("archive item detail", () => {
  it("returns the record with its stored original for a curator", async () => {
    const item = await seedUpload("upload-detail-test");
    const detail = await mockArchiveRepository.archiveItemDetail(curator, item.id);
    expect(detail?.item.id).toBe(item.id);
    expect(detail?.fileVersions[0]?.originalFilename).toBe("letter.pdf");
    expect(detail?.decisions).toEqual([]);
  });

  it("returns null for an unknown record rather than throwing", async () => {
    expect(await mockArchiveRepository.archiveItemDetail(curator, "missing")).toBeNull();
  });

  it("refuses accounts without archive workspace access", async () => {
    const item = await seedUpload("upload-detail-denied");
    await expect(mockArchiveRepository.archiveItemDetail(viewer, item.id)).rejects.toBeInstanceOf(
      RepositoryAuthorizationError,
    );
  });
});

describe("review decisions", () => {
  it("approves without publishing: review status advances, visibility does not", async () => {
    const item = await seedUpload("upload-approve-test");
    expect(item.visibility).toBe("private");
    const updated = await mockArchiveRepository.recordReviewDecision(curator, {
      itemId: item.id,
      decision: "approve",
      rationale: "Provenance checked against the donor file.",
    });
    expect(updated.reviewStatus).toBe("approved");
    // The invariant the old review page promised in prose, now enforced in code.
    expect(updated.visibility).toBe("private");
  });

  it("records a returned upload with the reason a reviewer gave", async () => {
    const item = await seedUpload("upload-reject-test");
    const updated = await mockArchiveRepository.recordReviewDecision(curator, {
      itemId: item.id,
      decision: "reject",
      rationale: "Rights statement does not cover publication.",
    });
    expect(updated.reviewStatus).toBe("rejected");
    const detail = await mockArchiveRepository.archiveItemDetail(curator, item.id);
    expect(detail?.decisions).toHaveLength(1);
    expect(detail?.decisions[0]?.decision).toBe("reject");
    expect(detail?.decisions[0]?.rationale).toBe("Rights statement does not cover publication.");
    expect(detail?.decisions[0]?.decidedBy).toBe(curator.userId);
  });

  it("keeps every decision in history, newest first", async () => {
    const item = await seedUpload("upload-history-test");
    await mockArchiveRepository.recordReviewDecision(curator, {
      itemId: item.id,
      decision: "reject",
      rationale: "Missing rights.",
    });
    await mockArchiveRepository.recordReviewDecision(curator, {
      itemId: item.id,
      decision: "approve",
      rationale: "Rights supplied.",
    });
    const detail = await mockArchiveRepository.archiveItemDetail(curator, item.id);
    expect(detail?.item.reviewStatus).toBe("approved");
    expect(detail?.decisions.map((entry) => entry.decision)).toEqual(["approve", "reject"]);
  });

  it("refuses a decision from an account that cannot review", async () => {
    const item = await seedUpload("upload-decision-denied");
    await expect(
      mockArchiveRepository.recordReviewDecision(family, {
        itemId: item.id,
        decision: "approve",
        rationale: "Not mine to make.",
      }),
    ).rejects.toBeInstanceOf(RepositoryAuthorizationError);
  });

  it("refuses a decision on a record that does not exist", async () => {
    await expect(
      mockArchiveRepository.recordReviewDecision(curator, {
        itemId: "missing",
        decision: "approve",
        rationale: "Nothing to approve.",
      }),
    ).rejects.toBeInstanceOf(RepositoryValidationError);
  });

  it("still requires MFA to review", () => {
    expect(can({ ...curator, mfaVerified: false }, "review_content")).toBe(false);
  });
});

describe("workspace navigation after the merge", () => {
  it("no longer offers a separate review queue", () => {
    const hrefs = workspaceLinksFor(curator, "en").map(([, href]) => href);
    expect(hrefs).not.toContain("/curator/review");
    expect(hrefs).toContain("/curator/archive");
  });
});
