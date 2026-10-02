import type { Metadata } from "next";
import Link from "next/link";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireAction } from "@/lib/auth/server-session";
import type { Locale } from "@/lib/domain/types";
import { EMAIL_LOG_TYPES } from "@/lib/email/log";
import {
  copy,
  displayDate,
  failureReasonLabel,
  fill,
  openLoadsLabel,
  openSignalLabel,
  openSignalState,
  resultsLabel,
  statusLabel,
  subjectLabel,
  typeLabel,
} from "@/lib/email/log-presentation";
import {
  EMAIL_LOG_OPENED_FILTERS,
  EMAIL_LOG_SORT_KEYS,
  emailLogEntryHref,
  emailLogHasFilters,
  emailLogHref,
  emailLogSummary,
  emailLogSwitchPath,
  listEmailLog,
  parseEmailLogSearchParams,
  type EmailLogListRow,
  type EmailLogPage,
  type EmailLogSearchParams,
  type EmailLogSummary,
} from "@/lib/email/log-queries";
import { localeFrom } from "@/lib/i18n";
import { configuredDataAdapter } from "@/lib/repository";
import styles from "./email-log.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Email log",
  robots: { index: false, follow: false },
};

function SummaryCards({ summary, locale }: { summary: EmailLogSummary; locale: Locale }) {
  const cards: Array<[string, number]> = [
    [copy(locale, "card.accepted"), summary.accepted],
    [copy(locale, "card.opened"), summary.opened],
    [copy(locale, "card.failed"), summary.failed],
    [copy(locale, "card.recent"), summary.recent],
  ];
  return (
    <div className={styles.summary}>
      {cards.map(([label, value]) => (
        <div className="metric" key={label}>
          <strong>{value.toLocaleString(locale === "es" ? "es-US" : "en-US")}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function Filters({ params, locale }: { params: EmailLogSearchParams; locale: Locale }) {
  return (
    <form className="card" method="get" action="/admin/email-log" role="search">
      <input type="hidden" name="lang" value={locale} />
      <div className={styles.filters}>
        <div className="field">
          <label htmlFor="email-log-q">{copy(locale, "filter.search")}</label>
          <input
            id="email-log-q"
            name="q"
            type="search"
            maxLength={180}
            defaultValue={params.q}
            placeholder={copy(locale, "filter.searchPlaceholder")}
          />
        </div>
        <div className="field">
          <label htmlFor="email-log-status">{copy(locale, "filter.status")}</label>
          <select id="email-log-status" name="status" defaultValue={params.status}>
            <option value="">{copy(locale, "filter.status.all")}</option>
            <option value="sent">{copy(locale, "status.sent")}</option>
            <option value="failed">{copy(locale, "status.failed")}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="email-log-opened">{copy(locale, "filter.opened")}</label>
          <select id="email-log-opened" name="opened" defaultValue={params.opened}>
            <option value="">{copy(locale, "filter.opened.any")}</option>
            {EMAIL_LOG_OPENED_FILTERS.map((value) => (
              <option value={value} key={value}>
                {copy(locale, `filter.opened.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="email-log-type">{copy(locale, "filter.type")}</label>
          <select id="email-log-type" name="type" defaultValue={params.type}>
            <option value="">{copy(locale, "filter.type.all")}</option>
            {EMAIL_LOG_TYPES.map((value) => (
              <option value={value} key={value}>
                {typeLabel(locale, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="email-log-sort">{copy(locale, "filter.sort")}</label>
          <select id="email-log-sort" name="sort" defaultValue={params.sort}>
            {EMAIL_LOG_SORT_KEYS.map((value) => (
              <option value={value} key={value}>
                {copy(locale, `sort.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="email-log-dir">{copy(locale, "filter.dir")}</label>
          <select id="email-log-dir" name="dir" defaultValue={params.dir}>
            <option value="desc">{copy(locale, "dir.desc")}</option>
            <option value="asc">{copy(locale, "dir.asc")}</option>
          </select>
        </div>
        <button type="submit" className="button">
          {copy(locale, "filter.apply")}
        </button>
        <Link href={emailLogHref({}, locale)} className="button secondary">
          {copy(locale, "filter.clear")}
        </Link>
      </div>
    </form>
  );
}

/**
 * One row of the register. The link's visible text is the subject, so what a
 * voice user says matches what a sighted user reads; the recipient follows
 * for screen readers alone, which keeps every row's link distinct in a list
 * of links without renaming it.
 */
function Row({
  row,
  params,
  locale,
}: {
  row: EmailLogListRow;
  params: EmailLogSearchParams;
  locale: Locale;
}) {
  const recipient = row.recipientEmail ?? copy(locale, "detail.noRecipient");
  const state = openSignalState(row);
  return (
    <tr role="row">
      <td role="cell" data-label={copy(locale, "col.email")}>
        <Link href={emailLogEntryHref(row.id, locale, params)} className={styles.subject}>
          {subjectLabel(locale, row.subject)}
          <span className="sr-only">{` — ${fill(copy(locale, "row.view"), { recipient })}`}</span>
        </Link>
        <span className={styles.muted}>{typeLabel(locale, row.emailType)}</span>
      </td>
      <td role="cell" data-label={copy(locale, "col.recipient")}>
        {row.recipientName ? (
          <>
            {row.recipientName}
            <span className={styles.muted}>{recipient}</span>
          </>
        ) : (
          recipient
        )}
      </td>
      <td role="cell" data-label={copy(locale, "col.status")}>
        <StatusPill tone={row.status === "sent" ? "approved" : "private"}>
          {statusLabel(locale, row.status)}
        </StatusPill>
        {row.status === "failed" && row.failureReason ? (
          <span className={styles.muted}>{failureReasonLabel(locale, row.failureReason)}</span>
        ) : null}
      </td>
      <td role="cell" data-label={copy(locale, "col.open")}>
        {openSignalLabel(locale, row)}
        {state === "opened" ? (
          <span className={styles.muted}>
            {openLoadsLabel(locale, row.openCount)}
            {row.lastOpenedAt && row.openCount > 1
              ? ` · ${copy(locale, "detail.lastOpened")}: ${displayDate(row.lastOpenedAt, locale)}`
              : ""}
          </span>
        ) : null}
      </td>
      <td role="cell" data-label={copy(locale, "col.when")}>
        <time dateTime={row.createdAt.toISOString()}>{displayDate(row.createdAt, locale)}</time>
      </td>
    </tr>
  );
}

function Results({
  page,
  params,
  locale,
}: {
  page: EmailLogPage;
  params: EmailLogSearchParams;
  locale: Locale;
}) {
  if (page.total === 0) {
    return (
      <p className={styles.emptyState}>
        {copy(locale, emailLogHasFilters(params) ? "empty.filtered" : "empty.none")}
      </p>
    );
  }
  return (
    <>
      <div className={styles.tableWrap}>
        {/* The narrow layout restyles rows as blocks, which makes browsers
            drop the table from the accessibility tree; the explicit roles
            keep it a table for assistive technology at every width. */}
        <table className={styles.table} role="table">
          <caption className="sr-only">{copy(locale, "title")}</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">{copy(locale, "col.email")}</th>
              <th scope="col" role="columnheader">{copy(locale, "col.recipient")}</th>
              <th scope="col" role="columnheader">{copy(locale, "col.status")}</th>
              <th scope="col" role="columnheader">{copy(locale, "col.open")}</th>
              <th scope="col" role="columnheader">{copy(locale, "col.when")}</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {page.rows.map((row) => (
              <Row row={row} params={params} locale={locale} key={row.id} />
            ))}
          </tbody>
        </table>
      </div>
      {page.pageCount > 1 ? (
        <nav className={styles.pagination} aria-label={copy(locale, "page.label")}>
          <p>{fill(copy(locale, "page.of"), { n: page.page, m: page.pageCount })}</p>
          <div className="button-row">
            {page.page > 1 ? (
              <Link
                href={emailLogHref({ ...params, page: page.page - 1 }, locale)}
                className="button secondary"
                rel="prev"
              >
                {copy(locale, "page.prev")}
              </Link>
            ) : null}
            {page.page < page.pageCount ? (
              <Link
                href={emailLogHref({ ...params, page: page.page + 1 }, locale)}
                className="button secondary"
                rel="next"
              >
                {copy(locale, "page.next")}
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}

/**
 * The email log: what the archive handed to the mail server, what the server
 * said, and whether anybody's mail client fetched the open pixel since.
 */
export default async function EmailLogPage({ searchParams }: PageProps<"/admin/email-log">) {
  const raw = await searchParams;
  const locale = localeFrom(raw.lang);
  const actor = await requireAction("view_email_log", "/admin/email-log");
  const params = parseEmailLogSearchParams(raw);
  const writable = configuredDataAdapter() === "postgres";

  const [summary, page] = writable
    ? await Promise.all([emailLogSummary(), listEmailLog(params)])
    : [
        { accepted: 0, opened: 0, failed: 0, recent: 0 },
        {
          rows: [],
          total: 0,
          page: 1,
          pageCount: 1,
          pageSize: 25,
          firstResult: 0,
          lastResult: 0,
        },
      ];

  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/admin/email-log"
      switchPath={emailLogSwitchPath(params)}
      title={copy(locale, "title")}
      description={copy(locale, "description")}
    >
      <section className="section">
        <div className="content-wrap">
          {!writable ? <p className="notice">{copy(locale, "mockNotice")}</p> : null}
          <SummaryCards summary={summary} locale={locale} />
          <p className={`notice ${styles.caveat}`}>{copy(locale, "caveat")}</p>
          <Filters params={params} locale={locale} />
          <h2 className={styles.resultsHeading}>
            {resultsLabel(locale, page.total)}
            {page.total > 0 ? (
              <span>
                {fill(copy(locale, "results.range"), {
                  from: page.firstResult,
                  to: page.lastResult,
                  total: page.total,
                })}
              </span>
            ) : null}
          </h2>
          <Results page={page} params={params} locale={locale} />
        </div>
      </section>
    </WorkspaceShell>
  );
}
