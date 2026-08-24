import { and, count, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  auditEvents,
  families,
  familyMemberships,
  passwordResetTokens,
  userRoles,
  users,
} from "@/db/schema";
import type { Actor } from "@/lib/auth/policy";
import { can } from "@/lib/auth/policy";
import {
  canonicalPasswordResetLink,
  generatePasswordResetToken,
  type PasswordResetRequestConfiguration,
} from "@/lib/auth/password-reset";

/**
 * The invitation link is the reset link plus an `invited` marker, so the
 * choose-a-password page can greet a newcomer instead of talking about a
 * password they never had. The token stays in the fragment, never in a query
 * parameter a server log could retain.
 */
export function canonicalInvitationLink(input: {
  siteOrigin: string;
  locale: "en" | "es";
  token: string;
}): string {
  const resetLink = canonicalPasswordResetLink(input);
  return resetLink.replace("#token=", "&invited=1#token=");
}
import { staffMfaRequired } from "@/lib/auth/mfa";
import type { Role } from "@/lib/domain/types";
import { ROLES } from "@/lib/domain/types";
import { brandedEmail } from "@/lib/email/branded";
import { createSmtpEmailSender, type EmailSender } from "@/lib/email/smtp";

/**
 * An invitation link lives longer than a password reset: a committee member
 * may not open their mail the same evening. Seven days balances that against
 * leaving a first-password link valid indefinitely.
 */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

const MAX_ACTIVE_INVITATIONS_PER_USER = 3;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const STAFF_ROLES: ReadonlySet<Role> = new Set(["admin", "curator", "viewer"]);

export class InvitationValidationError extends Error {}
export class InvitationAuthorizationError extends Error {}

export interface InvitedUserInput {
  email: string;
  displayName: string;
  roles: Role[];
  familyId?: string;
  locale: "en" | "es";
}

export interface InvitedUser {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  familyId?: string;
}

function requireManageAccess(actor: Actor): void {
  if (!can(actor, "manage_access")) {
    throw new InvitationAuthorizationError("Access denied.");
  }
}

/** Validates and normalizes the invitation form before any database work. */
export function normalizeInvitedUserInput(input: InvitedUserInput): InvitedUserInput {
  const email = input.email.trim().toLocaleLowerCase("en");
  // Control characters could smuggle line breaks into the plaintext email
  // body or confuse the admin table; a display name is one printable line.
  const displayName = input.displayName.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const roles = [...new Set(input.roles)];
  if (!EMAIL_PATTERN.test(email) || email.length > 320) {
    throw new InvitationValidationError("A valid email address is required.");
  }
  if (displayName.length < 2 || displayName.length > 180) {
    throw new InvitationValidationError("A display name between 2 and 180 characters is required.");
  }
  if (roles.length === 0 || !roles.every((role) => (ROLES as readonly string[]).includes(role))) {
    throw new InvitationValidationError("At least one recognized role is required.");
  }
  const isFamily = roles.includes("family");
  // The bootstrap and provisioning scripts refuse to create staff without an
  // MFA reference while enforcement is on; invitations hold the same line.
  // Without this, the invited person's first-password link would fail its MFA
  // preflight forever while the table said "Invitation pending".
  if (
    staffMfaRequired() &&
    roles.some((role) => role === "admin" || role === "curator")
  ) {
    throw new InvitationValidationError(
      "Staff invitations are unavailable while MFA enforcement is on; provision staff with an MFA reference instead.",
    );
  }
  if (isFamily && roles.some((role) => STAFF_ROLES.has(role))) {
    throw new InvitationValidationError(
      "A family contributor account cannot also hold staff roles.",
    );
  }
  if (isFamily && !input.familyId) {
    throw new InvitationValidationError("A family contributor needs a family group.");
  }
  if (!isFamily && input.familyId) {
    throw new InvitationValidationError("Only a family contributor belongs to a family group.");
  }
  return { email, displayName, roles, familyId: input.familyId, locale: input.locale };
}

/**
 * Creates one invited account: active, no password yet, roles granted by the
 * inviting administrator, and an immutable audit event recording who invited
 * whom. The person proves the invitation later by opening the emailed
 * first-password link.
 */
export async function createInvitedUser(
  actor: Actor,
  rawInput: InvitedUserInput,
  now = new Date(),
): Promise<InvitedUser> {
  requireManageAccess(actor);
  const input = normalizeInvitedUserInput(rawInput);
  const db = getDatabase();

  return db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email}`)
      .limit(1);
    if (existing) {
      throw new InvitationValidationError("An account with that email already exists.");
    }

    if (input.familyId) {
      const [family] = await transaction
        .select({ id: families.id })
        .from(families)
        .where(eq(families.id, input.familyId))
        .limit(1);
      if (!family) {
        throw new InvitationValidationError("The selected family group does not exist.");
      }
    }

    const [created] = await transaction
      .insert(users)
      .values({
        email: input.email,
        displayName: input.displayName,
        passwordHash: null,
        mfaRequired: false,
        active: true,
        invitedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: users.id });
    if (!created) {
      throw new InvitationValidationError("The invitation could not be stored.");
    }

    await transaction.insert(userRoles).values(
      input.roles.map((role) => ({
        userId: created.id,
        role,
        grantedBy: actor.userId,
        grantedAt: now,
      })),
    );

    if (input.familyId) {
      await transaction.insert(familyMemberships).values({
        familyId: input.familyId,
        userId: created.id,
        invitedBy: actor.userId,
        invitedAt: now,
        acceptedAt: now,
      });
    }

    await transaction.insert(auditEvents).values({
      actorUserId: actor.userId,
      action: "identity.user_invited",
      entityType: "user",
      entityId: created.id,
      familyId: input.familyId ?? null,
      metadata: { roles: input.roles, locale: input.locale },
      occurredAt: now,
    });

    return {
      id: created.id,
      email: input.email,
      displayName: input.displayName,
      roles: input.roles,
      familyId: input.familyId,
    };
  });
}

export function invitationEmail(input: {
  locale: "en" | "es";
  displayName: string;
  inviteLink: string;
}): { subject: string; text: string; html: string } {
  const spanish = input.locale === "es";
  const branded = brandedEmail({
    locale: input.locale,
    heading: spanish
      ? "Le damos la bienvenida al archivo"
      : "Welcome to the archive",
    paragraphs: spanish
      ? [
          `${input.displayName}:`,
          "Se le ha invitado al archivo digital Voices of the Shoah, donde se preservan las voces, los rostros y los documentos de las familias sobrevivientes de San Antonio.",
          "Para activar su cuenta, elija su propia contraseña con el enlace siguiente.",
        ]
      : [
          `${input.displayName},`,
          "You have been invited to the Voices of the Shoah digital archive, where the voices, faces, and records of San Antonio's survivor families are preserved.",
          "To activate your account, choose your own password with the link below.",
        ],
    callToAction: {
      label: spanish ? "Elegir mi contraseña" : "Choose my password",
      url: input.inviteLink,
    },
    note: spanish
      ? "El enlace es válido durante 7 días. Si no esperaba esta invitación, puede ignorar este correo."
      : "The link is valid for 7 days. If you were not expecting this invitation, you can ignore this email.",
  });
  return {
    subject: spanish
      ? "Su invitación al archivo Voices of the Shoah"
      : "Your invitation to the Voices of the Shoah archive",
    ...branded,
  };
}

export type InvitationIssuanceStatus =
  | "issued"
  | "ineligible"
  | "already-accepted"
  | "delivery-failed";

/**
 * Emails a first-password link to an invited account. Unlike the public
 * password-reset request, this runs only for an authenticated administrator,
 * so it may say precisely what went wrong.
 */
export async function issueInvitation(input: {
  actor: Actor;
  userId: string;
  configuration: PasswordResetRequestConfiguration;
  now?: Date;
  send?: EmailSender;
}): Promise<InvitationIssuanceStatus> {
  requireManageAccess(input.actor);
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  const generated = generatePasswordResetToken(input.configuration.tokenKey);
  // Everything that can throw is built before the token row exists; a failure
  // after the commit would strand a live seven-day token behind an audit
  // trail that claims the invitation was issued.
  const inviteLinkFor = (locale: "en" | "es") =>
    canonicalInvitationLink({
      siteOrigin: input.configuration.siteOrigin,
      locale,
      token: generated.token,
    });
  inviteLinkFor("en");
  const send = input.send ?? createSmtpEmailSender(input.configuration.smtp);
  const db = getDatabase();

  const issuance = await db.transaction(async (transaction) => {
    const [target] = await transaction
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        active: users.active,
        passwordHash: users.passwordHash,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.id, input.userId))
      .for("update")
      .limit(1);
    if (!target || !target.active) return { status: "ineligible" as const };
    if (target.passwordHash) return { status: "already-accepted" as const };

    const [activeTokenCount] = await transaction
      .select({ value: count() })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, target.id),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt),
          gt(passwordResetTokens.expiresAt, now),
          // A session-version bump has already made older tokens unredeemable;
          // they must not count against the resend allowance.
          eq(passwordResetTokens.sessionVersionAtIssue, target.sessionVersion),
        ),
      );
    if (Number(activeTokenCount?.value ?? 0) >= MAX_ACTIVE_INVITATIONS_PER_USER) {
      return { status: "ineligible" as const };
    }

    const [invitedLocale] = await transaction
      .select({ metadata: auditEvents.metadata })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "identity.user_invited"),
          eq(auditEvents.entityType, "user"),
          eq(auditEvents.entityId, target.id),
        ),
      )
      .limit(1);
    const locale =
      invitedLocale?.metadata?.locale === "es" ? ("es" as const) : ("en" as const);

    const [created] = await transaction
      .insert(passwordResetTokens)
      .values({
        userId: target.id,
        tokenHash: generated.tokenHash,
        sessionVersionAtIssue: target.sessionVersion,
        locale,
        expiresAt,
        createdAt: now,
      })
      .returning({ id: passwordResetTokens.id });
    if (!created) return { status: "ineligible" as const };

    await transaction.insert(auditEvents).values({
      actorUserId: input.actor.userId,
      action: "auth.invitation_issued",
      entityType: "user",
      entityId: target.id,
      metadata: { locale, expiresAt: expiresAt.toISOString() },
      occurredAt: now,
    });
    return {
      status: "created" as const,
      tokenId: created.id,
      userId: target.id,
      email: target.email,
      displayName: target.displayName,
      locale,
    };
  });

  if (issuance.status !== "created") return issuance.status;

  const message = invitationEmail({
    locale: issuance.locale,
    displayName: issuance.displayName,
    inviteLink: inviteLinkFor(issuance.locale),
  });

  try {
    await send({ to: issuance.email, ...message });
  } catch {
    const failedAt = new Date();
    await db.transaction(async (transaction) => {
      await transaction
        .update(passwordResetTokens)
        .set({ revokedAt: failedAt })
        .where(
          and(
            eq(passwordResetTokens.id, issuance.tokenId),
            isNull(passwordResetTokens.usedAt),
            isNull(passwordResetTokens.revokedAt),
          ),
        );
      await transaction.insert(auditEvents).values({
        actorUserId: input.actor.userId,
        action: "auth.invitation_delivery_failed",
        entityType: "user",
        entityId: issuance.userId,
        metadata: { reason: "smtp-delivery-failed" },
        occurredAt: failedAt,
      });
    });
    return "delivery-failed";
  }

  const deliveredAt = new Date();
  await db.transaction(async (transaction) => {
    await transaction
      .update(passwordResetTokens)
      .set({ deliveredAt })
      .where(
        and(
          eq(passwordResetTokens.id, issuance.tokenId),
          isNull(passwordResetTokens.revokedAt),
        ),
      );
    await transaction.insert(auditEvents).values({
      actorUserId: input.actor.userId,
      action: "auth.invitation_email_sent",
      entityType: "user",
      entityId: issuance.userId,
      metadata: { provider: "smtp" },
      occurredAt: deliveredAt,
    });
  });
  return "issued";
}

export type AccountStateChange = "updated" | "not-found" | "refused";

/**
 * Activates or deactivates one account. Deactivation also bumps the session
 * version so every live session and outstanding token dies with it. The two
 * refusals protect the archive from locking itself out: an administrator can
 * never deactivate their own account, nor the last active administrator.
 */
export async function setUserActive(input: {
  actor: Actor;
  userId: string;
  active: boolean;
  now?: Date;
}): Promise<AccountStateChange> {
  requireManageAccess(input.actor);
  const now = input.now ?? new Date();
  if (!input.active && input.userId === input.actor.userId) return "refused";
  const db = getDatabase();

  return db.transaction(async (transaction) => {
    const [target] = await transaction
      .select({ id: users.id, active: users.active })
      .from(users)
      .where(eq(users.id, input.userId))
      .for("update")
      .limit(1);
    if (!target) return "not-found";
    if (target.active === input.active) return "updated";

    if (!input.active) {
      // The last-admin count below reads other rows than the one locked
      // above, so two administrators deactivating each other concurrently
      // would each see the other still active. The advisory lock serializes
      // every deactivation so the count is always taken against a settled
      // state.
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('vots-account-deactivation-v1'))`,
      );
      const [otherAdmins] = await transaction
        .select({ value: count() })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.userId))
        .where(
          and(
            eq(userRoles.role, "admin"),
            eq(users.active, true),
            ne(users.id, input.userId),
          ),
        );
      if (Number(otherAdmins?.value ?? 0) === 0) return "refused";
    }

    await transaction
      .update(users)
      .set({
        active: input.active,
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: now,
      })
      .where(eq(users.id, input.userId));

    await transaction.insert(auditEvents).values({
      actorUserId: input.actor.userId,
      action: input.active ? "identity.user_reactivated" : "identity.user_deactivated",
      entityType: "user",
      entityId: input.userId,
      metadata: {},
      occurredAt: now,
    });
    return "updated";
  });
}
