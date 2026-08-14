import type { ArchiveItem, Role } from "@/lib/domain/types";

export type Action =
  | "manage_access"
  | "manage_policy"
  | "view_audit"
  | "create_record"
  | "review_content"
  | "run_external_research"
  | "publish_content"
  | "export_research_packet"
  | "contribute_upload"
  | "view_family_workspace"
  | "view_archive_workspace";

export interface Actor {
  userId: string;
  email: string;
  displayName: string;
  roles: Role[];
  familyId?: string;
  mfaVerified: boolean;
}

const permissions: Record<Role, ReadonlySet<Action>> = {
  admin: new Set(["manage_access", "manage_policy", "view_audit"]),
  curator: new Set([
    "create_record",
    "review_content",
    "run_external_research",
    "publish_content",
    "export_research_packet",
    "view_archive_workspace",
  ]),
  family: new Set(["contribute_upload", "view_family_workspace"]),
};

const mfaActions = new Set<Action>([
  "manage_access",
  "manage_policy",
  "view_audit",
  "create_record",
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
