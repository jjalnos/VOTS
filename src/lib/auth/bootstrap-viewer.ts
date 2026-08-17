import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { auditEvents, userRoles, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

export const DEMONSTRATION_VIEWER_CONFIRMATION = "CREATE_DEMONSTRATION_VIEWER";

export type DemonstrationViewerBootstrapStatus =
  | "disabled"
  | "created"
  | "already-present";

interface ViewerConfiguration {
  email: string;
  displayName: string;
  password: string;
}

function configurationFromEnvironment(): ViewerConfiguration | null {
  if (process.env.BOOTSTRAP_VIEWER_CONFIRM !== DEMONSTRATION_VIEWER_CONFIRMATION) return null;
  const email = process.env.BOOTSTRAP_VIEWER_EMAIL?.trim().toLocaleLowerCase("en") ?? "";
  const displayName = process.env.BOOTSTRAP_VIEWER_DISPLAY_NAME?.trim() ?? "";
  const password = process.env.BOOTSTRAP_VIEWER_PASSWORD ?? "";
  if (!/^\S+@\S+\.\S+$/.test(email) || !displayName || password.length < 16) {
    throw new Error("The demonstration viewer bootstrap is incomplete.");
  }
  return { email, displayName, password };
}

/**
 * Creates the shared, read-only account used to show the survivor registry.
 *
 * The account holds exactly one role, `viewer`, which cannot reach the private
 * archive workspace and receives every registry record with contact details
 * redacted. Unlike the curator bootstrap this may run against a populated
 * database — the curator identity already exists by then — so it refuses to
 * touch any address that is not already exactly this read-only account, and it
 * never rotates a password it did not create.
 */
export async function ensureDemonstrationViewerFromEnvironment(): Promise<DemonstrationViewerBootstrapStatus> {
  const configuration = configurationFromEnvironment();
  if (!configuration) return "disabled";
  const db = getDatabase();
  return db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, configuration.email))
      .limit(1);

    if (existing) {
      const roles = await transaction
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, existing.id));
      const names = roles.map((entry) => entry.role);
      if (names.length !== 1 || names[0] !== "viewer") {
        throw new Error(
          "The demonstration viewer address already belongs to an account with other roles.",
        );
      }
      return "already-present";
    }

    const now = new Date();
    const [created] = await transaction
      .insert(users)
      .values({
        email: configuration.email,
        displayName: configuration.displayName,
        passwordHash: hashPassword(configuration.password),
        mfaRequired: false,
        active: true,
        invitedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: users.id });
    if (!created) throw new Error("Demonstration viewer creation did not return an identity.");

    await transaction
      .insert(userRoles)
      .values([{ userId: created.id, role: "viewer", grantedBy: created.id, grantedAt: now }]);

    await transaction.insert(auditEvents).values({
      actorUserId: created.id,
      action: "identity.demonstration_viewer_created",
      entityType: "user",
      entityId: created.id,
      metadata: { method: "startup-controlled-bootstrap", roles: ["viewer"] },
      occurredAt: now,
    });

    return "created";
  });
}
