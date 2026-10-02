import { createHash, randomBytes } from "node:crypto";
import { escapeHtml } from "@/lib/email/branded";
import { defaultEmailLogRecorder } from "@/lib/email/log-store";
import { EmailConfigurationError, type EmailMessage, type EmailSender } from "@/lib/email/smtp";

/**
 * Email delivery log.
 *
 * Every message the archive hands to a mail transport is recorded here with
 * its outcome, and HTML messages carry a one-pixel image whose URL lets the
 * log show a best-effort "opened" signal. Three rules shape everything in
 * this file:
 *
 * 1. The log never stores a live secret. Callers hand the logger the
 *    one-time token and the full link so both can be removed from the stored
 *    bodies, and a secret-independent sweep runs even when nothing is handed
 *    over.
 * 2. The log never changes delivery. A failed write is reported with a fixed
 *    console string and the sender's own outcome (success or the original
 *    error object) is returned untouched.
 * 3. The stored HTML never contains the tracking pixel, and the raw pixel
 *    token is never stored; only its SHA-256 is kept so a row can never be
 *    turned back into a working tracking URL.
 */

export const EMAIL_LOG_TYPES = [
  "password_reset",
  "invitation",
  "communication",
  "ai_usage_alert",
] as const;
export type EmailLogType = (typeof EMAIL_LOG_TYPES)[number];
export type EmailLogStatus = "sent" | "failed";
export type EmailLogTransport = "smtp" | "resend";

/** Closed vocabulary; never provider text, never error.message. */
export type EmailLogFailureReason =
  | `configuration: ${string}`
  | "invalid message"
  | "delivery failed"
  | "not attempted";

export const REDACTION_PLACEHOLDER = "[one-time link removed]";
export const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
export const TRACKING_PIXEL_PATH = "/api/email/open/";

const SUBJECT_LIMIT = 200;
const EMAIL_LIMIT = 320;
const NAME_LIMIT = 180;
const REASON_LIMIT = 120;
const MINIMUM_SECRET_LENGTH = 16;
const VARIABLE_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

export interface EmailLogMeta {
  emailType: EmailLogType;
  transport?: EmailLogTransport;
  locale?: "en" | "es" | null;
  recipientName?: string | null;
  recipientUserId?: string | null;
  communicationId?: string | null;
  actorUserId?: string | null;
  /** Raw secrets the stored bodies must not contain (token, full one-time link). */
  secrets?: readonly string[];
  /** Validated origin for the pixel URL; null/undefined means "not tracked". */
  trackingOrigin?: string | null;
  metadata?: Record<string, number | string | boolean> | null;
  now?: () => Date;
}

export interface EmailLogRow {
  emailType: EmailLogType;
  status: EmailLogStatus;
  transport: EmailLogTransport;
  failureReason: EmailLogFailureReason | null;
  recipientEmail: string | null;
  recipientName: string | null;
  recipientUserId: string | null;
  communicationId: string | null;
  actorUserId: string | null;
  locale: "en" | "es" | null;
  subject: string;
  replyTo: string | null;
  /** Already redacted. */
  textBody: string;
  /** Already redacted; never contains the tracking pixel. */
  htmlBody: string | null;
  metadata: Record<string, number | string | boolean> | null;
  /** sha256 hex; only for accepted HTML messages that carry a pixel. */
  trackingTokenHash: string | null;
  createdAt: Date;
}

export interface EmailLogRecorder {
  record(row: EmailLogRow): Promise<void>;
  markOpened(trackingTokenHash: string): Promise<void>;
}

export const noopEmailLogRecorder: EmailLogRecorder = {
  async record() {},
  async markOpened() {},
};

export function createTrackingToken(bytes: () => Buffer = () => randomBytes(24)): string {
  const token = bytes().toString("base64url");
  if (!TRACKING_TOKEN_PATTERN.test(token)) {
    throw new Error("The tracking token generator produced an unexpected shape.");
  }
  return token;
}

export function hashTrackingToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function trackingPixelMarkup(pixelUrl: string): string {
  return `<img src="${escapeHtml(pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
}

/**
 * Inserts the pixel before the last `</body>` (any case, optional trailing
 * whitespace); appends when there is none. The match runs on the original
 * string: lower-casing first would shift the index for characters such as
 * U+0130 whose lower-case form is longer than themselves.
 */
export function appendTrackingPixel(html: string, pixelUrl: string): string {
  const pixel = trackingPixelMarkup(pixelUrl);
  const closing = [...html.matchAll(/<\/body\s*>/gi)].at(-1);
  if (!closing || closing.index === undefined) return `${html}${pixel}`;
  return `${html.slice(0, closing.index)}${pixel}${html.slice(closing.index)}`;
}

/**
 * The origin pixel URLs are built on. Deliberately independent of the
 * password-reset origin check (which throws); this one answers null for
 * anything it does not like, and never throws.
 */
export function trackingOriginFromEnvironment(
  environment: { NEXT_PUBLIC_SITE_URL?: string; NODE_ENV?: string } = process.env,
): string | null {
  const raw = environment.NEXT_PUBLIC_SITE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const production = environment.NODE_ENV === "production";
    const protocolAllowed = production
      ? url.protocol === "https:"
      : url.protocol === "https:" || url.protocol === "http:";
    if (
      !protocolAllowed ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      url.origin === "null"
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

const SWEEP_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/#token=[A-Za-z0-9_\-%]+/g, "#token=[removed]"],
  [/%23token%3D[A-Za-z0-9_\-%]+/gi, "%23token%3D[removed]"],
  [/\btoken=[A-Za-z0-9_-]{32,}/g, "token=[removed]"],
];

function secretVariants(secret: string): string[] {
  const escaped = escapeHtml(secret);
  const encoded = encodeURIComponent(secret);
  return [secret, escaped, encoded, encodeURIComponent(escaped), escapeHtml(encoded)];
}

/**
 * Removes every handed-over secret (raw, HTML-escaped, URL-encoded, and the
 * doubly transformed forms) and then sweeps for token-shaped fragments the
 * caller may not have known about. Pure; never throws.
 */
export function redactSecrets(
  body: string,
  secrets: readonly string[],
  placeholder: string = REDACTION_PLACEHOLDER,
): string {
  const variants = new Set<string>();
  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length < MINIMUM_SECRET_LENGTH) continue;
    for (const variant of secretVariants(secret)) {
      if (variant.length >= MINIMUM_SECRET_LENGTH) variants.add(variant);
    }
  }
  let result = body;
  for (const variant of [...variants].sort((a, b) => b.length - a.length)) {
    result = result.split(variant).join(placeholder);
  }
  for (const [pattern, replacement] of SWEEP_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Maps any thrown value onto the closed failure vocabulary. Only the NAME of
 * a configuration variable is ever read; error messages are never consulted.
 */
export function failureReasonFor(
  error: unknown,
  phase: "send" | "setup" = "send",
): EmailLogFailureReason {
  const candidate =
    error instanceof EmailConfigurationError
      ? error.variable
      : error instanceof Error
        ? (error as Error & { variable?: unknown }).variable
        : undefined;
  const variable = typeof candidate === "string" ? candidate : null;
  if (variable !== null) {
    if (variable === "SMTP_CONFIGURATION") return "invalid message";
    if (VARIABLE_NAME_PATTERN.test(variable)) return `configuration: ${variable}`;
    return "configuration: UNKNOWN";
  }
  return phase === "setup" ? "not attempted" : "delivery failed";
}

function clamp(value: string | null | undefined, limit: number): string | null {
  if (typeof value !== "string") return null;
  return value.length > limit ? value.slice(0, limit) : value;
}

function localeOrNull(value: unknown): "en" | "es" | null {
  return value === "en" || value === "es" ? value : null;
}

function normalizeRow(row: EmailLogRow): EmailLogRow {
  return {
    ...row,
    failureReason: clamp(row.failureReason, REASON_LIMIT) as EmailLogFailureReason | null,
    recipientEmail: clamp(row.recipientEmail, EMAIL_LIMIT),
    recipientName: clamp(row.recipientName, NAME_LIMIT),
    locale: localeOrNull(row.locale),
    subject: clamp(row.subject, SUBJECT_LIMIT) ?? "",
    replyTo: clamp(row.replyTo, EMAIL_LIMIT),
  };
}

async function writeRow(row: EmailLogRow, recorder: EmailLogRecorder): Promise<void> {
  try {
    await recorder.record(normalizeRow(row));
  } catch {
    console.error(`Email log write failed for ${row.emailType} (${row.status}).`);
  }
}

/**
 * Wraps a sender so every call is recorded. The returned sender has the same
 * one-argument shape, resolves exactly when the wrapped sender resolves, and
 * rejects with the very same error object when it rejects.
 */
export function withEmailLog(
  send: EmailSender,
  meta: EmailLogMeta,
  recorder: EmailLogRecorder = defaultEmailLogRecorder(),
): EmailSender {
  const secrets = meta.secrets ?? [];
  return async (message: EmailMessage): Promise<void> => {
    const now = meta.now?.() ?? new Date();
    const origin = meta.trackingOrigin ?? null;
    const tracked = typeof message.html === "string" && message.html.length > 0 && origin !== null;

    let outgoing: EmailMessage = message;
    let tokenHash: string | null = null;
    if (tracked) {
      const token = createTrackingToken();
      tokenHash = hashTrackingToken(token);
      outgoing = {
        ...message,
        html: appendTrackingPixel(message.html as string, `${origin}${TRACKING_PIXEL_PATH}${token}`),
      };
    }

    // Rows are always built from the ORIGINAL message: the pixel lives only
    // in `outgoing`, and the raw token lives only in the scope above.
    const rowFor = (
      status: EmailLogStatus,
      failureReason: EmailLogFailureReason | null,
      trackingTokenHash: string | null,
    ): EmailLogRow => ({
      emailType: meta.emailType,
      status,
      transport: meta.transport ?? "smtp",
      failureReason,
      recipientEmail: message.to,
      recipientName: meta.recipientName ?? null,
      recipientUserId: meta.recipientUserId ?? null,
      communicationId: meta.communicationId ?? null,
      actorUserId: meta.actorUserId ?? null,
      locale: meta.locale ?? null,
      subject: message.subject,
      replyTo: message.replyTo ?? null,
      textBody: redactSecrets(message.text, secrets),
      htmlBody: typeof message.html === "string" ? redactSecrets(message.html, secrets) : null,
      metadata: meta.metadata ?? null,
      trackingTokenHash,
      createdAt: now,
    });

    try {
      await send(outgoing);
    } catch (error) {
      await writeRow(rowFor("failed", failureReasonFor(error, "send"), null), recorder);
      throw error;
    }
    await writeRow(rowFor("sent", null, tokenHash), recorder);
  };
}

export type EmailAttemptInput = Omit<
  EmailLogRow,
  "createdAt" | "trackingTokenHash" | "transport" | "replyTo" | "textBody" | "htmlBody" | "metadata"
> &
  Partial<Pick<EmailLogRow, "transport" | "replyTo" | "textBody" | "htmlBody" | "metadata">> & {
    now?: () => Date;
  };

/** Records an attempt that never reached a transport (configuration refusals). Never throws. */
export async function recordEmailAttempt(
  input: EmailAttemptInput,
  recorder: EmailLogRecorder = defaultEmailLogRecorder(),
): Promise<void> {
  const { now, ...rest } = input;
  await writeRow(
    {
      ...rest,
      transport: rest.transport ?? "smtp",
      replyTo: rest.replyTo ?? null,
      textBody: redactSecrets(rest.textBody ?? "", []),
      htmlBody: typeof rest.htmlBody === "string" ? redactSecrets(rest.htmlBody, []) : null,
      metadata: rest.metadata ?? null,
      trackingTokenHash: null,
      createdAt: now?.() ?? new Date(),
    },
    recorder,
  );
}
