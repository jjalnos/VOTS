import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { auditEvents, userRoles, users } from "@/db/schema";
import { staffMfaRequired } from "@/lib/auth/mfa";
import { hashPassword } from "@/lib/auth/password";

export const INITIAL_CURATOR_CONFIRMATION = "CREATE_INITIAL_ROBIN_CURATOR";

export type InitialCuratorBootstrapStatus =
  | "disabled"
  | "created"
  | "already-present";

interface InitialCuratorConfiguration {
  email: string;
  displayName: string;
  password: string;
  mfaProviderReference: string | null;
}

function configurationFromEnvironment(): InitialCuratorConfiguration | null {
  if (process.env.BOOTSTRAP_CONFIRM !== INITIAL_CURATOR_CONFIRMATION) return null;
  const email = process.env.BOOTSTRAP_CURATOR_EMAIL?.trim().toLocaleLowerCase("en") ?? "";
  const displayName = process.env.BOOTSTRAP_CURATOR_DISPLAY_NAME?.trim() ?? "";
  const password = process.env.BOOTSTRAP_CURATOR_PASSWORD ?? "";
  const mfaProviderReference = process.env.BOOTSTRAP_CURATOR_MFA_REFERENCE?.trim() || null;
  if (!/^\S+@\S+\.\S+$/.test(email) || !displayName || password.length < 16) {
    throw new Error("The controlled initial-curator bootstrap is incomplete.");
  }
  if (staffMfaRequired() && !mfaProviderReference) {
    throw new Error("The initial curator needs an MFA provider reference.");
  }
  return { email, displayName, password, mfaProviderReference };
}

/**
 * Creates exactly one initial, dual-role owner for an empty deployment. The
 * bootstrap variables can safely remain configured across a restart: once the
 * same account exists with both roles the operation is an audited no-op. It
 * refuses to add a surprise owner to a database that already has another user.
 */
export async function ensureInitialCuratorFromEnvironment(): Promise<InitialCuratorBootstrapStatus> {
  const configuration = configurationFromEnvironment();
  if (!configuration) return "disabled";
  const passwordHash = hashPassword(configuration.password);
  const db = getDatabase();
  return db.transaction(async (transaction) => {
    const existingUsers = await transaction
      .select({ id: users.id, email: users.email })
      .from(users)
      .limit(2);
    const matching = existingUsers.find(
      (user) => user.email.toLocaleLowerCase("en") === configuration.email,
    );
    if (matching) {
      const roles = await transaction
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, matching.id));
      const names = new Set(roles.map((role) => role.role));
      if (!names.has("admin") || !names.has("curator")) {
        throw new Error("The existing bootstrap identity does not have the expected roles.");
      }
      return "already-present";
    }
    if (existingUsers.length) {
      throw new Error("Initial-curator bootstrap refused because the identity database is not empty.");
    }

    const now = new Date();
    const [created] = await transaction
      .insert(users)
      .values({
        email: configuration.email,
        displayName: configuration.displayName,
        passwordHash,
        mfaRequired: staffMfaRequired(),
        mfaProviderReference: configuration.mfaProviderReference,
        active: true,
        invitedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: users.id });
    if (!created) throw new Error("Initial curator creation did not return an identity.");
    await transaction.insert(userRoles).values([
      { userId: created.id, role: "admin", grantedBy: created.id, grantedAt: now },
      { userId: created.id, role: "curator", grantedBy: created.id, grantedAt: now },
    ]);
    await transaction.insert(auditEvents).values({
      actorUserId: created.id,
      action: "identity.initial_curator_created",
      entityType: "user",
      entityId: created.id,
      metadata: {
        method: "startup-controlled-bootstrap",
        roles: ["admin", "curator"],
        mfaRequired: staffMfaRequired(),
      },
      occurredAt: now,
    });
    return "created";
  });
}
