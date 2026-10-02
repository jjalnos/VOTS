import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => ({
  userId: "00000000-0000-4000-8000-00000000000a",
  email: "admin@archive.local",
  displayName: "Admin",
  roles: ["admin"],
  mfaVerified: true,
}));
const mocks = vi.hoisted(() => ({
  requireAction: vi.fn(async () => admin),
  listEmailLog: vi.fn(),
  emailLogSummary: vi.fn(),
  emailLogEntry: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {} }),
  usePathname: () => "/admin/email-log",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth/server-session", () => ({ requireAction: mocks.requireAction }));
vi.mock("@/lib/email/log-queries", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listEmailLog: mocks.listEmailLog,
  emailLogSummary: mocks.emailLogSummary,
  emailLogEntry: mocks.emailLogEntry,
}));

import EmailLogEntryPage from "@/app/admin/email-log/[id]/page";
import EmailLogPage from "@/app/admin/email-log/page";
import { copy, fill, PREVIEW_CSP } from "@/lib/email/log-presentation";
import type { EmailLogEntry, EmailLogListRow, EmailLogPage as EmailLogPageData } from "@/lib/email/log-queries";

const ENTRY_ID = "6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const WHEN = new Date("2026-10-02T12:34:00Z");

const rowBase: EmailLogListRow = {
  id: ENTRY_ID,
  emailType: "communication",
  status: "sent",
  failureReason: null,
  recipientEmail: "a@example.org",
  recipientName: "Person A",
  subject: "Committee update <script>alert(1)</script>",
  trackingTokenHash: "a".repeat(64),
  openedAt: new Date("2026-10-02T13:00:00Z"),
  lastOpenedAt: new Date("2026-10-02T14:00:00Z"),
  openCount: 3,
  createdAt: WHEN,
};

const rowsFixture: EmailLogListRow[] = [
  rowBase,
  {
    ...rowBase,
    id: "7f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4c",
    emailType: "password_reset",
    status: "failed",
    failureReason: "configuration: SMTP_USER",
    recipientName: null,
    subject: "Reset your password",
    trackingTokenHash: null,
    openedAt: null,
    lastOpenedAt: null,
    openCount: 0,
  },
  {
    ...rowBase,
    id: "8f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4d",
    emailType: "ai_usage_alert",
    recipientEmail: "support@clicksmith.net",
    recipientName: null,
    subject: "High usage",
    trackingTokenHash: "b".repeat(64),
    openedAt: null,
    lastOpenedAt: null,
    openCount: 0,
  },
];

function pageData(overrides: Partial<EmailLogPageData> = {}): EmailLogPageData {
  return {
    rows: rowsFixture,
    total: 60,
    page: 2,
    pageCount: 3,
    pageSize: 25,
    firstResult: 26,
    lastResult: 50,
    ...overrides,
  };
}

const entryFixture: EmailLogEntry = {
  id: ENTRY_ID,
  emailType: "communication",
  status: "sent",
  transport: "smtp",
  failureReason: null,
  recipientEmail: "a@example.org",
  recipientName: "Person A",
  recipientUserId: "00000000-0000-4000-8000-0000000000b1",
  communicationId: "00000000-0000-4000-8000-0000000000c1",
  actorUserId: admin.userId,
  locale: "en",
  subject: "Committee update",
  replyTo: "admin@archive.local",
  textBody: "Hello <b>there</b> & welcome",
  htmlBody:
    '<html><head><base href="https://evil.example/"></head><body><p>Hello</p>' +
    '<img src="https://archive.example/api/email/open/abcdefghijklmnopqrstuvwxyz012345" width="1" height="1" alt=""></body></html>',
  metadata: null,
  trackingTokenHash: "a".repeat(64),
  openedAt: new Date("2026-10-02T13:00:00Z"),
  lastOpenedAt: new Date("2026-10-02T14:00:00Z"),
  openCount: 3,
  createdAt: WHEN,
  actorEmail: "admin@archive.local",
  actorDisplayName: "Admin",
  communicationSubject: "Committee update",
};

/** React escapes text the way a browser would; copy with apostrophes must be compared escaped. */
function text(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

async function renderList(search: Record<string, string | string[] | undefined> = {}) {
  const element = await EmailLogPage({ searchParams: Promise.resolve(search) } as never);
  return renderToStaticMarkup(element);
}

async function renderEntry(id: string, search: Record<string, string | string[] | undefined> = {}) {
  const element = await EmailLogEntryPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(search),
  } as never);
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  vi.stubEnv("DATA_ADAPTER", "postgres");
  mocks.emailLogSummary.mockResolvedValue({ accepted: 40, opened: 12, failed: 5, recent: 20 });
  mocks.listEmailLog.mockResolvedValue(pageData());
  mocks.emailLogEntry.mockResolvedValue(entryFixture);
});

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.requireAction.mockClear();
  mocks.listEmailLog.mockReset();
  mocks.emailLogSummary.mockReset();
  mocks.emailLogEntry.mockReset();
});

describe("GET /admin/email-log", () => {
  it("demands the view_email_log action before anything else", async () => {
    await renderList();
    expect(mocks.requireAction).toHaveBeenCalledWith("view_email_log", "/admin/email-log");
  });

  it("renders the summary, filters, five columns and escaped rows in English", async () => {
    const html = await renderList({ lang: "en" });
    expect(html).toContain("<h1>Email log</h1>");
    expect(html.match(/class="metric"/g)).toHaveLength(4);
    expect(html).toContain("Accepted by SMTP");
    expect(html).toContain(text(copy("en", "caveat")));
    expect(html).toContain('method="get"');
    expect(html).toContain('action="/admin/email-log"');
    expect(html).toContain('<input type="hidden" name="lang" value="en"/>');
    expect(html.match(/<th scope="col"/g)).toHaveLength(5);
    expect(html).toContain('id="email-log-q"');
    expect(html).toContain('id="email-log-opened"');
    expect(html).toContain('id="email-log-type"');
    expect(html).toContain('id="email-log-sort"');

    // Rows link to the detail page and escape whatever the subject carried.
    expect(html).toContain(`href="/admin/email-log/${ENTRY_ID}?lang=en"`);
    expect(html).toContain("Committee update &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Person A");
    expect(html).toContain("SMTP_USER");
    expect(html).toContain("Not tracked");
    expect(html).toContain(text(copy("en", "open.unopened")));
    expect(html).toContain(`<time dateTime="${WHEN.toISOString()}">`);
    expect(html).not.toContain("a".repeat(64));

    // Pagination from page 2 of 3.
    expect(html).toContain('rel="prev"');
    expect(html).toContain('rel="next"');
    expect(html).toMatch(/href="\/admin\/email-log\?lang=en&amp;page=3"/);
    expect(html).toContain('aria-label="' + text(copy("en", "page.label")) + '"');
  });

  it("marks the email log as the current workspace destination", async () => {
    const html = await renderList({ lang: "en" });
    expect(html).toMatch(
      /<a class="workspace-item is-current" aria-current="page" href="\/admin\/email-log\?lang=en">/,
    );
    expect(html).toContain('href="/admin/communications?lang=en"');
  });

  it("keeps the table a table for assistive technology under the stacked mobile layout", async () => {
    const html = await renderList({ lang: "en" });
    expect(html).toMatch(/<table class="[^"]*" role="table">/);
    expect(html).toContain(`<caption class="sr-only">${text(copy("en", "title"))}</caption>`);
    expect(html.match(/role="rowgroup"/g)).toHaveLength(2);
    expect(html.match(/<th scope="col" role="columnheader">/g)).toHaveLength(5);
    expect(html.match(/<tr role="row">/g)).toHaveLength(1 + rowsFixture.length);
    expect(html.match(/<td role="cell" data-label="/g)).toHaveLength(5 * rowsFixture.length);
  });

  it("names each row link by its visible subject plus a hidden, distinct suffix", async () => {
    const html = await renderList({ lang: "en" });
    expect(html).not.toContain("aria-label=\"View message");
    const suffix = text(` — ${fill(copy("en", "row.view"), { recipient: "a@example.org" })}`);
    expect(html).toContain(`<span class="sr-only">${suffix}</span>`);
    expect(html).toContain(
      `<span class="sr-only">${text(` — ${fill(copy("en", "row.view"), { recipient: "support@clicksmith.net" })}`)}</span>`,
    );
    // The visible text and the hidden suffix sit inside the same link.
    expect(html).toMatch(
      new RegExp(`<a[^>]*href="/admin/email-log/${ENTRY_ID}\\?lang=en"[^>]*>Committee update[^<]*<span class="sr-only">`),
    );
  });

  it("stands in for an empty subject so every row still has a link to click", async () => {
    mocks.listEmailLog.mockResolvedValue(pageData({ rows: [{ ...rowBase, subject: "   " }] }));
    const en = await renderList({ lang: "en" });
    expect(en).toContain(`>(no subject)<span class="sr-only">`);
    const es = await renderList({ lang: "es" });
    expect(es).toContain(`>(sin asunto)<span class="sr-only">`);
  });

  it("carries the current filters and page through row links and the language switch", async () => {
    const html = await renderList({ lang: "en", q: "x", status: "failed", page: "2" });
    expect(html).toContain(
      `href="/admin/email-log/${ENTRY_ID}?lang=en&amp;q=x&amp;status=failed&amp;page=2"`,
    );
    expect(html).toContain(
      '<a hrefLang="en" aria-current="page" href="/admin/email-log?q=x&amp;status=failed&amp;page=2&amp;lang=en">EN</a>',
    );
    expect(html).toContain(
      '<a hrefLang="es" href="/admin/email-log?q=x&amp;status=failed&amp;page=2&amp;lang=es">ES</a>',
    );
    // The sidebar entry still points at the plain register.
    expect(html).toContain('aria-current="page" href="/admin/email-log?lang=en">');
  });

  it("switches language without any filters when none are set", async () => {
    const html = await renderList({ lang: "es" });
    expect(html).toContain('<a hrefLang="en" href="/admin/email-log?lang=en">EN</a>');
    expect(html).toContain('<a hrefLang="es" aria-current="page" href="/admin/email-log?lang=es">ES</a>');
  });

  it("renders in Spanish", async () => {
    const html = await renderList({ lang: "es" });
    expect(html).toContain(`<h1>${text(copy("es", "title"))}</h1>`);
    expect(html).toContain('<div class="workspace" lang="es">');
    expect(html).toContain("Aceptado por SMTP");
    expect(html).toContain("Registro de correo");
    expect(html).toContain('<input type="hidden" name="lang" value="es"/>');
  });

  it("passes parsed, whitelisted filters to the query layer", async () => {
    await renderList({ q: "O'Brien", status: "failed", opened: "bogus", type: "communication", sort: "subject", dir: "asc", page: "2" });
    expect(mocks.listEmailLog).toHaveBeenCalledWith({
      q: "O'Brien",
      status: "failed",
      opened: "any",
      type: "communication",
      sort: "subject",
      dir: "asc",
      page: 2,
    });
  });

  it("shows the empty state without a table", async () => {
    mocks.listEmailLog.mockResolvedValue(pageData({ rows: [], total: 0, page: 1, pageCount: 1, firstResult: 0, lastResult: 0 }));
    const html = await renderList();
    expect(html).toContain(text(copy("en", "empty.none")));
    expect(html).not.toContain("<table");
    expect(html).not.toContain('rel="next"');
  });

  it("explains the mock adapter instead of querying a database", async () => {
    vi.stubEnv("DATA_ADAPTER", "mock");
    const html = await renderList();
    expect(html).toContain(text(copy("en", "mockNotice")));
    expect(mocks.listEmailLog).not.toHaveBeenCalled();
    expect(mocks.emailLogSummary).not.toHaveBeenCalled();
  });
});

describe("GET /admin/email-log/[id]", () => {
  it("demands the view_email_log action and 404s malformed ids before querying", async () => {
    await expect(renderEntry("not-a-uuid")).rejects.toThrow("NOT_FOUND");
    expect(mocks.requireAction).toHaveBeenCalledWith("view_email_log", "/admin/email-log/not-a-uuid");
    expect(mocks.emailLogEntry).not.toHaveBeenCalled();
  });

  it("404s under the mock adapter and for unknown rows", async () => {
    vi.stubEnv("DATA_ADAPTER", "mock");
    await expect(renderEntry(ENTRY_ID)).rejects.toThrow("NOT_FOUND");
    expect(mocks.emailLogEntry).not.toHaveBeenCalled();

    vi.stubEnv("DATA_ADAPTER", "postgres");
    mocks.emailLogEntry.mockResolvedValue(null);
    await expect(renderEntry(ENTRY_ID)).rejects.toThrow("NOT_FOUND");
    expect(mocks.emailLogEntry).toHaveBeenCalledWith(ENTRY_ID);
  });

  it("shows the message safely: escaped text, a fully sandboxed preview, no live pixel", async () => {
    const html = await renderEntry(ENTRY_ID, { lang: "en" });
    expect(html).toContain("<h1>Committee update</h1>");
    expect(html).toContain("Hello &lt;b&gt;there&lt;/b&gt; &amp; welcome");
    expect(html).not.toContain("<b>there</b>");

    expect(html).toContain('sandbox=""');
    expect(html).not.toContain("allow-scripts");
    expect(html).not.toContain("allow-same-origin");
    expect(html).toMatch(/referrerpolicy="no-referrer"/i);
    expect(html).toContain("srcDoc=");
    const srcdoc = /srcDoc="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(srcdoc).toContain(PREVIEW_CSP.replace(/'/g, "&#x27;"));
    expect(srcdoc).not.toContain("&lt;base");
    expect(srcdoc).toContain("/api/email/open-removed/");

    // Nothing in the page is a real image pointing at the pixel route.
    expect(html).not.toMatch(/<img[^>]*api\/email\/open\//);
    expect(html).toContain("Accepted by SMTP");
    expect(html).toContain(text(copy("en", "detail.sentExplainer")));
    expect(html).toContain("admin@archive.local");
    expect(html).toContain(`href="/admin/communications?lang=en"`);
    expect(html).toContain(text(copy("en", "detail.communicationLink")));
    expect(html).toContain("SMTP");
    expect(html).toContain(text(copy("en", "open.loads").replace("{n}", "3")));
    expect(html).not.toContain(text(copy("en", "detail.redacted")));
    expect(html).not.toContain("a".repeat(64));
  });

  it("repeats the delivery caveat where the status is read", async () => {
    const en = await renderEntry(ENTRY_ID, { lang: "en" });
    expect(en).toContain(text(copy("en", "caveat")));
    const es = await renderEntry(ENTRY_ID, { lang: "es" });
    expect(es).toContain(text(copy("es", "caveat")));
  });

  it("makes the scrolling bodies reachable and named for keyboard users", async () => {
    const html = await renderEntry(ENTRY_ID, { lang: "en" });
    expect(html).toMatch(
      new RegExp(`<pre class="[^"]*" tabindex="0" role="region" aria-label="${text(copy("en", "detail.text"))}">`),
    );
    expect(html).toMatch(
      new RegExp(`<pre class="[^"]*" tabindex="0" role="region" aria-label="${text(copy("en", "detail.source"))}">`),
    );
  });

  it("titles a message with no subject instead of an empty heading", async () => {
    mocks.emailLogEntry.mockResolvedValue({ ...entryFixture, subject: "" });
    const html = await renderEntry(ENTRY_ID, { lang: "en" });
    expect(html).toContain("<h1>(no subject)</h1>");
    expect(html).not.toContain("<h1></h1>");
  });

  it("returns to the same place in the list and keeps it across a language switch", async () => {
    const html = await renderEntry(ENTRY_ID, { lang: "en", q: "x", status: "failed", page: "2" });
    expect(html).toContain('href="/admin/email-log?lang=en&amp;q=x&amp;status=failed&amp;page=2"');
    expect(html).toContain(
      `<a hrefLang="en" aria-current="page" href="/admin/email-log/${ENTRY_ID}?q=x&amp;status=failed&amp;page=2&amp;lang=en">EN</a>`,
    );
    expect(html).toContain(
      `<a hrefLang="es" href="/admin/email-log/${ENTRY_ID}?q=x&amp;status=failed&amp;page=2&amp;lang=es">ES</a>`,
    );

    const plain = await renderEntry(ENTRY_ID, { lang: "es" });
    expect(plain).toContain('href="/admin/email-log?lang=es"');
    expect(plain).toContain(`<a hrefLang="en" href="/admin/email-log/${ENTRY_ID}?lang=en">EN</a>`);
  });

  it("explains redaction for one-time-link emails and handles text-only rows", async () => {
    mocks.emailLogEntry.mockResolvedValue({
      ...entryFixture,
      emailType: "password_reset",
      htmlBody: null,
      communicationId: null,
      communicationSubject: null,
      actorUserId: null,
      actorEmail: null,
      actorDisplayName: null,
      trackingTokenHash: null,
      openedAt: null,
      lastOpenedAt: null,
      openCount: 0,
    });
    const html = await renderEntry(ENTRY_ID, { lang: "es" });
    expect(html).toContain(text(copy("es", "detail.redacted")));
    expect(html).toContain(text(copy("es", "detail.htmlNone")));
    expect(html).not.toContain("<iframe");
    expect(html).toContain(text(copy("es", "detail.system")));
    expect(html).toContain(text(copy("es", "open.untracked")));
    expect(html).not.toContain(text(copy("es", "detail.communicationLink")));
  });
});
