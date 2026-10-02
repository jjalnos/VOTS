import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDatabase, type ArchiveDatabase } from "@/db/client";
import { communications, emailLog, users } from "@/db/schema";
import {
  EMAIL_LOG_TYPES,
  type EmailLogFailureReason,
  type EmailLogStatus,
  type EmailLogTransport,
  type EmailLogType,
} from "@/lib/email/log";

/**
 * Read side of the email log: URL parameter parsing, href building, and the
 * drizzle builders behind the admin pages. Every user-supplied value is a
 * bound parameter or a whitelisted key; nothing is interpolated into SQL.
 */

export const EMAIL_LOG_PAGE_SIZE = 25;
export const EMAIL_LOG_MAX_PAGE = 10_000;

export const EMAIL_LOG_OPENED_FILTERS = ["opened", "unopened", "untracked"] as const;
export type EmailLogOpenedFilter = (typeof EMAIL_LOG_OPENED_FILTERS)[number];

export const EMAIL_LOG_SORT_KEYS = [
  "created_at",
  "subject",
  "recipient",
  "status",
  "type",
  "opened_at",
  "open_count",
] as const;
export type EmailLogSortKey = (typeof EMAIL_LOG_SORT_KEYS)[number];
export type EmailLogSortDirection = "asc" | "desc";

export interface EmailLogSearchParams {
  q: string;
  status: EmailLogStatus | "all";
  opened: EmailLogOpenedFilter | "any";
  type: EmailLogType | "all";
  sort: EmailLogSortKey;
  dir: EmailLogSortDirection;
  page: number;
}

export const EMAIL_LOG_DEFAULT_PARAMS: EmailLogSearchParams = {
  q: "",
  status: "all",
  opened: "any",
  type: "all",
  sort: "created_at",
  dir: "desc",
  page: 1,
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function parsePage(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, EMAIL_LOG_MAX_PAGE);
}

export function parseEmailLogSearchParams(searchParams: RawSearchParams): EmailLogSearchParams {
  return {
    q: (firstValue(searchParams.q) ?? "").trim().slice(0, 180),
    status: oneOf(firstValue(searchParams.status), ["sent", "failed"] as const) ?? "all",
    opened: oneOf(firstValue(searchParams.opened), EMAIL_LOG_OPENED_FILTERS) ?? "any",
    type: oneOf(firstValue(searchParams.type), EMAIL_LOG_TYPES) ?? "all",
    sort: oneOf(firstValue(searchParams.sort), EMAIL_LOG_SORT_KEYS) ?? "created_at",
    dir: oneOf(firstValue(searchParams.dir), ["asc", "desc"] as const) ?? "desc",
    page: parsePage(firstValue(searchParams.page)),
  };
}

export function emailLogHasFilters(params: EmailLogSearchParams): boolean {
  return (
    params.q !== "" || params.status !== "all" || params.opened !== "any" || params.type !== "all"
  );
}

/** `lang` first when given, defaults omitted, so the same filters always serialize the same way. */
function emailLogQuery(params: Partial<EmailLogSearchParams>, locale?: "en" | "es"): string {
  const query = new URLSearchParams();
  if (locale) query.set("lang", locale);
  const merged = { ...EMAIL_LOG_DEFAULT_PARAMS, ...params };
  if (merged.q) query.set("q", merged.q);
  if (merged.status !== "all") query.set("status", merged.status);
  if (merged.opened !== "any") query.set("opened", merged.opened);
  if (merged.type !== "all") query.set("type", merged.type);
  if (merged.sort !== "created_at") query.set("sort", merged.sort);
  if (merged.dir !== "desc") query.set("dir", merged.dir);
  if (merged.page > 1) query.set("page", String(merged.page));
  return query.toString();
}

function entryPath(id: string): string {
  return `/admin/email-log/${encodeURIComponent(id)}`;
}

export function emailLogHref(
  params: Partial<EmailLogSearchParams>,
  locale: "en" | "es",
): string {
  return `/admin/email-log?${emailLogQuery(params, locale)}`;
}

/**
 * The detail page carries the list's non-default filters along so the back
 * link and the language switch can return to the same place in the register.
 */
export function emailLogEntryHref(
  id: string,
  locale: "en" | "es",
  params: Partial<EmailLogSearchParams> = {},
): string {
  return `${entryPath(id)}?${emailLogQuery(params, locale)}`;
}

/**
 * Where the EN/ES switch points: the same page and filters with no `lang`,
 * which the switch adds itself. A URL that already carried one would keep
 * its first `lang` and the switch would never take.
 */
export function emailLogSwitchPath(params: Partial<EmailLogSearchParams>): string {
  const query = emailLogQuery(params);
  return query ? `/admin/email-log?${query}` : "/admin/email-log";
}

export function emailLogEntrySwitchPath(
  id: string,
  params: Partial<EmailLogSearchParams> = {},
): string {
  const query = emailLogQuery(params);
  return query ? `${entryPath(id)}?${query}` : entryPath(id);
}

/** Escapes LIKE metacharacters; Postgres' default escape character is the backslash. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function emailLogWhere(params: EmailLogSearchParams): SQL | undefined {
  const conditions: SQL[] = [];
  if (params.q) {
    const pattern = `%${escapeLike(params.q)}%`;
    const search = or(
      ilike(emailLog.recipientEmail, pattern),
      ilike(emailLog.recipientName, pattern),
      ilike(emailLog.subject, pattern),
      ilike(emailLog.emailType, pattern),
      ilike(emailLog.failureReason, pattern),
    );
    if (search) conditions.push(search);
  }
  if (params.status !== "all") conditions.push(eq(emailLog.status, params.status));
  if (params.opened === "opened") conditions.push(isNotNull(emailLog.openedAt));
  if (params.opened === "unopened") {
    conditions.push(isNotNull(emailLog.trackingTokenHash), isNull(emailLog.openedAt));
  }
  if (params.opened === "untracked") conditions.push(isNull(emailLog.trackingTokenHash));
  if (params.type !== "all") conditions.push(eq(emailLog.emailType, params.type));
  return conditions.length ? and(...conditions) : undefined;
}

const SORT_COLUMNS = {
  created_at: emailLog.createdAt,
  subject: emailLog.subject,
  recipient: emailLog.recipientEmail,
  status: emailLog.status,
  type: emailLog.emailType,
  opened_at: emailLog.openedAt,
  open_count: emailLog.openCount,
} as const satisfies Record<EmailLogSortKey, unknown>;

function orderFor(params: EmailLogSearchParams): SQL[] {
  const column = SORT_COLUMNS[params.sort];
  const primary = params.dir === "asc" ? sql`${asc(column)} nulls last` : sql`${desc(column)} nulls last`;
  return [primary, desc(emailLog.createdAt), desc(emailLog.id)];
}

export interface EmailLogListRow {
  id: string;
  emailType: EmailLogType;
  status: EmailLogStatus;
  failureReason: EmailLogFailureReason | null;
  recipientEmail: string | null;
  recipientName: string | null;
  subject: string;
  trackingTokenHash: string | null;
  openedAt: Date | null;
  lastOpenedAt: Date | null;
  openCount: number;
  createdAt: Date;
}

const LIST_COLUMNS = {
  id: emailLog.id,
  emailType: emailLog.emailType,
  status: emailLog.status,
  failureReason: emailLog.failureReason,
  recipientEmail: emailLog.recipientEmail,
  recipientName: emailLog.recipientName,
  subject: emailLog.subject,
  trackingTokenHash: emailLog.trackingTokenHash,
  openedAt: emailLog.openedAt,
  lastOpenedAt: emailLog.lastOpenedAt,
  openCount: emailLog.openCount,
  createdAt: emailLog.createdAt,
};

export function emailLogListQuery(db: ArchiveDatabase, params: EmailLogSearchParams) {
  return db
    .select(LIST_COLUMNS)
    .from(emailLog)
    .where(emailLogWhere(params))
    .orderBy(...orderFor(params))
    .limit(EMAIL_LOG_PAGE_SIZE)
    .offset((params.page - 1) * EMAIL_LOG_PAGE_SIZE);
}

export function emailLogCountQuery(db: ArchiveDatabase, params: EmailLogSearchParams) {
  return db
    .select({ value: sql<number>`cast(count(*) as integer)` })
    .from(emailLog)
    .where(emailLogWhere(params));
}

export function emailLogSummaryQuery(db: ArchiveDatabase, since: Date) {
  return db
    .select({
      accepted: sql<number>`cast(count(*) filter (where ${emailLog.status} = 'sent') as integer)`,
      opened: sql<number>`cast(count(*) filter (where ${emailLog.openedAt} is not null) as integer)`,
      failed: sql<number>`cast(count(*) filter (where ${emailLog.status} = 'failed') as integer)`,
      // Bound through the column operator, not a raw `${since}`: raw template
      // values skip drizzle's driver mapping, and postgres-js refuses a Date.
      recent: sql<number>`cast(count(*) filter (where ${gte(emailLog.createdAt, since)}) as integer)`,
    })
    .from(emailLog);
}

const actors = alias(users, "actors");

export function emailLogEntryQuery(db: ArchiveDatabase, id: string) {
  return db
    .select({
      id: emailLog.id,
      emailType: emailLog.emailType,
      status: emailLog.status,
      transport: emailLog.transport,
      failureReason: emailLog.failureReason,
      recipientEmail: emailLog.recipientEmail,
      recipientName: emailLog.recipientName,
      recipientUserId: emailLog.recipientUserId,
      communicationId: emailLog.communicationId,
      actorUserId: emailLog.actorUserId,
      locale: emailLog.locale,
      subject: emailLog.subject,
      replyTo: emailLog.replyTo,
      textBody: emailLog.textBody,
      htmlBody: emailLog.htmlBody,
      metadata: emailLog.metadata,
      trackingTokenHash: emailLog.trackingTokenHash,
      openedAt: emailLog.openedAt,
      lastOpenedAt: emailLog.lastOpenedAt,
      openCount: emailLog.openCount,
      createdAt: emailLog.createdAt,
      actorEmail: actors.email,
      actorDisplayName: actors.displayName,
      communicationSubject: communications.subject,
    })
    .from(emailLog)
    .leftJoin(actors, eq(actors.id, emailLog.actorUserId))
    .leftJoin(communications, eq(communications.id, emailLog.communicationId))
    .where(eq(emailLog.id, id))
    .limit(1);
}

export interface EmailLogPage {
  rows: EmailLogListRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  firstResult: number;
  lastResult: number;
}

/**
 * Counts first, then lists: a page number past the end (a stale bookmark, or
 * rows deleted since) is clamped to the last page instead of showing an empty
 * table with a "Showing 501–500" range.
 */
export async function listEmailLog(
  params: EmailLogSearchParams,
  db: ArchiveDatabase = getDatabase(),
): Promise<EmailLogPage> {
  const [count] = await emailLogCountQuery(db, params);
  const total = Number(count?.value ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / EMAIL_LOG_PAGE_SIZE));
  const page = Math.min(params.page, pageCount);
  const rows = await emailLogListQuery(db, { ...params, page });
  const firstResult = total === 0 ? 0 : (page - 1) * EMAIL_LOG_PAGE_SIZE + 1;
  const lastResult = total === 0 ? 0 : Math.min(total, firstResult + rows.length - 1);
  return {
    rows: rows as EmailLogListRow[],
    total,
    page,
    pageCount,
    pageSize: EMAIL_LOG_PAGE_SIZE,
    firstResult,
    lastResult,
  };
}

export interface EmailLogSummary {
  accepted: number;
  opened: number;
  failed: number;
  recent: number;
}

export const EMAIL_LOG_RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function emailLogSummary(
  now: Date = new Date(),
  db: ArchiveDatabase = getDatabase(),
): Promise<EmailLogSummary> {
  const since = new Date(now.getTime() - EMAIL_LOG_RECENT_WINDOW_MS);
  const [row] = await emailLogSummaryQuery(db, since);
  return {
    accepted: Number(row?.accepted ?? 0),
    opened: Number(row?.opened ?? 0),
    failed: Number(row?.failed ?? 0),
    recent: Number(row?.recent ?? 0),
  };
}

export interface EmailLogEntry {
  id: string;
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
  textBody: string;
  htmlBody: string | null;
  metadata: Record<string, number | string | boolean> | null;
  trackingTokenHash: string | null;
  openedAt: Date | null;
  lastOpenedAt: Date | null;
  openCount: number;
  createdAt: Date;
  actorEmail: string | null;
  actorDisplayName: string | null;
  communicationSubject: string | null;
}

export async function emailLogEntry(
  id: string,
  db: ArchiveDatabase = getDatabase(),
): Promise<EmailLogEntry | null> {
  const [row] = await emailLogEntryQuery(db, id);
  return (row as EmailLogEntry | undefined) ?? null;
}
