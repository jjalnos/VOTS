import type { ArchiveItem, Role } from "@/lib/domain/types";

export type Action =
  | "manage_access"
  | "manage_policy"
  | "view_audit"
  | "create_record"
  | "upload_original"
  | "send_communications"
  | "review_content"
  | "run_external_research"
  | "publish_content"
  | "export_research_packet"
  | "contribute_upload"
  | "view_family_workspace"
  | "view_archive_workspace"
  | "view_survivor_registry";

export interface Actor {
  userId: string;
  email: string;
  displayName: string;
  roles: Role[];
  familyId?: string;
  mfaVerified: boolean;
}

const permissions: Record<Role, ReadonlySet<Action>> = {
  // upload_original lets an administrator add originals through the archive
  // upload page without inheriting curatorial duties (registry edits, review,
  // publication stay with the curator role).
  admin: new Set([
    "manage_access",
    "manage_policy",
    "view_audit",
    "upload_original",
    "send_communications",
  ]),
  curator: new Set([
    "create_record",
    "view_survivor_registry",
    "review_content",
    "run_external_research",
    "publish_content",
    "export_research_packet",
    "view_archive_workspace",
  ]),
  family: new Set(["contribute_upload", "view_family_workspace"]),
  // A shared, read-only account for showing the registry. It cannot reach the
  // private archive workspace, and it never sees living people's contact
  // details — see redactRegistryContact.
  viewer: new Set(["view_survivor_registry"]),
};

const mfaActions = new Set<Action>([
  "manage_access",
  "manage_policy",
  "view_audit",
  "create_record",
  "upload_original",
  "send_communications",
  "review_content",
  "run_external_research",
  "publish_content",
  "export_research_packet",
  "view_archive_workspace",
]);

export function can(
  actor: Actor | null,
  action: Action,
  resourceFamilyId?: string,
): boolean {
  if (!actor || !actor.roles.some((role) => permissions[role].has(action))) {
    return false;
  }

  if (mfaActions.has(action) && !actor.mfaVerified) {
    return false;
  }

  if (
    actor.roles.includes("family") &&
    (action === "contribute_upload" || action === "view_family_workspace")
  ) {
    return Boolean(actor.familyId && resourceFamilyId && actor.familyId === resourceFamilyId);
  }

  return true;
}

export function visibleArchiveItems(items: ArchiveItem[], actor: Actor | null): ArchiveItem[] {
  if (!actor) {
    return items.filter(
      (item) => item.visibility === "public" && item.reviewStatus === "approved",
    );
  }

  if (actor.roles.includes("curator") && actor.mfaVerified) {
    return items;
  }

  if (actor.roles.includes("family") && actor.familyId) {
    return items.filter((item) => item.familyId === actor.familyId);
  }

  return [];
}
