import { createHmac, randomBytes } from "node:crypto";
import {
  and,
  count,
  eq,
  gt,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  auditEvents,
  passwordResetTokens,
  userRoles,
  users,
} from "@/db/schema";
import { staffMfaRequired, verifyStaffMfa } from "@/lib/auth/mfa";
import { hashPasswordAsync } from "@/lib/auth/password";
import { configuredAuthProvider } from "@/lib/auth/provider";
import {
  createSmtpEmailSender,
  smtpConfigurationFromEnvironment,
  type EmailSender,
  type SmtpConfiguration,
} from "@/lib/email/smtp";

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1_000;
export const PASSWORD_RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const PASSWORD_RESET_INVALID_MESSAGE =
  "This password-reset link is invalid or no longer available.";
const MAX_ACTIVE_RESET_TOKENS_PER_USER = 3;

type PasswordResetEnvironment = Record<string, string | undefined>;
export type PasswordResetLocale = "en" | "es";

export class PasswordResetConfigurationError extends Error {
  /**
   * Names the environment variable that failed validation. Operators need to
   * know which check rejected a deployment; the value itself is never
   * captured, logged, or returned.
   */
  readonly variable: string;

  constructor(variable = "PASSWORD_RESET_CONFIGURATION") {
    super("Password reset is not configured safely.");
    this.name = "PasswordResetConfigurationError";
    this.variable = variable;
  }
}

export interface PasswordResetConfirmationConfiguration {
  siteOrigin: string;
  tokenKey: string;
}

export interface PasswordResetRequestConfiguration
  extends PasswordResetConfirmationConfiguration {
  smtp: SmtpConfiguration;
}

function assertDatabasePasswordResetProvider(
  environment: PasswordResetEnvironment,
): void {
  // Use the normal provider resolver for the process environment. An injected
  // environment is used only by pure configuration tests.
  const provider =
    environment === process.env
      ? configuredAuthProvider()
      : environment.AUTH_PROVIDER === "database"
        ? "database"
        : "unconfigured";
  if (provider !== "database") {
    throw new PasswordResetConfigurationError("AUTH_PROVIDER");
  }
  if (!environment.DATABASE_URL) {
    throw new PasswordResetConfigurationError("DATABASE_URL");
  }
}

export function canonicalPasswordResetSiteOrigin(
  environment: PasswordResetEnvironment = process.env,
): string {
  const raw = environment.NEXT_PUBLIC_SITE_URL;
  if (!raw || raw.trim() !== raw) {
    throw new PasswordResetConfigurationError("NEXT_PUBLIC_SITE_URL");
  }
  try {
    const url = new URL(raw);
    const production = environment.NODE_ENV === "production";
    if (
      (production ? url.protocol !== "https:" : !["http:", "https:"].includes(url.protocol)) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.origin === "null" ||
      (raw !== url.origin && raw !== `${url.origin}/`)
    ) {
      throw new PasswordResetConfigurationError("NEXT_PUBLIC_SITE_URL");
    }
    return url.origin;
  } catch (error) {
    if (error instanceof PasswordResetConfigurationError) throw error;
    throw new PasswordResetConfigurationError("NEXT_PUBLIC_SITE_URL");
  }
}

export function passwordResetTokenKey(
  environment: PasswordResetEnvironment = process.env,
): string {
  const key = environment.PASSWORD_RESET_TOKEN_KEY;
  const normalized = key?.toLocaleLowerCase("en") ?? "";
  const looksLikePlaceholder =
    /change.?me|replace.?me|placeholder|example|password|secret|todo/.test(normalized);
  if (
    !key ||
    key.trim() !== key ||
    Buffer.byteLength(key, "utf8") < 32 ||
    new Set([...key]).size === 1 ||
    looksLikePlaceholder ||
    key === environment.AUTH_SESSION_SECRET
  ) {
    throw new PasswordResetConfigurationError("PASSWORD_RESET_TOKEN_KEY");
  }
  return key;
}

export function passwordResetConfirmationConfiguration(
  environment: PasswordResetEnvironment = process.env,
): PasswordResetConfirmationConfiguration {
  assertDatabasePasswordResetProvider(environment);
  return {
    siteOrigin: canonicalPasswordResetSiteOrigin(environment),
    tokenKey: passwordResetTokenKey(environment),
  };
}

export function passwordResetRequestConfiguration(
  environment: PasswordResetEnvironment = process.env,
): PasswordResetRequestConfiguration {
  const base = passwordResetConfirmationConfiguration(environment);
  return {
    ...base,
    // This check happens in the request route before any identity lookup. SMTP
    // failures during deferred delivery remain private and revoke the token.
    smtp: smtpConfigurationFromEnvironment(environment),
  };
}

export function hasExactPasswordResetOrigin(
  request: Request,
  siteOrigin: string,
): boolean {
  return request.headers.get("origin") === siteOrigin;
}

export function passwordResetTokenDigest(token: string, key: string): string {
  if (!PASSWORD_RESET_TOKEN_PATTERN.test(token) || Buffer.byteLength(key, "utf8") < 32) {
    throw new Error("Invalid password-reset token material.");
  }
  return createHmac("sha256", key).update(token, "ascii").digest("hex");
}

export function generatePasswordResetToken(
  key: string,
  random: (size: number) => Buffer = randomBytes,
): { token: string; tokenHash: string } {
  const token = random(32).toString("base64url");
  if (!PASSWORD_RESET_TOKEN_PATTERN.test(token)) {
    throw new Error("Password-reset token generation failed.");
  }
  return { token, tokenHash: passwordResetTokenDigest(token, key) };
}

export function canonicalPasswordResetLink(input: {
  siteOrigin: string;
  locale: PasswordResetLocale;
  token: string;
}): string {
  const origin = canonicalPasswordResetSiteOrigin({
    NEXT_PUBLIC_SITE_URL: input.siteOrigin,
    NODE_ENV: "production",
  });
  if (!PASSWORD_RESET_TOKEN_PATTERN.test(input.token)) {
    throw new Error("A valid password-reset token is required.");
  }
  return `${origin}/reset-password?lang=${input.locale}#token=${input.token}`;
}

export function passwordResetEmail(input: {
  locale: PasswordResetLocale;
  resetLink: string;
}): { subject: string; text: string } {
  if (input.locale === "es") {
    return {
      subject: "Restablece tu contraseña de Voices of the Shoah",
      text: [
        "Recibimos una solicitud para restablecer tu contraseña.",
        "",
        `Abre este enlace dentro de los próximos 30 minutos: ${input.resetLink}`,
        "",
        "Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña no cambiará.",
      ].join("\n"),
    };
  }
  return {
    subject: "Reset your Voices of the Shoah password",
    text: [
      "We received a request to reset your password.",
      "",
      `Open this link within the next 30 minutes: ${input.resetLink}`,
      "",
      "If you did not request this change, you can ignore this email. Your password will not change.",
    ].join("\n"),
  };
}

export type PasswordResetIssuanceStatus =
  | "ineligible"
  | "issued"
  | "delivery-failed";

/**
 * Runs only from Next's deferred `after` callback. It deliberately performs
 * the identity lookup after the public 202 response has been determined.
 */
export async function issuePasswordReset(input: {
  email: string;
  locale: PasswordResetLocale;
  configuration: PasswordResetRequestConfiguration;
  now?: Date;
  send?: EmailSender;
}): Promise<PasswordResetIssuanceStatus> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
  const normalizedEmail = input.email.trim().toLocaleLowerCase("en");
  const generated = generatePasswordResetToken(input.configuration.tokenKey);
  const db = getDatabase();

  // Build the link, the message, and the transport BEFORE the token row is
  // committed. Each of these can throw on a misconfigured deployment, and a
  // throw after the commit would strand a live token behind an audit trail
  // that claims the reset was issued, with nothing to revoke it.
  const resetLink = canonicalPasswordResetLink({
    siteOrigin: input.configuration.siteOrigin,
    locale: input.locale,
    token: generated.token,
  });
  const message = passwordResetEmail({ locale: input.locale, resetLink });
  const send = input.send ?? createSmtpEmailSender(input.configuration.smtp);

  const issuance = await db.transaction(async (transaction) => {
    const targets = await transaction
      .select({
        id: users.id,
        email: users.email,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(
        and(
          sql`lower(${users.email}) = ${normalizedEmail}`,
          eq(users.active, true),
          isNotNull(users.passwordHash),
        ),
      )
      .for("update")
      .limit(2);
    if (targets.length !== 1) return null;
    const target = targets[0];

    const [activeTokenCount] = await transaction
      .select({ value: count() })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, target.id),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      );
    if (Number(activeTokenCount?.value ?? 0) >= MAX_ACTIVE_RESET_TOKENS_PER_USER) {
      return null;
    }

    const [created] = await transaction
      .insert(passwordResetTokens)
      .values({
        userId: target.id,
        tokenHash: generated.tokenHash,
        sessionVersionAtIssue: target.sessionVersion,
        locale: input.locale,
        expiresAt,
        createdAt: now,
      })
      .returning({ id: passwordResetTokens.id });
    if (!created) return null;

    await transaction.insert(auditEvents).values({
      actorUserId: null,
      action: "auth.password_reset_issued",
      entityType: "user",
      entityId: target.id,
      metadata: {
        method: "email-token",
        locale: input.locale,
        expiresAt: expiresAt.toISOString(),
      },
      occurredAt: now,
    });
    return { tokenId: created.id, userId: target.id, email: target.email };
  });

  if (!issuance) return "ineligible";

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
        actorUserId: null,
        action: "auth.password_reset_delivery_failed",
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
      actorUserId: null,
      action: "auth.password_reset_email_sent",
      entityType: "user",
      entityId: issuance.userId,
      metadata: { provider: "smtp" },
      occurredAt: deliveredAt,
    });
  });
  return "issued";
}

export type PasswordResetConfirmationStatus =
  | "reset"
  | "invalid"
  | "unavailable";

class PasswordResetClaimError extends Error {}

export async function confirmPasswordReset(input: {
  token: string;
  password: string;
  passwordConfirmation: string;
  mfaCode?: string;
  configuration: PasswordResetConfirmationConfiguration;
  now?: Date;
}): Promise<PasswordResetConfirmationStatus> {
  if (
    !PASSWORD_RESET_TOKEN_PATTERN.test(input.token) ||
    input.password.length < 16 ||
    input.password.length > 200 ||
    input.password !== input.passwordConfirmation
  ) {
    return "invalid";
  }

  const now = input.now ?? new Date();
  const tokenHash = passwordResetTokenDigest(
    input.token,
    input.configuration.tokenKey,
  );

  try {
    const db = getDatabase();
    const [preflight] = await db
      .select({
        userId: passwordResetTokens.userId,
        sessionVersionAtIssue: passwordResetTokens.sessionVersionAtIssue,
        expiresAt: passwordResetTokens.expiresAt,
        usedAt: passwordResetTokens.usedAt,
        revokedAt: passwordResetTokens.revokedAt,
        active: users.active,
        passwordHash: users.passwordHash,
        sessionVersion: users.sessionVersion,
        mfaRequired: users.mfaRequired,
        mfaProviderReference: users.mfaProviderReference,
      })
      .from(passwordResetTokens)
      .innerJoin(users, eq(users.id, passwordResetTokens.userId))
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    if (
      !preflight ||
      preflight.usedAt ||
      preflight.revokedAt ||
      preflight.expiresAt.getTime() <= now.getTime() ||
      !preflight.active ||
      !preflight.passwordHash ||
      preflight.sessionVersionAtIssue !== preflight.sessionVersion
    ) {
      return "invalid";
    }

    const preflightRoles = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, preflight.userId));
    const enforceStaffMfa = staffMfaRequired();
    const preflightIsStaff = preflightRoles.some(
      ({ role }) => role === "admin" || role === "curator",
    );
    let verifiedMfa:
      | { userId: string; providerReference: string }
      | undefined;
    if (preflightIsStaff && enforceStaffMfa) {
      if (!preflight.mfaRequired || !preflight.mfaProviderReference) {
        return "invalid";
      }
      const mfa = await verifyStaffMfa({
        userId: preflight.userId,
        providerReference: preflight.mfaProviderReference,
        code: input.mfaCode,
      });
      if (mfa === "unavailable") return "unavailable";
      if (mfa !== "verified") return "invalid";
      verifiedMfa = {
        userId: preflight.userId,
        providerReference: preflight.mfaProviderReference,
      };
    }

    // Derive the expensive password hash only after the reset token and any
    // required staff MFA have passed preflight validation. The async scrypt
    // path also keeps the Node event loop responsive under legitimate load.
    const passwordHash = await hashPasswordAsync(input.password);

    return await db.transaction(async (transaction) => {
      // Every reset for an identity locks that user before any token row. This
      // consistent order prevents two valid sibling tokens from deadlocking
      // while they revoke one another.
      const [lockedIdentity] = await transaction
        .select({
          id: users.id,
          active: users.active,
          passwordHash: users.passwordHash,
          sessionVersion: users.sessionVersion,
          mfaRequired: users.mfaRequired,
          mfaProviderReference: users.mfaProviderReference,
        })
        .from(users)
        .where(eq(users.id, preflight.userId))
        .for("update")
        .limit(1);

      if (!lockedIdentity || !lockedIdentity.active || !lockedIdentity.passwordHash) {
        return "invalid";
      }

      const [candidate] = await transaction
        .select({
          tokenId: passwordResetTokens.id,
          userId: passwordResetTokens.userId,
          sessionVersionAtIssue: passwordResetTokens.sessionVersionAtIssue,
          expiresAt: passwordResetTokens.expiresAt,
          usedAt: passwordResetTokens.usedAt,
          revokedAt: passwordResetTokens.revokedAt,
        })
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            eq(passwordResetTokens.userId, lockedIdentity.id),
          ),
        )
        .for("update")
        .limit(1);

      if (
        !candidate ||
        candidate.usedAt ||
        candidate.revokedAt ||
        candidate.expiresAt.getTime() <= now.getTime() ||
        candidate.sessionVersionAtIssue !== lockedIdentity.sessionVersion
      ) {
        return "invalid";
      }

      const roles = await transaction
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, lockedIdentity.id));
      const isStaff = roles.some(
        ({ role }) => role === "admin" || role === "curator",
      );
      const mfaVerified = isStaff && enforceStaffMfa;
      if (mfaVerified) {
        if (
          !lockedIdentity.mfaRequired ||
          !lockedIdentity.mfaProviderReference ||
          verifiedMfa?.userId !== lockedIdentity.id ||
          verifiedMfa.providerReference !== lockedIdentity.mfaProviderReference
        ) {
          return "invalid";
        }
      }

      const [claimed] = await transaction
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokens.id, candidate.tokenId),
            eq(passwordResetTokens.userId, lockedIdentity.id),
            eq(
              passwordResetTokens.sessionVersionAtIssue,
              lockedIdentity.sessionVersion,
            ),
            gt(passwordResetTokens.expiresAt, now),
            isNull(passwordResetTokens.usedAt),
            isNull(passwordResetTokens.revokedAt),
          ),
        )
        .returning({ id: passwordResetTokens.id });
      if (!claimed) return "invalid";

      const [updated] = await transaction
        .update(users)
        .set({
          passwordHash,
          sessionVersion: sql`${users.sessionVersion} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(users.id, lockedIdentity.id),
            eq(users.active, true),
            isNotNull(users.passwordHash),
            eq(users.sessionVersion, lockedIdentity.sessionVersion),
          ),
        )
        .returning({ id: users.id });
      if (!updated) throw new PasswordResetClaimError();

      await transaction
        .update(passwordResetTokens)
        .set({ revokedAt: now })
        .where(
          and(
            eq(passwordResetTokens.userId, lockedIdentity.id),
            ne(passwordResetTokens.id, candidate.tokenId),
            isNull(passwordResetTokens.usedAt),
            isNull(passwordResetTokens.revokedAt),
          ),
        );
      await transaction.insert(auditEvents).values({
        actorUserId: lockedIdentity.id,
        action: "auth.password_reset_completed",
        entityType: "user",
        entityId: lockedIdentity.id,
        metadata: {
          method: "email-token",
          sessionsInvalidated: true,
          siblingTokensRevoked: true,
          mfaVerified,
        },
        occurredAt: now,
      });
      return "reset";
    });
  } catch (error) {
    return error instanceof PasswordResetClaimError ? "invalid" : "unavailable";
  }
}
