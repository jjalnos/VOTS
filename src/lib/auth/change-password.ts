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
    return await db.transaction(async (transaction) => {
      const [identity] = await transaction
        .select({
          id: users.id,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(and(eq(users.id, input.userId), eq(users.active, true)))
        .for("update")
        .limit(1);

      if (
        !identity ||
        !(await verifyPasswordAsync(input.currentPassword, identity.passwordHash)) ||
        input.newPassword === input.currentPassword
      ) {
        return "rejected";
      }

      const now = new Date();
      const [updated] = await transaction
        .update(users)
        .set({
          passwordHash: hashPassword(input.newPassword),
          sessionVersion: sql`${users.sessionVersion} + 1`,
          updatedAt: now,
        })
        .where(and(eq(users.id, identity.id), eq(users.active, true)))
        .returning({ id: users.id });
      if (!updated) throw new Error("Password update did not complete.");

      await transaction.insert(auditEvents).values({
        actorUserId: identity.id,
        action: "identity.password_changed",
        entityType: "user",
        entityId: identity.id,
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
