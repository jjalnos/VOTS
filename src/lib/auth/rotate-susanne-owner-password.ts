import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { auditEvents, userRoles, users } from "@/db/schema";
import { ROLES } from "@/lib/domain/types";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export const SUSANNE_OWNER_PASSWORD_ROTATION_CONFIRMATION =
  "ROTATE_EXISTING_SUSANNE_OWNER_PASSWORD";

const REFUSED = "The controlled owner password rotation was refused.";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PINNED_OWNER_EMAIL = "jeremy@clicksmith.net";

export type SusanneOwnerPasswordRotationStatus =
  | "disabled"
  | "password-rotated"
  | "already-current";

interface RotationConfiguration {
  operationId: string;
  email: string;
  password: string;
}

function normalizedEmail(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase("en") ?? "";
}

function configurationFromEnvironment(): RotationConfiguration | null {
  const confirmation = process.env.SUSANNE_OWNER_PASSWORD_ROTATION_CONFIRM;
  if (!confirmation) return null;

  // The secret is read only after explicit opt-in and is immediately removed
  // from this process, before any validation, hashing, or database work.
  const password = process.env.SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD ?? "";
  delete process.env.SUSANNE_OWNER_PASSWORD_ROTATION_PASSWORD;

  const operationId =
    process.env.SUSANNE_OWNER_PASSWORD_ROTATION_OPERATION_ID?.trim() ?? "";
  const rawTargetEmail =
    process.env.SUSANNE_OWNER_PASSWORD_ROTATION_EMAIL ?? "";
  const targetEmail = normalizedEmail(rawTargetEmail);
  const ownerEmail = normalizedEmail(process.env.SUSANNE_OWNER_EMAIL);

  if (
    confirmation !== SUSANNE_OWNER_PASSWORD_ROTATION_CONFIRMATION ||
    !UUID_V4_PATTERN.test(operationId) ||
    !/^\S+@\S+\.\S+$/.test(targetEmail) ||
    rawTargetEmail !== targetEmail ||
    targetEmail !== PINNED_OWNER_EMAIL ||
    ownerEmail !== PINNED_OWNER_EMAIL ||
    password.length < 16 ||
    password.length > 200
  ) {
    throw new Error(REFUSED);
  }

  return { operationId, email: targetEmail, password };
}

function hasExactOwnerRoles(roles: string[]): boolean {
  const roleNames = new Set(roles);
  const allowed = new Set(["admin", "curator"]);
  if ((ROLES as readonly string[]).includes("manage_access")) {
    allowed.add("manage_access");
  }
  return (
    roleNames.has("admin") &&
    roleNames.has("curator") &&
    roleNames.size === roles.length &&
    [...roleNames].every((role) => allowed.has(role))
  );
}

/**
 * Rotates only the existing, active, exact Susanne owner identity. It never
 * creates an identity or edits roles. The audit-event primary key makes a
 * retained operation idempotent only while the requested password is current.
 */
export async function ensureSusanneOwnerPasswordRotationFromEnvironment(): Promise<SusanneOwnerPasswordRotationStatus> {
  let configuration: RotationConfiguration | null;
  try {
    configuration = configurationFromEnvironment();
  } catch {
    throw new Error(REFUSED);
  }
  if (!configuration) return "disabled";

  try {
    const db = getDatabase();
    return await db.transaction(async (transaction) => {
      const targetRows = await transaction
        .select({
          id: users.id,
          email: users.email,
          passwordHash: users.passwordHash,
          active: users.active,
        })
        .from(users)
        .where(eq(users.email, configuration.email))
        .for("update")
        .limit(2);
      if (targetRows.length !== 1 || !targetRows[0].active) {
        throw new Error(REFUSED);
      }
      const target = targetRows[0];

      const roles = await transaction
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, target.id))
        .limit(ROLES.length + 1);
      if (!hasExactOwnerRoles(roles.map(({ role }) => role))) {
        throw new Error(REFUSED);
      }

      const [existingOperation] = await transaction
        .select({
          action: auditEvents.action,
          entityType: auditEvents.entityType,
          entityId: auditEvents.entityId,
        })
        .from(auditEvents)
        .where(eq(auditEvents.id, configuration.operationId))
        .limit(1);

      if (existingOperation) {
        if (
          existingOperation.action !==
            "identity.susanne_owner_password_rotated" ||
          existingOperation.entityType !== "user" ||
          existingOperation.entityId !== target.id ||
          !verifyPassword(configuration.password, target.passwordHash)
        ) {
          throw new Error(REFUSED);
        }
        return "already-current";
      }

      const now = new Date();
      const [claimed] = await transaction
        .insert(auditEvents)
        .values({
          id: configuration.operationId,
          actorUserId: null,
          action: "identity.susanne_owner_password_rotated",
          entityType: "user",
          entityId: target.id,
          metadata: {
            method: "startup-controlled-owner-password-rotation",
            roles: ["admin", "curator"],
          },
          occurredAt: now,
        })
        .onConflictDoNothing({ target: auditEvents.id })
        .returning({ id: auditEvents.id });
      if (!claimed) throw new Error(REFUSED);

      const [updated] = await transaction
        .update(users)
        .set({
          passwordHash: hashPassword(configuration.password),
          sessionVersion: sql`${users.sessionVersion} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(users.id, target.id),
            eq(users.email, configuration.email),
            eq(users.active, true),
          ),
        )
        .returning({ id: users.id });
      if (!updated) throw new Error(REFUSED);
      return "password-rotated";
    });
  } catch {
    throw new Error(REFUSED);
  }
}
