import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireAction } from "@/lib/auth/server-session";
import type { Locale } from "@/lib/domain/types";
import {
  copy,
  displayDate,
  failureReasonLabel,
  fill,
  openLoadsLabel,
  openSignalLabel,
  previewDocument,
  statusLabel,
  subjectLabel,
  typeLabel,
} from "@/lib/email/log-presentation";
import {
  emailLogEntry,
  emailLogEntrySwitchPath,
  emailLogHref,
  parseEmailLogSearchParams,
  type EmailLogEntry,
} from "@/lib/email/log-queries";
import { localeFrom, withLocale } from "@/lib/i18n";
import { configuredDataAdapter } from "@/lib/repository";
import styles from "../email-log.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Email log entry",
  robots: { index: false, follow: false },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function MetaList({ entry, locale }: { entry: EmailLogEntry; locale: Locale }) {
  const sent = entry.status === "sent";
  const intended = entry.metadata?.intendedRecipients;
  return (
    <dl className={styles.meta}>
      <dt>{copy(locale, "detail.recipient")}</dt>
      <dd>
        {entry.recipientEmail ? (
          <>
            {entry.recipientName ? `${entry.recipientName} · ` : ""}
            {entry.recipientEmail}
          </>
        ) : (
          copy(locale, "detail.noRecipient")
        )}
      </dd>

      <dt>{copy(locale, "detail.status")}</dt>
      <dd>
        {statusLabel(locale, entry.status)}
        <p>
          {sent
            ? copy(locale, "detail.sentExplainer")
            : fill(copy(locale, "detail.failedExplainer"), {
                reason: failureReasonLabel(locale, entry.failureReason),
              })}
        </p>
      </dd>

      <dt>{copy(locale, "detail.open")}</dt>
      <dd>
        {openSignalLabel(locale, entry)}
        {entry.openedAt ? (
          <p>
            {copy(locale, "detail.firstOpened")}: {displayDate(entry.openedAt, locale)}
            {entry.lastOpenedAt
              ? ` · ${copy(locale, "detail.lastOpened")}: ${displayDate(entry.lastOpenedAt, locale)}`
              : ""}
            {` · ${openLoadsLabel(locale, entry.openCount)}`}
          </p>
        ) : null}
      </dd>

      <dt>{copy(locale, "detail.sentAt")}</dt>
      <dd>
        <time dateTime={entry.createdAt.toISOString()}>{displayDate(entry.createdAt, locale)}</time>
      </dd>

      {entry.replyTo ? (
        <>
          <dt>{copy(locale, "detail.replyTo")}</dt>
          <dd>{entry.replyTo}</dd>
        </>
      ) : null}

      <dt>{copy(locale, "detail.sentBy")}</dt>
      <dd>
        {entry.actorUserId
          ? (entry.actorDisplayName ?? entry.actorEmail ?? entry.actorUserId)
          : copy(locale, "detail.system")}
        {entry.actorDisplayName && entry.actorEmail ? <p>{entry.actorEmail}</p> : null}
      </dd>

      {entry.communicationId ? (
        <>
          <dt>{copy(locale, "detail.communication")}</dt>
          <dd>
            {entry.communicationSubject ?? entry.communicationId}
            <p>
              <Link href={withLocale("/admin/communications", locale)}>
                {copy(locale, "detail.communicationLink")}
              </Link>
            </p>
          </dd>
        </>
      ) : null}

      <dt>{copy(locale, "detail.transport")}</dt>
      <dd>{entry.transport.toUpperCase()}</dd>

      {entry.locale ? (
        <>
          <dt>{copy(locale, "detail.language")}</dt>
          <dd>{copy(locale, `language.${entry.locale}`)}</dd>
        </>
      ) : null}

      {typeof intended === "number" ? (
        <>
          <dt>{copy(locale, "detail.intended")}</dt>
          <dd>{intended}</dd>
        </>
      ) : null}
    </dl>
  );
}

export default async function EmailLogEntryPage({
  params,
  searchParams,
}: PageProps<"/admin/email-log/[id]">) {
  const [{ id }, raw] = await Promise.all([params, searchParams]);
  const locale = localeFrom(raw.lang);
  const actor = await requireAction("view_email_log", `/admin/email-log/${id}`);
  if (!UUID_PATTERN.test(id) || configuredDataAdapter() !== "postgres") notFound();

  const entry = await emailLogEntry(id);
  if (!entry) notFound();

  // The list's filters and page ride along in the URL, so going back or
  // switching language returns to the same place in the register.
  const listParams = parseEmailLogSearchParams(raw);
  const sent = entry.status === "sent";
  const redacted = entry.emailType === "password_reset" || entry.emailType === "invitation";

  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/admin/email-log"
      switchPath={emailLogEntrySwitchPath(entry.id, listParams)}
      title={subjectLabel(locale, entry.subject)}
      description={typeLabel(locale, entry.emailType)}
    >
      <section className="section">
        <div className="content-wrap">
          <Link href={emailLogHref(listParams, locale)} className={styles.back}>
            ← {copy(locale, "detail.back")}
          </Link>
          <p className={`notice ${styles.caveat}`}>{copy(locale, "caveat")}</p>
          <div className="status-row">
            <StatusPill tone={sent ? "approved" : "private"}>
              {statusLabel(locale, entry.status)}
            </StatusPill>
            <StatusPill tone={entry.openedAt ? "approved" : "pending"}>
              {openSignalLabel(locale, entry)}
            </StatusPill>
          </div>
          <article className="card">
            <MetaList entry={entry} locale={locale} />
          </article>
          {redacted ? (
            <p className={`notice ${styles.bodyCard}`}>{copy(locale, "detail.redacted")}</p>
          ) : null}
          <article className={`card ${styles.bodyCard}`}>
            <h2>{copy(locale, "detail.text")}</h2>
            {/* A scrolling box must be reachable from the keyboard, so it
                is a named, focusable region. */}
            <pre
              className={styles.body}
              tabIndex={0}
              role="region"
              aria-label={copy(locale, "detail.text")}
            >
              {entry.textBody}
            </pre>
          </article>
          <article className={`card ${styles.bodyCard}`}>
            <h2>{copy(locale, "detail.html")}</h2>
            {entry.htmlBody ? (
              <>
                <p>{copy(locale, "detail.htmlNote")}</p>
                <iframe
                  className={styles.preview}
                  title={copy(locale, "detail.html")}
                  sandbox=""
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  srcDoc={previewDocument(entry.htmlBody)}
                />
                <details className={styles.source}>
                  <summary>{copy(locale, "detail.source")}</summary>
                  <pre
                    className={styles.body}
                    tabIndex={0}
                    role="region"
                    aria-label={copy(locale, "detail.source")}
                  >
                    {entry.htmlBody}
                  </pre>
                </details>
              </>
            ) : (
              <p>{copy(locale, "detail.htmlNone")}</p>
            )}
          </article>
        </div>
      </section>
    </WorkspaceShell>
  );
}
