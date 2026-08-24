/**
 * The archive's one email frame: a wine masthead carrying the institution's
 * name, body copy on paper, and at most one action. Every mail the archive
 * sends — invitations, password resets, future notices — uses this frame, so
 * a committee member always recognizes the sender before reading a word.
 *
 * Email clients ignore stylesheets, so everything is inline and table-based.
 * The plain-text part is authoritative; HTML is an alternative presentation.
 */

const PAPER = "#faf7f2";
const INK = "#1a1512";
const MUTED = "#6b615a";
const WINE = "#6d1a17";
const WINE_DEEP = "#4f0908";
const PARCHMENT = "#eadbc3";
const HAIRLINE = "#e3dcd2";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export interface BrandedEmailContent {
  locale: "en" | "es";
  heading: string;
  /** Rendered as separate paragraphs, in order. Plain text only. */
  paragraphs: string[];
  /** The single action the email asks for, if any. */
  callToAction?: { label: string; url: string };
  /** Quiet line under the action, e.g. an expiry note. */
  note?: string;
  /**
   * "automated" (default) closes with a do-not-reply notice — right for
   * resets and invitations. "personal" is for mail a person actually wrote,
   * where a reply is welcome.
   */
  footerVariant?: "automated" | "personal";
}

/**
 * Person-controlled strings must stay one printable line each: control
 * characters could inject headers or fake paragraphs into the plaintext part.
 */
function singleLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/ {2,}/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function assertSafeActionUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("A branded email action needs an absolute https URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("A branded email action needs an absolute https URL.");
  }
}

function institutionLine(locale: "en" | "es"): string {
  return locale === "es"
    ? "Comité voluntario del Museo Conmemorativo del Holocausto de San Antonio"
    : "A volunteer committee of the Holocaust Memorial Museum of San Antonio";
}

function automatedLine(locale: "en" | "es"): string {
  return locale === "es"
    ? "Este es un mensaje automático del archivo privado. No responda a este correo."
    : "This is an automated message from the private archive. Please do not reply to this email.";
}

function footerLine(content: BrandedEmailContent): string {
  if (content.footerVariant === "personal") {
    return content.locale === "es"
      ? "Enviado desde el archivo privado Voices of the Shoah."
      : "Sent from the private Voices of the Shoah archive.";
  }
  return automatedLine(content.locale);
}

export function brandedEmailText(content: BrandedEmailContent): string {
  const lines: string[] = ["VOICES OF THE SHOAH", institutionLine(content.locale), ""];
  lines.push(singleLine(content.heading), "");
  for (const paragraph of content.paragraphs) {
    lines.push(singleLine(paragraph), "");
  }
  if (content.callToAction) {
    assertSafeActionUrl(content.callToAction.url);
    lines.push(`${singleLine(content.callToAction.label)}: ${content.callToAction.url}`, "");
  }
  if (content.note) {
    lines.push(singleLine(content.note), "");
  }
  lines.push("—", footerLine(content));
  return lines.join("\n").trimEnd();
}

export function brandedEmailHtml(content: BrandedEmailContent): string {
  if (content.callToAction) assertSafeActionUrl(content.callToAction.url);
  const paragraphs = content.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px 0;font-family:${SANS};font-size:16px;line-height:1.6;color:${INK};">${escapeHtml(singleLine(paragraph))}</p>`,
    )
    .join("\n");
  const action = content.callToAction
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px 0;">
        <tr>
          <td style="background-color:${WINE};">
            <a href="${escapeHtml(content.callToAction.url)}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:16px;font-weight:bold;color:${PAPER};text-decoration:none;">${escapeHtml(content.callToAction.label)}</a>
          </td>
        </tr>
      </table>`
    : "";
  const note = content.note
    ? `<p style="margin:12px 0 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(content.note)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="${content.locale}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAPER};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
  <tr>
    <td style="background-color:${WINE_DEEP};padding:28px 32px;">
      <p style="margin:0;font-family:${SERIF};font-size:24px;color:${PAPER};">Voices of the Shoah</p>
      <p style="margin:6px 0 0 0;font-family:${SANS};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${PARCHMENT};">${escapeHtml(institutionLine(content.locale))}</p>
    </td>
  </tr>
  <tr>
    <td style="background-color:#ffffff;border:1px solid ${HAIRLINE};border-top:none;padding:32px;">
      <h1 style="margin:0 0 20px 0;font-family:${SERIF};font-size:24px;font-weight:normal;color:${INK};">${escapeHtml(content.heading)}</h1>
      ${paragraphs}
      ${action}
      ${note}
    </td>
  </tr>
  <tr>
    <td style="padding:20px 32px;">
      <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">${escapeHtml(footerLine(content))}</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function brandedEmail(content: BrandedEmailContent): { text: string; html: string } {
  return { text: brandedEmailText(content), html: brandedEmailHtml(content) };
}
