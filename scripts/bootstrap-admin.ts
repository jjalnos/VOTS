import { eq } from "drizzle-orm";
import { closeDatabase, getDatabase } from "@/db/client";
import { auditEvents, userRoles, users } from "@/db/schema";
import { staffMfaRequired } from "@/lib/auth/mfa";
import { hashPassword } from "@/lib/auth/password";

const requiredNames = [
  "DATABASE_URL",
  "BOOTSTRAP_ADMIN_EMAIL",
  "BOOTSTRAP_ADMIN_DISPLAY_NAME",
  "BOOTSTRAP_ADMIN_PASSWORD",
] as const;

async function bootstrap(): Promise<void> {
  if (process.env.BOOTSTRAP_CONFIRM !== "CREATE_INITIAL_ADMIN") {
    throw new Error("Set BOOTSTRAP_CONFIRM=CREATE_INITIAL_ADMIN for this one-time operation.");
  }
  const enforceStaffMfa = staffMfaRequired();
  const missing = [
    ...requiredNames.filter((name) => !process.env[name]),
    ...(enforceStaffMfa && !process.env.BOOTSTRAP_ADMIN_MFA_REFERENCE
      ? ["BOOTSTRAP_ADMIN_MFA_REFERENCE"]
      : []),
  ];
  if (missing.length) throw new Error(`Missing required variables: ${missing.join(", ")}.`);

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL!.trim().toLowerCase();
  const displayName = process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME!.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD!;
  const mfaProviderReference = process.env.BOOTSTRAP_ADMIN_MFA_REFERENCE?.trim() || null;
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!/^\S+@\S+\.\S+$/.test(email) || !displayName || (enforceStaffMfa && !mfaProviderReference)) {
    throw new Error("Bootstrap identity metadata is invalid.");
  }
  const passwordHash = hashPassword(password);
  const db = getDatabase();
  const created = await db.transaction(async (transaction) => {
    const existingAdmin = await transaction
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.role, "admin"))
      .limit(1);
    if (existingAdmin.length) throw new Error("An administrator already exists; bootstrap refused.");
    const existingEmail = await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existingEmail.length) throw new Error("That email address already exists; bootstrap refused.");

    const [user] = await transaction
      .insert(users)
      .values({
        email,
        displayName,
        passwordHash,
        mfaRequired: true,
        mfaProviderReference,
        active: true,
        invitedAt: new Date(),
      })
      .returning({ id: users.id, email: users.email });
    if (!user) throw new Error("Administrator creation did not return a user record.");
    await transaction.insert(userRoles).values({
      userId: user.id,
      role: "admin",
      grantedBy: user.id,
    });
    await transaction.insert(auditEvents).values({
      actorUserId: user.id,
      action: "admin.bootstrap_created",
      entityType: "user",
      entityId: user.id,
      metadata: { method: "controlled_bootstrap", mfaRequired: true },
    });
    return user;
  });
  console.log(`Initial administrator created: ${created.email} (${created.id}).`);
}

bootstrap()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Administrator bootstrap failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
