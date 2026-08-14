import { describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import { createPrivateArchiveItem, UploadValidationError } from "@/lib/uploads/validation";

const family: Actor = { userId: "family-user", email: "family@test", displayName: "Family", roles: ["family"], familyId: "family-demo", mfaVerified: true };
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
});
