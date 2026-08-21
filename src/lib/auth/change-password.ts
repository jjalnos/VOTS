import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { auditEvents, users } from "@/db/schema";
import { hashPassword, verifyPasswordAsync } from "@/lib/auth/password";

export type DatabasePasswordChangeResult =
  | "changed"
  | "rejected"
  | "unavailable";

/**
 * Changes an authenticated database user's password and revokes every existing
 * session for that identity. Invalid credentials deliberately collapse to one
 * result so callers do not reveal which check failed.
 */
export async function changeDatabaseUserPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<DatabasePasswordChangeResult> {
  if (!process.env.DATABASE_URL) return "unavailable";

  try {
    const db = getDatabase();
    const [identity] = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.active, true)))
      .limit(1);

    if (
      !identity ||
      !(await verifyPasswordAsync(input.currentPassword, identity.passwordHash)) ||
      input.newPassword === input.currentPassword
    ) {
      return "rejected";
    }

    // Both scrypt operations deliberately complete before a transaction owns
    // a database connection or row lock. The locked reread below prevents a
    // concurrent password change from being overwritten.
    const nextPasswordHash = hashPassword(input.newPassword);
    return await db.transaction(async (transaction) => {
      const [lockedIdentity] = await transaction
        .select({
          id: users.id,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(and(eq(users.id, input.userId), eq(users.active, true)))
        .for("update")
        .limit(1);

      if (
        !lockedIdentity ||
        lockedIdentity.passwordHash !== identity.passwordHash
      ) {
        return "rejected";
      }

      const now = new Date();
      const [updated] = await transaction
        .update(users)
        .set({
          passwordHash: nextPasswordHash,
          sessionVersion: sql`${users.sessionVersion} + 1`,
          updatedAt: now,
        })
        .where(and(eq(users.id, lockedIdentity.id), eq(users.active, true)))
        .returning({ id: users.id });
      if (!updated) throw new Error("Password update did not complete.");

      await transaction.insert(auditEvents).values({
        actorUserId: lockedIdentity.id,
        action: "identity.password_changed",
        entityType: "user",
        entityId: lockedIdentity.id,
        metadata: {
          method: "authenticated-self-service",
          sessionsRevoked: true,
        },
        occurredAt: now,
      });

      return "changed";
    });
  } catch {
    return "unavailable";
  }
}
