import { desc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { auditEvents, communications, users } from "@/db/schema";
import type { Actor } from "@/lib/auth/policy";
import { can } from "@/lib/auth/policy";
import { brandedEmail } from "@/lib/email/branded";
import {
  createPooledSmtpEmailSender,
  EmailConfigurationError,
  smtpConfigurationFromEnvironment,
  type EmailSender,
} from "@/lib/email/smtp";

/**
 * A committee mailing is a letter, not a blast: the audience is the archive's
 * own accounts, and the caps keep one send inside what a person would
 * deliberately write.
 */
export const MAX_COMMUNICATION_RECIPIENTS = 50;
export const MAX_COMMUNICATION_BODY_LENGTH = 5_000;
export const MAX_COMMUNICATION_SUBJECT_LENGTH = 150;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f\u2028\u2029]/g;
/** Like CONTROL_CHARACTERS but newlines survive: the body keeps its shape. */
const BODY_CONTROL_CHARACTERS = /[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]/g;

export class CommunicationValidationError extends Error {}
export class CommunicationAuthorizationError extends Error {}

export interface CommunicationInput {
  subject: string;
  body: string;
  locale: "en" | "es";
  recipientUserIds: string[];
  link?: { label: string; url: string };
}

export interface CommunicationRecipientOutcome {
  userId: string;
  email: string;
  displayName: string;
  status: "pending" | "sent" | "failed";
}

export interface CommunicationRecord {
  id: string;
  channel: string;
  subject: string;
  body: string;
  locale: string;
  linkLabel?: string;
  linkUrl?: string;
  recipients: CommunicationRecipientOutcome[];
  sentCount: number;
  failedCount: number;
  sentBy: string;
  createdAt: string;
}

function requireSendCommunications(actor: Actor): void {
  if (!can(actor, "send_communications")) {
    throw new CommunicationAuthorizationError("Access denied.");
  }
}

export function normalizeCommunicationInput(input: CommunicationInput): CommunicationInput {
  const subject = input.subject.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
  const body = input.body
    .replace(/\r\n?/g, "\n")
    .replace(BODY_CONTROL_CHARACTERS, " ")
    .trim();
  const recipientUserIds = [...new Set(input.recipientUserIds)];
  if (subject.length < 3 || subject.length > MAX_COMMUNICATION_SUBJECT_LENGTH) {
    throw new CommunicationValidationError("A subject between 3 and 150 characters is required.");
  }
  if (body.length < 3 || body.length > MAX_COMMUNICATION_BODY_LENGTH) {
    throw new CommunicationValidationError("A message between 3 and 5,000 characters is required.");
  }
  if (recipientUserIds.length === 0) {
    throw new CommunicationValidationError("At least one recipient is required.");
  }
  if (recipientUserIds.length > MAX_COMMUNICATION_RECIPIENTS) {
    throw new CommunicationValidationError("A single message can reach at most 50 accounts.");
  }
  let link: CommunicationInput["link"];
  if (input.link) {
    const label = input.link.label.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
    const url = input.link.url.trim();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new CommunicationValidationError("The link must be a full https address.");
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      label.length < 2 ||
      label.length > 80
    ) {
      throw new CommunicationValidationError("The link needs an https address and a short label.");
    }
    // The canonical serialization, never the raw string: the WHATWG parser has
    // already stripped embedded tabs and newlines and encoded spaces, so what
    // is stored and mailed is exactly the address the button resolves to.
    link = { label, url: parsed.href };
  }
  return { subject, body, locale: input.locale, recipientUserIds, link };
}

/** The branded email for one communication; exported for tests and previews. */
export function communicationEmail(input: {
  subject: string;
  body: string;
  locale: "en" | "es";
  link?: { label: string; url: string };
}): { subject: string; text: string; html: string } {
  // A blank line starts a new paragraph — exactly what the composer
  // promises. Single newlines inside a paragraph flow like a letter's line
  // wraps: they become spaces.
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0);
  const branded = brandedEmail({
    locale: input.locale,
    heading: input.subject,
    paragraphs,
    callToAction: input.link,
    footerVariant: "personal",
  });
  return { subject: input.subject, ...branded };
}

export type CommunicationSendStatus = "sent" | "partial" | "failed" | "unconfigured";

/**
 * Sends one email communication to a set of the archive's own accounts. The
 * record is written first with every delivery pending, then updated with the
 * real outcomes — a crash mid-send leaves an honest trail rather than emails
 * no record admits to.
 */
export async function sendCommunication(input: {
  actor: Actor;
  communication: CommunicationInput;
  now?: Date;
  send?: EmailSender;
}): Promise<{ status: CommunicationSendStatus; id?: string; sentCount: number; failedCount: number }> {
  requireSendCommunications(input.actor);
  const normalized = normalizeCommunicationInput(input.communication);
  const now = input.now ?? new Date();

  let send = input.send;
  let closeSender: (() => void) | undefined;
  if (!send) {
    try {
      const pooled = createPooledSmtpEmailSender(smtpConfigurationFromEnvironment());
      send = pooled.send;
      closeSender = pooled.close;
    } catch (error) {
      if (error instanceof EmailConfigurationError) {
        return { status: "unconfigured", sentCount: 0, failedCount: 0 };
      }
      throw error;
    }
  }

  const message = communicationEmail(normalized);
  // The transport enforces hard size bounds per message; hitting them AFTER
  // the record exists would fail every delivery behind an inserted row, so
  // an oversized letter is refused up front instead.
  if (message.text.length > 95_000 || (message.html?.length ?? 0) > 190_000) {
    closeSender?.();
    throw new CommunicationValidationError(
      "The message renders too large to send. Shorten it or split it into two messages.",
    );
  }
  const replyTo =
    /^\S+@\S+\.\S+$/.test(input.actor.email) ? input.actor.email : undefined;
  const db = getDatabase();

  const targets = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      active: users.active,
    })
    .from(users)
    .where(inArray(users.id, normalized.recipientUserIds));
  if (
    targets.length !== normalized.recipientUserIds.length ||
    targets.some((target) => !target.active)
  ) {
    throw new CommunicationValidationError(
      "Every recipient must be an existing, active account.",
    );
  }

  const recipients: CommunicationRecipientOutcome[] = targets.map((target) => ({
    userId: target.id,
    email: target.email,
    displayName: target.displayName,
    status: "pending" as const,
  }));

  const [created] = await db
    .insert(communications)
    .values({
      channel: "email",
      subject: normalized.subject,
      body: normalized.body,
      linkLabel: normalized.link?.label ?? null,
      linkUrl: normalized.link?.url ?? null,
      locale: normalized.locale,
      recipients,
      sentCount: 0,
      failedCount: 0,
      sentBy: input.actor.userId,
      createdAt: now,
    })
    .returning({ id: communications.id });
  if (!created) {
    throw new CommunicationValidationError("The message could not be recorded.");
  }

  let sentCount = 0;
  let failedCount = 0;
  try {
    for (const recipient of recipients) {
      try {
        await send({
          to: recipient.email,
          ...message,
          ...(replyTo ? { replyTo } : {}),
        });
        recipient.status = "sent";
        sentCount += 1;
      } catch {
        recipient.status = "failed";
        failedCount += 1;
      }
    }
  } finally {
    closeSender?.();
  }

  const finishedAt = new Date();
  await db.transaction(async (transaction) => {
    await transaction
      .update(communications)
      .set({ recipients, sentCount, failedCount })
      .where(eq(communications.id, created.id));
    await transaction.insert(auditEvents).values({
      actorUserId: input.actor.userId,
      action: "communications.email_sent",
      entityType: "communication",
      entityId: created.id,
      metadata: {
        recipientCount: recipients.length,
        sentCount,
        failedCount,
        locale: normalized.locale,
      },
      occurredAt: finishedAt,
    });
  });

  const status: CommunicationSendStatus =
    failedCount === 0 ? "sent" : sentCount === 0 ? "failed" : "partial";
  return { status, id: created.id, sentCount, failedCount };
}

/** The most recent messages, newest first, for the communications log. */
export async function listCommunications(actor: Actor, limit = 20): Promise<CommunicationRecord[]> {
  requireSendCommunications(actor);
  const db = getDatabase();
  const rows = await db
    .select()
    .from(communications)
    .orderBy(desc(communications.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    locale: row.locale,
    linkLabel: row.linkLabel ?? undefined,
    linkUrl: row.linkUrl ?? undefined,
    recipients: row.recipients,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    sentBy: row.sentBy,
    createdAt: row.createdAt.toISOString(),
  }));
}
