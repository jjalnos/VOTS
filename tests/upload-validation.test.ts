import { describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import {
  createPrivateArchiveItem,
  MAX_UPLOAD_BYTES,
  uploadFileIssues,
  UploadValidationError,
} from "@/lib/uploads/validation";

const family: Actor = { userId: "family-user", email: "family@test", displayName: "Family", roles: ["family"], familyId: "family-demo", mfaVerified: true };
const admin: Actor = { userId: "admin-user", email: "admin@test", displayName: "Admin", roles: ["admin"], mfaVerified: true };
const viewer: Actor = { userId: "viewer-user", email: "viewer@test", displayName: "Viewer", roles: ["viewer"], mfaVerified: true };
const valid = {
  familyId: "family-demo",
  title: "Letter scan",
  itemType: "document" as const,
  sourceContributor: "Invited family contributor",
  originalLanguage: "en" as const,
  consentRights: "permission" as const,
  rightsStatement: "Permission documented; curator review required.",
};

describe("upload validation", () => {
  it("defaults every accepted upload to private and pending", () => {
    const item = createPrivateArchiveItem(valid, family, { id: "upload-1", now: "2026-08-13T00:00:00.000Z" });
    expect(item.visibility).toBe("private");
    expect(item.reviewStatus).toBe("pending");
    expect(item.uploadedBy).toBe(family.userId);
  });

  it("rejects missing rights metadata", () => {
    expect(() => createPrivateArchiveItem({ ...valid, rightsStatement: "" }, family)).toThrow(UploadValidationError);
  });

  it("rejects contribution to another family", () => {
    expect(() => createPrivateArchiveItem({ ...valid, familyId: "other-family" }, family)).toThrow(UploadValidationError);
  });

  it("accepts an administrator upload into any family group", () => {
    const item = createPrivateArchiveItem({ ...valid, familyId: "other-family" }, admin);
    expect(item.visibility).toBe("private");
    expect(item.reviewStatus).toBe("pending");
    expect(item.uploadedBy).toBe(admin.userId);
  });

  it("rejects an administrator session that has not passed MFA", () => {
    expect(() => createPrivateArchiveItem(valid, { ...admin, mfaVerified: false })).toThrow(UploadValidationError);
  });

  it("rejects a viewer entirely", () => {
    expect(() => createPrivateArchiveItem(valid, viewer)).toThrow(UploadValidationError);
  });
});

describe("upload file checks", () => {
  it("accepts common archival formats up to the size limit", () => {
    expect(uploadFileIssues({ filename: "letter-scan.PDF", byteSize: 1024 })).toEqual([]);
    expect(uploadFileIssues({ filename: "portrait.jpeg", byteSize: MAX_UPLOAD_BYTES })).toEqual([]);
    expect(uploadFileIssues({ filename: "testimony.mp4", byteSize: 5 * 1024 * 1024 })).toEqual([]);
  });

  it("refuses executables, scripts, and extensionless files", () => {
    for (const filename of ["malware.exe", "script.sh", "page.html", "archive.zip", "noextension"]) {
      expect(uploadFileIssues({ filename, byteSize: 1024 }).length).toBeGreaterThan(0);
    }
  });

  it("refuses empty and oversized files", () => {
    expect(uploadFileIssues({ filename: "scan.jpg", byteSize: 0 })).toContain("The file is empty.");
    expect(
      uploadFileIssues({ filename: "scan.jpg", byteSize: MAX_UPLOAD_BYTES + 1 }),
    ).toContain("The file is larger than the 25 MB limit.");
  });
});
