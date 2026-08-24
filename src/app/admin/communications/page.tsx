import type { Metadata } from "next";
import { CommunicationsComposer } from "@/components/communications-composer";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireAction } from "@/lib/auth/server-session";
import {
  listCommunications,
  type CommunicationRecord,
} from "@/lib/communications/communications";
import type { Locale } from "@/lib/domain/types";
import { localeFrom } from "@/lib/i18n";
import { configuredDataAdapter, getArchiveRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Communications",
  robots: { index: false, follow: false },
};

function displayDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function CommunicationsLog({
  messages,
  locale,
}: {
  messages: CommunicationRecord[];
  locale: Locale;
}) {
  const spanish = locale === "es";
  if (messages.length === 0) {
    return (
      <article className="card">
        <h2>{spanish ? "Mensajes enviados" : "Sent messages"}</h2>
        <p>
          {spanish
            ? "Todavía no se ha enviado ningún mensaje. Cada envío aparecerá aquí con su resultado por persona."
            : "No message has been sent yet. Every send will appear here with its per-person outcome."}
        </p>
      </article>
    );
  }
  return (
    <article className="card">
      <h2>{spanish ? "Mensajes enviados" : "Sent messages"}</h2>
      <ul className="coms-log">
        {messages.map((message) => {
          const failed = message.failedCount > 0;
          const pending = message.recipients.some((recipient) => recipient.status === "pending");
          return (
            <li key={message.id}>
              <div className="coms-log-head">
                <strong>{message.subject}</strong>
                <StatusPill tone={pending ? "pending" : failed ? "private" : "approved"}>
                  {pending
                    ? spanish
                      ? "Incompleto"
                      : "Incomplete"
                    : failed
                      ? spanish
                        ? `${message.failedCount} ${message.failedCount === 1 ? "fallido" : "fallidos"}`
                        : `${message.failedCount} failed`
                      : spanish
                        ? "Entregado"
                        : "Delivered"}
                </StatusPill>
              </div>
              <p className="coms-log-meta">
                {displayDate(message.createdAt, locale)} ·{" "}
                {spanish
                  ? `${message.recipients.length} ${
                      message.recipients.length === 1 ? "destinatario" : "destinatarios"
                    }, ${message.sentCount} ${message.sentCount === 1 ? "enviado" : "enviados"}`
                  : `${message.recipients.length} ${
                      message.recipients.length === 1 ? "recipient" : "recipients"
                    }, ${message.sentCount} sent`}
              </p>
              <p className="coms-log-recipients">
                {message.recipients
                  .map((recipient) => {
                    if (recipient.status === "sent") return recipient.displayName;
                    const outcome =
                      recipient.status === "failed"
                        ? spanish
                          ? "falló"
                          : "failed"
                        : spanish
                          ? "pendiente"
                          : "pending";
                    return `${recipient.displayName} (${outcome})`;
                  })
                  .join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/**
 * The communications page: one place to write to the archive's people.
 * Email works today; push notifications and SMS are declared as planned
 * rather than pretended.
 */
export default async function CommunicationsPage({
  searchParams,
}: PageProps<"/admin/communications">) {
  const locale = localeFrom((await searchParams).lang);
  const spanish = locale === "es";
  const actor = await requireAction("send_communications", "/admin/communications");
  const writable = configuredDataAdapter() === "postgres";

  const users = await getArchiveRepository().adminUsers(actor);
  const recipients = users.filter((user) => user.active);
  const messages = writable ? await listCommunications(actor) : [];

  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/admin/communications"
      title={spanish ? "Comunicaciones" : "Communications"}
      description={
        spanish
          ? "Escriba a las personas del archivo desde un solo lugar. Cada mensaje sale con la marca del archivo y queda registrado."
          : "Write to the archive's people from one place. Every message goes out in the archive's frame and stays on the record."
      }
    >
      <section className="section">
        <div className="content-wrap coms-page">
          <CommunicationsComposer locale={locale} recipients={recipients} writable={writable} />
          <CommunicationsLog messages={messages} locale={locale} />
        </div>
      </section>
    </WorkspaceShell>
  );
}
