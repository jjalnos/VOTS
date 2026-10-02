import { describe, expect, it } from "vitest";
import {
  COPY,
  copy,
  displayDate,
  failureReasonLabel,
  fill,
  openLoadsLabel,
  openSignalLabel,
  openSignalState,
  PREVIEW_CSP,
  previewDocument,
  resultsLabel,
  statusLabel,
  subjectLabel,
  typeLabel,
  type EmailLogCopyKey,
} from "@/lib/email/log-presentation";
import { TRACKING_PIXEL_PATH } from "@/lib/email/log";
import { ARCHIVE_TIME_ZONE } from "@/lib/i18n";

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe("copy tables", () => {
  it("carry the same keys with the same placeholders in English and Spanish", () => {
    const enKeys = Object.keys(COPY.en).sort();
    const esKeys = Object.keys(COPY.es).sort();
    expect(esKeys).toEqual(enKeys);
    for (const key of enKeys as EmailLogCopyKey[]) {
      expect(COPY.en[key].trim(), key).not.toBe("");
      expect(COPY.es[key].trim(), key).not.toBe("");
      expect(placeholders(COPY.es[key]), key).toEqual(placeholders(COPY.en[key]));
    }
  });

  it("names the sent status for what it is and warns about the pixel", () => {
    expect(statusLabel("en", "sent")).toBe("Accepted by SMTP");
    expect(statusLabel("es", "sent")).toBe("Aceptado por SMTP");
    expect(statusLabel("en", "failed")).toBe(copy("en", "status.failed"));
    expect(copy("en", "caveat")).toContain("best-effort");
    expect(copy("es", "caveat").length).toBeGreaterThan(20);
    expect(copy("en", "open.untracked")).toBe("Not tracked");
  });
});

describe("fill", () => {
  it("replaces known placeholders and leaves unknown ones visible", () => {
    expect(fill("Showing {from}–{to} of {total}", { from: 1, to: 25, total: 60 })).toBe(
      "Showing 1–25 of 60",
    );
    expect(fill("Page {n} of {m}", { n: 2 })).toBe("Page 2 of {m}");
    expect(fill("no placeholders", {})).toBe("no placeholders");
  });
});

describe("displayDate", () => {
  it("formats in both locales from a Date or an ISO string", () => {
    const when = new Date("2026-10-02T12:34:00Z");
    const en = displayDate(when, "en");
    const es = displayDate(when.toISOString(), "es");
    expect(en).toContain("2026");
    expect(es).toContain("2026");
    expect(en).toMatch(/Oct/);
    expect(es).toMatch(/oct/i);
  });

  it("shows the archive's own zone, named, whatever zone the server runs in", () => {
    expect(ARCHIVE_TIME_ZONE).toBe("America/Chicago");
    // 12:34Z is 7:34 in Central Daylight Time and, in January, 6:34 Central Standard.
    const summer = displayDate(new Date("2026-10-02T12:34:00Z"), "en");
    expect(summer).toContain("7:34");
    expect(summer).toMatch(/\bCDT\b/);
    const winter = displayDate(new Date("2026-01-15T12:34:00Z"), "en");
    expect(winter).toContain("6:34");
    expect(winter).toMatch(/\bCST\b/);
    const es = displayDate(new Date("2026-10-02T12:34:00Z"), "es");
    expect(es).toContain("7:34");
    expect(es).toMatch(/CDT|GMT-5/);
  });
});

describe("subjectLabel", () => {
  it("stands in for a missing subject in both languages", () => {
    expect(subjectLabel("en", "Committee update")).toBe("Committee update");
    expect(subjectLabel("en", "")).toBe("(no subject)");
    expect(subjectLabel("en", "   ")).toBe("(no subject)");
    expect(subjectLabel("es", "\t")).toBe("(sin asunto)");
  });
});

describe("labels", () => {
  it("localizes failure reasons without copying unknown text into the copy table", () => {
    expect(failureReasonLabel("en", null)).toBe("");
    expect(failureReasonLabel("en", "configuration: SMTP_USER")).toBe(
      fill(copy("en", "reason.configuration"), { var: "SMTP_USER" }),
    );
    expect(failureReasonLabel("es", "configuration: SMTP_HOST")).toContain("SMTP_HOST");
    expect(failureReasonLabel("en", "invalid message")).toBe(copy("en", "reason.invalidMessage"));
    expect(failureReasonLabel("en", "delivery failed")).toBe(copy("en", "reason.deliveryFailed"));
    expect(failureReasonLabel("en", "not attempted")).toBe(copy("en", "reason.notAttempted"));
    expect(failureReasonLabel("en", "something else")).toBe("something else");
  });

  it("derives the open signal state from the hash and the first open", () => {
    const opened = new Date("2026-10-02T12:00:00Z");
    expect(openSignalState({ trackingTokenHash: null, openedAt: null })).toBe("untracked");
    expect(openSignalState({ trackingTokenHash: "h", openedAt: null })).toBe("unopened");
    expect(openSignalState({ trackingTokenHash: "h", openedAt: opened })).toBe("opened");

    expect(openSignalLabel("en", { trackingTokenHash: null, openedAt: null })).toBe("Not tracked");
    expect(openSignalLabel("en", { trackingTokenHash: "h", openedAt: null })).toBe(
      copy("en", "open.unopened"),
    );
    expect(openSignalLabel("en", { trackingTokenHash: "h", openedAt: opened })).toBe(
      fill(copy("en", "open.opened"), { date: displayDate(opened, "en") }),
    );
    expect(openSignalLabel("es", { trackingTokenHash: "h", openedAt: opened })).toContain("2026");
  });

  it("pluralizes loads and results", () => {
    expect(openLoadsLabel("en", 1)).toBe(copy("en", "open.loadOne"));
    expect(openLoadsLabel("en", 3)).toBe(fill(copy("en", "open.loads"), { n: 3 }));
    expect(resultsLabel("en", 1)).toBe(copy("en", "results.one"));
    expect(resultsLabel("en", 0)).toBe(fill(copy("en", "results.count"), { total: 0 }));
    expect(resultsLabel("es", 12)).toContain("12");
  });

  it("labels the four email types and passes unknown ones through", () => {
    expect(typeLabel("en", "password_reset")).toBe(copy("en", "type.password_reset"));
    expect(typeLabel("es", "invitation")).toBe(copy("es", "type.invitation"));
    expect(typeLabel("en", "communication")).toBe(copy("en", "type.communication"));
    expect(typeLabel("en", "ai_usage_alert")).toBe(copy("en", "type.ai_usage_alert"));
    expect(typeLabel("en", "future_type")).toBe("future_type");
  });
});

describe("previewDocument", () => {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;

  it("injects a locked-down CSP right after an existing head", () => {
    const html = '<html><HEAD lang="en"><title>x</title></HEAD><body>hi</body></html>';
    const document = previewDocument(html);
    expect(document.startsWith(`<html><HEAD lang="en">${meta}<title>`)).toBe(true);
    expect(document.match(/Content-Security-Policy/g)).toHaveLength(1);
  });

  it("wraps a fragment in a full document when there is no head", () => {
    const document = previewDocument("<p>fragment</p>");
    expect(document).toBe(`<!DOCTYPE html><html><head>${meta}</head><body><p>fragment</p></body></html>`);
  });

  it("strips base tags and neutralises any pixel path", () => {
    const html = `<html><head><base href="https://evil.example/"></head><body><img src="https://archive.example${TRACKING_PIXEL_PATH}abc"></body></html>`;
    const document = previewDocument(html);
    expect(document).not.toContain("<base");
    expect(document).not.toContain(TRACKING_PIXEL_PATH);
    expect(document).toContain("/api/email/open-removed/abc");
  });

  it("uses a CSP that forbids scripts, frames and remote loads", () => {
    expect(PREVIEW_CSP).toContain("default-src 'none'");
    expect(PREVIEW_CSP).toContain("script-src 'none'");
    expect(PREVIEW_CSP).toContain("frame-src 'none'");
    expect(PREVIEW_CSP).toContain("base-uri 'none'");
    expect(PREVIEW_CSP).toContain("form-action 'none'");
    expect(PREVIEW_CSP).not.toContain("https:");
  });
});
