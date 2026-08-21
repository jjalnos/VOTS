import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  auditEvents,
  familyMemberships,
  userRoles,
  users,
} from "@/db/schema";
import type { Actor } from "@/lib/auth/policy";
import type { Role } from "@/lib/domain/types";
import { staffMfaRequired, verifyStaffMfa } from "@/lib/auth/mfa";
import { hashPassword, verifyPasswordAsync } from "@/lib/auth/password";

export type AuthenticationResult =
  | { status: "authenticated"; actor: Actor; sessionVersion: number }
  | { status: "invalid" }
  | { status: "unavailable" };

const dummyPasswordHash = hashPassword(
  "hmmsa-dummy-password-comparison-only",
  Buffer.alloc(16, 11),
);

export interface DatabaseIdentity {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  sessionVersion: number;
  mfaRequired: boolean;
  mfaProviderReference: string | null;
  active: boolean;
  roles: Role[];
  activeFamilyIds: string[];
}

export function actorFromDatabaseIdentity(
  identity: DatabaseIdentity,
  mfaVerified: boolean,
  expectedSessionVersion?: number,
): Actor | null {
  if (!identity.active || !identity.roles.length) return null;
  if (
    expectedSessionVersion !== undefined &&
    identity.sessionVersion !== expectedSessionVersion
  ) return null;
  const isStaff = identity.roles.some((role) => role === "admin" || role === "curator");
  const enforceStaffMfa = isStaff && staffMfaRequired();
  if (enforceStaffMfa && (!identity.mfaRequired || !mfaVerified)) return null;
  const isFamily = identity.roles.includes("family");
  if (isFamily && identity.activeFamilyIds.length !== 1) return null;
  return {
    userId: identity.id,
    email: identity.email,
    displayName: identity.displayName,
    roles: identity.roles,
    familyId: isFamily ? identity.activeFamilyIds[0] : undefined,
    mfaVerified: isStaff ? (!enforceStaffMfa || mfaVerified) : true,
  };
}

async function loadIdentityBy(column: "id" | "email", value: string): Promise<DatabaseIdentity | null> {
  const db = getDatabase();
  const userRows = await db
    .select()
    .from(users)
    .where(column === "id" ? eq(users.id, value) : eq(users.email, value))
    .limit(1);
  const user = userRows[0];
  if (!user) return null;
  const [roleRows, membershipRows] = await Promise.all([
    db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, user.id)),
    db
      .select({ familyId: familyMemberships.familyId })
      .from(familyMemberships)
      .where(
        and(
          eq(familyMemberships.userId, user.id),
          isNotNull(familyMemberships.acceptedAt),
          isNull(familyMemberships.revokedAt),
        ),
      ),
  ]);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    passwordHash: user.passwordHash,
    sessionVersion: user.sessionVersion,
    mfaRequired: user.mfaRequired,
    mfaProviderReference: user.mfaProviderReference,
    active: user.active,
    roles: roleRows.map((row) => row.role),
    activeFamilyIds: membershipRows.map((row) => row.familyId),
  };
}

export async function authenticateDatabaseUser(input: {
  email: string;
  password: string;
  mfaCode?: string;
}): Promise<AuthenticationResult> {
  if (!process.env.DATABASE_URL) return { status: "unavailable" };
  try {
    const identity = await loadIdentityBy("email", input.email.trim().toLowerCase());
    if (!identity) {
      await verifyPasswordAsync(input.password, dummyPasswordHash);
      return { status: "invalid" };
    }
    if (!(await verifyPasswordAsync(input.password, identity.passwordHash))) {
      return { status: "invalid" };
    }
    const isStaff = identity.roles.some((role) => role === "admin" || role === "curator");
    const enforceStaffMfa = isStaff && staffMfaRequired();
    let mfaVerified = !isStaff;
    if (enforceStaffMfa) {
      if (!identity.mfaRequired || !identity.mfaProviderReference) return { status: "invalid" };
      const mfaResult = await verifyStaffMfa({
        userId: identity.id,
        providerReference: identity.mfaProviderReference,
        code: input.mfaCode,
      });
      if (mfaResult === "unavailable") return { status: "unavailable" };
      if (mfaResult !== "verified") return { status: "invalid" };
      mfaVerified = true;
    }
    const actor = actorFromDatabaseIdentity(identity, mfaVerified);
    if (!actor) return { status: "invalid" };
    const db = getDatabase();
    const now = new Date();
    await db.transaction(async (transaction) => {
      await transaction
        .update(users)
        .set({ lastLoginAt: now, updatedAt: now })
        .where(eq(users.id, identity.id));
      await transaction.insert(auditEvents).values({
        actorUserId: identity.id,
        action: "auth.login_succeeded",
        entityType: "user",
        entityId: identity.id,
        metadata: { mfaVerified, mfaEnforced: enforceStaffMfa, provider: "database" },
        occurredAt: now,
      });
    });
    return { status: "authenticated", actor, sessionVersion: identity.sessionVersion };
  } catch {
    return { status: "unavailable" };
  }
}

export async function resolveDatabaseSessionActor(input: {
  userId: string;
  mfaVerified: boolean;
  sessionVersion: number;
}): Promise<Actor | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const identity = await loadIdentityBy("id", input.userId);
    if (!identity) return null;
    return actorFromDatabaseIdentity(
      identity,
      input.mfaVerified,
      input.sessionVersion,
    );
  } catch {
    return null;
  }
}
