import { eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { auditEvents, userRoles, users } from "@/db/schema";
import { staffMfaRequired } from "@/lib/auth/mfa";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export const ADDITIONAL_ADMIN_CURATOR_CONFIRMATION =
  "PROVISION_ADDITIONAL_ADMIN_CURATOR";

export type AdditionalAdminCuratorProvisionStatus =
  | "disabled"
  | "created"
  | "already-present";

interface AdditionalAdminCuratorConfiguration {
  operationId: string;
  email: string;
  displayName: string;
  password: string;
  mfaRequired: boolean;
  mfaProviderReference: string | null;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configurationFromEnvironment(): AdditionalAdminCuratorConfiguration | null {
  const confirmation = process.env.PROVISION_ADMIN_CURATOR_CONFIRM?.trim();
  if (!confirmation) return null;

  // Read the plaintext only after the operation has been explicitly enabled,
  // then remove it from this process before doing validation or database work.
  const password = process.env.PROVISION_ADMIN_CURATOR_PASSWORD ?? "";
  delete process.env.PROVISION_ADMIN_CURATOR_PASSWORD;

  if (confirmation !== ADDITIONAL_ADMIN_CURATOR_CONFIRMATION) {
    throw new Error("The additional administrator/curator confirmation is invalid.");
  }

  const operationId = process.env.PROVISION_ADMIN_CURATOR_OPERATION_ID?.trim() ?? "";
  const email =
    process.env.PROVISION_ADMIN_CURATOR_EMAIL?.trim().toLocaleLowerCase("en") ?? "";
  const displayName = process.env.PROVISION_ADMIN_CURATOR_DISPLAY_NAME?.trim() ?? "";
  const mfaProviderReference =
    process.env.PROVISION_ADMIN_CURATOR_MFA_REFERENCE?.trim() || null;
  const mfaRequired = staffMfaRequired();

  if (!UUID_V4_PATTERN.test(operationId)) {
    throw new Error(
      "The additional administrator/curator operation needs a fresh UUID v4 operation ID.",
    );
  }
  if (!/^\S+@\S+\.\S+$/.test(email) || !displayName || password.length < 20 || password.length > 200) {
    throw new Error(
      "The additional administrator/curator identity is incomplete or invalid.",
    );
  }
  if (mfaRequired && !mfaProviderReference) {
    throw new Error(
      "The additional administrator/curator needs an MFA provider reference.",
    );
  }

  return {
    operationId,
    email,
    displayName,
    password,
    mfaRequired,
    mfaProviderReference,
  };
}

/**
 * Adds one active dual-role administrator/curator to an established archive.
 *
 * This is an exceptional operator-controlled path for deployments that do not
 * yet have an authenticated invitation workflow. It never edits an existing
 * identity. A retained configuration is only idempotent when its operation ID
 * and every material target property still describe the exact record created
 * by that operation.
 */
export async function ensureAdditionalAdminCuratorFromEnvironment(): Promise<AdditionalAdminCuratorProvisionStatus> {
  const configuration = configurationFromEnvironment();
  if (!configuration) return "disabled";

  const db = getDatabase();
  return db.transaction(async (transaction) => {
    const [existingOperation] = await transaction
      .select({
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
      })
      .from(auditEvents)
      .where(eq(auditEvents.id, configuration.operationId))
      .limit(1);

    if (
      existingOperation &&
      (existingOperation.action !== "identity.operator_admin_curator_provisioned" ||
        existingOperation.entityType !== "user" ||
        !existingOperation.entityId)
    ) {
      throw new Error("The administrator/curator provisioning operation ID is already in use.");
    }

    const [existingTarget] = await transaction
      .select({
        id: users.id,
        displayName: users.displayName,
        passwordHash: users.passwordHash,
        mfaRequired: users.mfaRequired,
        mfaProviderReference: users.mfaProviderReference,
        active: users.active,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${configuration.email}`)
      .limit(1);

    if (existingOperation) {
      if (
        !existingTarget ||
        existingTarget.id !== existingOperation.entityId ||
        existingTarget.displayName !== configuration.displayName ||
        existingTarget.mfaRequired !== configuration.mfaRequired ||
        existingTarget.mfaProviderReference !== configuration.mfaProviderReference ||
        !existingTarget.active
      ) {
        throw new Error(
          "The retained administrator/curator provisioning operation no longer matches its target.",
        );
      }

      const roles = await transaction
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, existingTarget.id));
      const roleNames = new Set(roles.map(({ role }) => role));
      if (
        roleNames.size !== 2 ||
        !roleNames.has("admin") ||
        !roleNames.has("curator") ||
        !verifyPassword(configuration.password, existingTarget.passwordHash)
      ) {
        throw new Error(
          "The retained administrator/curator provisioning operation is not an exact idempotent match.",
        );
      }
      return "already-present";
    }

    if (existingTarget) {
      throw new Error(
        "The administrator/curator address already exists; provisioning will not change its password or roles.",
      );
    }

    const activeStaffRoles = await transaction
      .select({ id: users.id, role: userRoles.role })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(eq(users.active, true));
    const rolesByUser = new Map<string, Set<string>>();
    for (const { id, role } of activeStaffRoles) {
      const roleNames = rolesByUser.get(id) ?? new Set<string>();
      roleNames.add(role);
      rolesByUser.set(id, roleNames);
    }
    if (
      ![...rolesByUser.values()].some(
        (roleNames) => roleNames.has("admin") && roleNames.has("curator"),
      )
    ) {
      throw new Error(
        "Additional administrator/curator provisioning requires an existing active dual-role administrator/curator.",
      );
    }

    const now = new Date();
    const [created] = await transaction
      .insert(users)
      .values({
        email: configuration.email,
        displayName: configuration.displayName,
        passwordHash: hashPassword(configuration.password),
        mfaRequired: configuration.mfaRequired,
        mfaProviderReference: configuration.mfaProviderReference,
        active: true,
        invitedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: users.id });
    if (!created) {
      throw new Error("Administrator/curator provisioning did not return an identity.");
    }

    await transaction.insert(userRoles).values([
      { userId: created.id, role: "admin", grantedBy: null, grantedAt: now },
      { userId: created.id, role: "curator", grantedBy: null, grantedAt: now },
    ]);

    const [claimed] = await transaction
      .insert(auditEvents)
      .values({
        id: configuration.operationId,
        actorUserId: null,
        action: "identity.operator_admin_curator_provisioned",
        entityType: "user",
        entityId: created.id,
        metadata: {
          method: "startup-controlled-operator-provisioning",
          roles: ["admin", "curator"],
          mfaRequired: configuration.mfaRequired,
        },
        occurredAt: now,
      })
      .onConflictDoNothing({ target: auditEvents.id })
      .returning({ id: auditEvents.id });
    if (!claimed) {
      throw new Error("The administrator/curator provisioning operation ID is already in use.");
    }

    return "created";
  });
}
