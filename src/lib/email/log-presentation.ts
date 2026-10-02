import type { Locale } from "@/lib/domain/types";
import { TRACKING_PIXEL_PATH, type EmailLogStatus, type EmailLogType } from "@/lib/email/log";
import { ARCHIVE_TIME_ZONE } from "@/lib/i18n";

/**
 * Copy and display helpers for the email-log pages. Everything the pages say
 * lives in COPY, in both of the archive's languages, so the two tables can be
 * compared key for key.
 */

const en = {
  title: "Email log",
  description:
    "Every message the archive handed to the mail server, with its outcome and any open signal. Bodies are stored with one-time links removed.",
  "card.accepted": "Accepted by SMTP",
  "card.opened": "Open signals",
  "card.failed": "Failed",
  "card.recent": "Attempts, last 30 days",
  caveat:
    "Open tracking is a best-effort signal from the email's image pixel. Some inboxes block it; others load it automatically without anyone reading.",
  mockNotice:
    "The email log needs the Postgres data adapter. Nothing is recorded in demonstration mode.",
  "filter.search": "Search",
  "filter.searchPlaceholder": "Recipient, subject, type, or failure reason",
  "filter.status": "Status",
  "filter.status.all": "All",
  "filter.opened": "Open signal",
  "filter.opened.any": "Any",
  "filter.opened.opened": "Opened",
  "filter.opened.unopened": "Tracked, not opened",
  "filter.opened.untracked": "Not tracked",
  "filter.type": "Type",
  "filter.type.all": "All types",
  "filter.sort": "Sort by",
  "filter.dir": "Order",
  "sort.created_at": "Date",
  "sort.subject": "Subject",
  "sort.recipient": "Recipient",
  "sort.status": "Status",
  "sort.type": "Type",
  "sort.opened_at": "Last opened",
  "sort.open_count": "Image loads",
  "dir.desc": "Descending",
  "dir.asc": "Ascending",
  "filter.apply": "Apply",
  "filter.clear": "Clear",
  "results.count": "{total} messages",
  "results.one": "1 message",
  "results.range": "Showing {from}–{to} of {total}",
  "col.email": "Email",
  "col.recipient": "Recipient",
  "col.status": "Status",
  "col.open": "Open signal",
  "col.when": "When",
  "status.sent": "Accepted by SMTP",
  "status.failed": "Failed",
  "open.untracked": "Not tracked",
  "open.unopened": "Tracked, not opened",
  "open.opened": "Opened {date}",
  "open.loads": "{n} image loads",
  "open.loadOne": "1 image load",
  "type.password_reset": "Password reset",
  "type.invitation": "Invitation",
  "type.communication": "Communication",
  "type.ai_usage_alert": "AI usage alert",
  "reason.configuration": "configuration: {var}",
  "reason.invalidMessage": "invalid message",
  "reason.deliveryFailed": "delivery failed",
  "reason.notAttempted": "not attempted",
  "empty.none": "No delivery activity yet.",
  "empty.filtered": "No messages match those filters.",
  "page.prev": "Previous",
  "page.next": "Next",
  "page.of": "Page {n} of {m}",
  "page.label": "Pagination",
  "row.view": "View message to {recipient}",
  "row.noSubject": "(no subject)",
  "detail.back": "Email log",
  "detail.recipient": "Recipient",
  "detail.noRecipient": "No recipient — refused before sending",
  "detail.status": "Status",
  "detail.sentExplainer":
    "Accepted by SMTP with no application error. Final inbox delivery can still be filtered, delayed, or bounced later by downstream providers.",
  "detail.failedExplainer": "The mail server did not accept this message. Reason: {reason}.",
  "detail.open": "Open signal",
  "detail.firstOpened": "First opened",
  "detail.lastOpened": "Last opened",
  "detail.loads": "Image loads",
  "detail.sentAt": "Handed to SMTP",
  "detail.replyTo": "Reply-to",
  "detail.sentBy": "Sent by",
  "detail.system": "System",
  "detail.communication": "Communication",
  "detail.communicationLink": "Open the communications page",
  "detail.transport": "Transport",
  "detail.language": "Language",
  "detail.intended": "Intended recipients",
  "detail.redacted": "One-time links were removed before this message was stored.",
  "detail.text": "Text version",
  "detail.html": "HTML preview",
  "detail.htmlNote": "Rendered in an isolated frame: no scripts, no network, and no tracking pixel.",
  "detail.htmlNone": "This message had no HTML part.",
  "detail.source": "HTML source",
  "language.en": "English",
  "language.es": "Spanish",
} as const;

export type EmailLogCopyKey = keyof typeof en;

const es: Record<EmailLogCopyKey, string> = {
  title: "Registro de correo",
  description:
    "Cada mensaje que el archivo entregó al servidor de correo, con su resultado y cualquier señal de apertura. Los cuerpos se guardan sin los enlaces de un solo uso.",
  "card.accepted": "Aceptados por SMTP",
  "card.opened": "Señales de apertura",
  "card.failed": "Fallidos",
  "card.recent": "Intentos, últimos 30 días",
  caveat:
    "El seguimiento de aperturas es una señal aproximada del píxel de imagen del correo. Algunas bandejas lo bloquean; otras lo cargan automáticamente sin que nadie lea.",
  mockNotice:
    "El registro de correo necesita el adaptador de datos Postgres. En modo de demostración no se registra nada.",
  "filter.search": "Buscar",
  "filter.searchPlaceholder": "Destinatario, asunto, tipo o motivo del fallo",
  "filter.status": "Estado",
  "filter.status.all": "Todos",
  "filter.opened": "Señal de apertura",
  "filter.opened.any": "Cualquiera",
  "filter.opened.opened": "Abiertos",
  "filter.opened.unopened": "Con seguimiento, sin abrir",
  "filter.opened.untracked": "Sin seguimiento",
  "filter.type": "Tipo",
  "filter.type.all": "Todos los tipos",
  "filter.sort": "Ordenar por",
  "filter.dir": "Orden",
  "sort.created_at": "Fecha",
  "sort.subject": "Asunto",
  "sort.recipient": "Destinatario",
  "sort.status": "Estado",
  "sort.type": "Tipo",
  "sort.opened_at": "Última apertura",
  "sort.open_count": "Cargas de imagen",
  "dir.desc": "Descendente",
  "dir.asc": "Ascendente",
  "filter.apply": "Aplicar",
  "filter.clear": "Limpiar",
  "results.count": "{total} mensajes",
  "results.one": "1 mensaje",
  "results.range": "Mostrando {from}–{to} de {total}",
  "col.email": "Correo",
  "col.recipient": "Destinatario",
  "col.status": "Estado",
  "col.open": "Señal de apertura",
  "col.when": "Cuándo",
  "status.sent": "Aceptado por SMTP",
  "status.failed": "Fallido",
  "open.untracked": "Sin seguimiento",
  "open.unopened": "Con seguimiento, sin abrir",
  "open.opened": "Abierto {date}",
  "open.loads": "{n} cargas de imagen",
  "open.loadOne": "1 carga de imagen",
  "type.password_reset": "Restablecimiento de contraseña",
  "type.invitation": "Invitación",
  "type.communication": "Comunicación",
  "type.ai_usage_alert": "Alerta de uso de IA",
  "reason.configuration": "configuración: {var}",
  "reason.invalidMessage": "mensaje no válido",
  "reason.deliveryFailed": "entrega fallida",
  "reason.notAttempted": "no intentado",
  "empty.none": "Todavía no hay actividad de envío.",
  "empty.filtered": "Ningún mensaje coincide con esos filtros.",
  "page.prev": "Anterior",
  "page.next": "Siguiente",
  "page.of": "Página {n} de {m}",
  "page.label": "Paginación",
  "row.view": "Ver mensaje a {recipient}",
  "row.noSubject": "(sin asunto)",
  "detail.back": "Registro de correo",
  "detail.recipient": "Destinatario",
  "detail.noRecipient": "Sin destinatario: rechazado antes del envío",
  "detail.status": "Estado",
  "detail.sentExplainer":
    "Aceptado por SMTP sin error de la aplicación. La entrega final a la bandeja de entrada todavía puede ser filtrada, retrasada o rebotada después por proveedores intermedios.",
  "detail.failedExplainer": "El servidor de correo no aceptó este mensaje. Motivo: {reason}.",
  "detail.open": "Señal de apertura",
  "detail.firstOpened": "Primera apertura",
  "detail.lastOpened": "Última apertura",
  "detail.loads": "Cargas de imagen",
  "detail.sentAt": "Entregado a SMTP",
  "detail.replyTo": "Responder a",
  "detail.sentBy": "Enviado por",
  "detail.system": "Sistema",
  "detail.communication": "Comunicación",
  "detail.communicationLink": "Abrir la página de comunicaciones",
  "detail.transport": "Transporte",
  "detail.language": "Idioma",
  "detail.intended": "Destinatarios previstos",
  "detail.redacted": "Los enlaces de un solo uso se eliminaron antes de guardar este mensaje.",
  "detail.text": "Versión de texto",
  "detail.html": "Vista previa HTML",
  "detail.htmlNote": "Mostrado en un marco aislado: sin scripts, sin red y sin píxel de seguimiento.",
  "detail.htmlNone": "Este mensaje no tenía parte HTML.",
  "detail.source": "Código HTML",
  "language.en": "Inglés",
  "language.es": "Español",
};

export const COPY: Record<Locale, Record<EmailLogCopyKey, string>> = { en, es };

export function copy(locale: Locale, key: EmailLogCopyKey): string {
  return COPY[locale][key];
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/**
 * Moments are shown in the archive's zone with the zone named, so a time in
 * the log means the same thing whether the page was rendered in San Antonio
 * or on a server set to UTC.
 */
export function displayDate(value: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    timeZone: ARCHIVE_TIME_ZONE,
    timeZoneName: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value instanceof Date ? value : new Date(value));
}

export function statusLabel(locale: Locale, status: EmailLogStatus): string {
  return copy(locale, status === "sent" ? "status.sent" : "status.failed");
}

/**
 * The subject as the pages show it: the stored one, or a stand-in when the
 * message had none, so a row's link and the detail heading are never empty.
 */
export function subjectLabel(locale: Locale, subject: string): string {
  return subject.trim() || copy(locale, "row.noSubject");
}

export function typeLabel(locale: Locale, type: EmailLogType | string): string {
  switch (type) {
    case "password_reset":
    case "invitation":
    case "communication":
    case "ai_usage_alert":
      return copy(locale, `type.${type}`);
    default:
      return type;
  }
}

export function failureReasonLabel(locale: Locale, reason: string | null): string {
  if (!reason) return "";
  if (reason.startsWith("configuration: ")) {
    return fill(copy(locale, "reason.configuration"), {
      var: reason.slice("configuration: ".length),
    });
  }
  switch (reason) {
    case "invalid message":
      return copy(locale, "reason.invalidMessage");
    case "delivery failed":
      return copy(locale, "reason.deliveryFailed");
    case "not attempted":
      return copy(locale, "reason.notAttempted");
    default:
      return reason;
  }
}

export type OpenSignalState = "untracked" | "unopened" | "opened";

export function openSignalState(row: {
  trackingTokenHash: string | null;
  openedAt: Date | null;
}): OpenSignalState {
  if (row.openedAt) return "opened";
  return row.trackingTokenHash ? "unopened" : "untracked";
}

export function openSignalLabel(
  locale: Locale,
  row: { trackingTokenHash: string | null; openedAt: Date | null },
): string {
  const state = openSignalState(row);
  if (state === "opened" && row.openedAt) {
    return fill(copy(locale, "open.opened"), { date: displayDate(row.openedAt, locale) });
  }
  return copy(locale, state === "unopened" ? "open.unopened" : "open.untracked");
}

export function openLoadsLabel(locale: Locale, count: number): string {
  return count === 1 ? copy(locale, "open.loadOne") : fill(copy(locale, "open.loads"), { n: count });
}

export function resultsLabel(locale: Locale, total: number): string {
  return total === 1 ? copy(locale, "results.one") : fill(copy(locale, "results.count"), { total });
}

/**
 * Inner document for the sandboxed preview frame. The frame itself is inert
 * (`sandbox=""`); the meta CSP makes the document inert as well, so nothing
 * inside can load a remote resource even if a future template tried to.
 */
export const PREVIEW_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-src 'none'; script-src 'none'";

const PREVIEW_META = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;

export function previewDocument(html: string): string {
  const withoutBase = html.replace(/<base\b[^>]*>/gi, "");
  const withoutPixel = withoutBase
    .split(TRACKING_PIXEL_PATH)
    .join("/api/email/open-removed/");
  const head = /<head\b[^>]*>/i.exec(withoutPixel);
  if (head) {
    const at = head.index + head[0].length;
    return `${withoutPixel.slice(0, at)}${PREVIEW_META}${withoutPixel.slice(at)}`;
  }
  return `<!DOCTYPE html><html><head>${PREVIEW_META}</head><body>${withoutPixel}</body></html>`;
}
