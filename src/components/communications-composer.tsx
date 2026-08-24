"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale, Role, User } from "@/lib/domain/types";

const ROLE_LABELS: Record<Role, { en: string; es: string }> = {
  admin: { en: "Administrator", es: "Administración" },
  curator: { en: "Curator", es: "Curaduría" },
  family: { en: "Family", es: "Familia" },
  viewer: { en: "Viewer", es: "Visualización" },
};

/**
 * The compose surface of the communications page: pick the people, write the
 * letter, send it through the archive's one branded email frame. Channels the
 * archive cannot use yet are shown, honestly, as planned.
 */
export function CommunicationsComposer({
  locale,
  recipients,
  writable,
}: {
  locale: Locale;
  recipients: User[];
  /** False when the environment has no database. */
  writable: boolean;
}) {
  const spanish = locale === "es";
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [showLink, setShowLink] = useState(false);

  function toggle(userId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelected((previous) =>
      previous.size === recipients.length
        ? new Set()
        : new Set(recipients.map((recipient) => recipient.id)),
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const linkLabel = String(data.get("linkLabel") ?? "").trim();
    const linkUrl = String(data.get("linkUrl") ?? "").trim();
    if (showLink && (linkLabel.length < 2 || !linkUrl)) {
      setStatus({
        tone: "error",
        message: spanish
          ? "El enlace necesita un texto y una dirección https, o desmarque «Incluir un enlace»."
          : "The link needs a label and an https address, or untick “Include a link”.",
      });
      return;
    }
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/communications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: String(data.get("subject") ?? ""),
          body: String(data.get("body") ?? ""),
          locale: String(data.get("emailLocale") ?? "en"),
          recipientUserIds: [...selected],
          ...(showLink ? { link: { label: linkLabel, url: linkUrl } } : {}),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        status?: string;
        sentCount?: number;
        failedCount?: number;
      };
      if (!response.ok) {
        setStatus({
          tone: "error",
          message: localizedError(response.status, result.error, spanish),
        });
        return;
      }
      const sent = result.sentCount ?? 0;
      const failed = result.failedCount ?? 0;
      setStatus({
        tone: failed === 0 ? "success" : "error",
        message:
          failed === 0
            ? spanish
              ? `Mensaje enviado a ${sent} ${sent === 1 ? "persona" : "personas"}.`
              : `Message sent to ${sent} ${sent === 1 ? "person" : "people"}.`
            : spanish
              ? `Enviado a ${sent}, falló para ${failed}. El registro muestra el detalle.`
              : `Sent to ${sent}, failed for ${failed}. The log shows the detail.`,
      });
      form.reset();
      setSelected(new Set());
      setShowLink(false);
      router.refresh();
    } catch {
      // A dropped connection does not mean the send stopped: the server keeps
      // going and the log records every outcome. Never invite a blind resend.
      setStatus({
        tone: "error",
        message: spanish
          ? "Se perdió la conexión durante el envío. El envío puede seguir en curso — revise «Mensajes enviados» antes de volver a enviar."
          : "The connection dropped during the send. It may still be running — check “Sent messages” before sending again.",
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="card">
      <h2>{spanish ? "Redactar un mensaje" : "Compose a message"}</h2>
      <p>
        {spanish
          ? "El correo sale con el marco del archivo: cabecera vino, papel y una sola acción. Cada envío queda en el registro con el resultado por persona."
          : "The email goes out in the archive's frame: wine masthead, paper, one action. Every send lands in the log with a per-person outcome."}
      </p>

      <ul className="coms-channels" aria-label={spanish ? "Canales" : "Channels"}>
        <li className="coms-channel active">{spanish ? "Correo electrónico" : "Email"}</li>
        <li className="coms-channel planned">
          {spanish ? "Notificaciones push" : "Push notifications"}
          <span className="coms-planned-tag">{spanish ? "PREVISTO" : "PLANNED"}</span>
        </li>
        <li className="coms-channel planned">
          SMS
          <span className="coms-planned-tag">{spanish ? "PREVISTO" : "PLANNED"}</span>
        </li>
      </ul>

      {writable ? (
        <form className="stack-form" onSubmit={submit}>
          <fieldset className="coms-recipients">
            <legend className="field-label">
              {spanish ? "Destinatarios" : "Recipients"} ({selected.size})
            </legend>
            <label className="coms-recipient coms-select-all">
              <input
                type="checkbox"
                checked={selected.size === recipients.length && recipients.length > 0}
                onChange={toggleAll}
              />
              <span>{spanish ? "Todas las cuentas activas" : "Every active account"}</span>
            </label>
            {recipients.map((recipient) => (
              <label key={recipient.id} className="coms-recipient">
                <input
                  type="checkbox"
                  checked={selected.has(recipient.id)}
                  onChange={() => toggle(recipient.id)}
                />
                <span>
                  <strong>{recipient.displayName}</strong> · {recipient.email}
                  <span className="coms-recipient-roles">
                    {recipient.roles.map((role) => ROLE_LABELS[role][locale]).join(", ")}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="coms-subject">{spanish ? "Asunto" : "Subject"}</label>
              <input id="coms-subject" name="subject" minLength={3} maxLength={150} required />
            </div>
            <div className="field span-2">
              <label htmlFor="coms-body">{spanish ? "Mensaje" : "Message"}</label>
              <textarea
                id="coms-body"
                name="body"
                minLength={3}
                maxLength={5000}
                rows={7}
                required
                placeholder={
                  spanish
                    ? "Escriba el mensaje. Una línea en blanco crea un nuevo párrafo."
                    : "Write the message. A blank line starts a new paragraph."
                }
              />
            </div>
            <div className="field">
              <label htmlFor="coms-locale">{spanish ? "Idioma del correo" : "Email language"}</label>
              <select id="coms-locale" name="emailLocale" defaultValue={locale}>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
            <div className="field">
              <span className="field-label">{spanish ? "Botón de enlace" : "Link button"}</span>
              <label className="coms-recipient">
                <input
                  type="checkbox"
                  checked={showLink}
                  onChange={() => setShowLink((previous) => !previous)}
                />
                <span>{spanish ? "Incluir un enlace" : "Include a link"}</span>
              </label>
            </div>
            {showLink ? (
              <>
                <div className="field">
                  <label htmlFor="coms-link-label">{spanish ? "Texto del botón" : "Button label"}</label>
                  <input id="coms-link-label" name="linkLabel" minLength={2} maxLength={80} required={showLink} />
                </div>
                <div className="field">
                  <label htmlFor="coms-link-url">{spanish ? "Dirección https" : "https address"}</label>
                  <input
                    id="coms-link-url"
                    name="linkUrl"
                    type="url"
                    pattern="https://.*"
                    maxLength={500}
                    required={showLink}
                    placeholder="https://"
                  />
                </div>
              </>
            ) : null}
          </div>

          <button className="button" type="submit" disabled={pending || selected.size === 0}>
            {pending
              ? spanish
                ? "Enviando…"
                : "Sending…"
              : spanish
                ? `Enviar a ${selected.size} ${selected.size === 1 ? "persona" : "personas"}`
                : `Send to ${selected.size} ${selected.size === 1 ? "person" : "people"}`}
          </button>
        </form>
      ) : (
        <p className="notice">
          {spanish
            ? "Este entorno de desarrollo no tiene base de datos; los envíos solo funcionan en producción."
            : "This development environment has no database; sending only works in production."}
        </p>
      )}
      <p className={`form-status ${status?.tone ?? ""}`} role="status" aria-live="polite">
        {status?.message ?? ""}
      </p>
    </article>
  );
}

/** The API speaks English; known cases render in Spanish for a Spanish reader. */
function localizedError(status: number, serverMessage: string | undefined, spanish: boolean): string {
  if (!spanish) return serverMessage ?? "The request failed.";
  if (serverMessage?.includes("not configured")) {
    return "El envío de correo aún no está configurado en este entorno.";
  }
  if (status === 503) return "Esta función no está disponible en este entorno.";
  if (status === 400) return serverMessage ?? "El mensaje no es válido.";
  return serverMessage ?? "La solicitud falló.";
}
