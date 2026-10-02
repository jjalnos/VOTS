import { drizzle } from "drizzle-orm/postgres-js";
import { describe, expect, it } from "vitest";
import type { ArchiveDatabase } from "@/db/client";
import * as schema from "@/db/schema";
import {
  EMAIL_LOG_DEFAULT_PARAMS,
  EMAIL_LOG_MAX_PAGE,
  EMAIL_LOG_PAGE_SIZE,
  EMAIL_LOG_RECENT_WINDOW_MS,
  emailLogCountQuery,
  emailLogEntry,
  emailLogEntryHref,
  emailLogEntryQuery,
  emailLogEntrySwitchPath,
  emailLogHasFilters,
  emailLogHref,
  emailLogListQuery,
  emailLogSummary,
  emailLogSummaryQuery,
  emailLogSwitchPath,
  emailLogWhere,
  escapeLike,
  listEmailLog,
  parseEmailLogSearchParams,
  type EmailLogListRow,
  type EmailLogSearchParams,
} from "@/lib/email/log-queries";
import { localeFrom, withLocale } from "@/lib/i18n";

const db = drizzle.mock({ schema }) as unknown as ArchiveDatabase;

function params(overrides: Partial<EmailLogSearchParams> = {}): EmailLogSearchParams {
  return { ...EMAIL_LOG_DEFAULT_PARAMS, ...overrides };
}

/**
 * A database whose every select resolves, in order, to the given results,
 * remembering each OFFSET it was asked for.
 */
function fakeDatabase(results: unknown[][]) {
  let call = 0;
  const offsets: unknown[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy", "limit", "leftJoin"]) {
    builder[method] = () => builder;
  }
  builder.offset = (value: unknown) => {
    offsets.push(value);
    return builder;
  };
  builder.then = (resolve: (value: unknown) => void, reject?: (error: unknown) => void) => {
    const index = call;
    call += 1;
    if (index >= results.length) {
      reject?.(new Error(`unexpected select #${index + 1}`));
      return;
    }
    resolve(results[index]);
  };
  return Object.assign({ select: () => builder } as unknown as ArchiveDatabase, { offsets });
}

describe("parseEmailLogSearchParams", () => {
  it("falls back to the defaults", () => {
    expect(parseEmailLogSearchParams({})).toEqual(EMAIL_LOG_DEFAULT_PARAMS);
    expect(
      parseEmailLogSearchParams({
        q: undefined,
        status: "bogus",
        opened: "yes",
        type: "newsletter",
        sort: "id",
        dir: "sideways",
        page: "abc",
      }),
    ).toEqual(EMAIL_LOG_DEFAULT_PARAMS);
  });

  it("whitelists every select and trims the query", () => {
    expect(
      parseEmailLogSearchParams({
        q: "  eleanor ",
        status: "failed",
        opened: "unopened",
        type: "invitation",
        sort: "open_count",
        dir: "asc",
        page: "3",
      }),
    ).toEqual({
      q: "eleanor",
      status: "failed",
      opened: "unopened",
      type: "invitation",
      sort: "open_count",
      dir: "asc",
      page: 3,
    });
  });

  it("takes the first of repeated parameters and bounds their size", () => {
    const parsed = parseEmailLogSearchParams({
      q: ["x".repeat(500), "second"],
      status: ["sent", "failed"],
      page: ["2", "9"],
    });
    expect(parsed.q).toHaveLength(180);
    expect(parsed.status).toBe("sent");
    expect(parsed.page).toBe(2);
  });

  it("never yields a page below one or beyond the ceiling", () => {
    for (const value of ["0", "-1", "1e3", "1.5", "", " 2", "NaN", "9007199254740993"]) {
      expect(parseEmailLogSearchParams({ page: value }).page).toBe(1);
    }
    expect(parseEmailLogSearchParams({ page: "99999999" }).page).toBe(EMAIL_LOG_MAX_PAGE);
  });
});

describe("emailLogHasFilters", () => {
  it("ignores sort and page", () => {
    expect(emailLogHasFilters(params())).toBe(false);
    expect(emailLogHasFilters(params({ sort: "subject", dir: "asc", page: 4 }))).toBe(false);
    expect(emailLogHasFilters(params({ q: "a" }))).toBe(true);
    expect(emailLogHasFilters(params({ status: "sent" }))).toBe(true);
    expect(emailLogHasFilters(params({ opened: "untracked" }))).toBe(true);
    expect(emailLogHasFilters(params({ type: "communication" }))).toBe(true);
  });
});

describe("hrefs", () => {
  it("serializes in a fixed order, omitting defaults and encoding values", () => {
    expect(emailLogHref({}, "en")).toBe("/admin/email-log?lang=en");
    expect(emailLogHref({ page: 1 }, "es")).toBe("/admin/email-log?lang=es");
    expect(
      emailLogHref(
        {
          page: 2,
          dir: "asc",
          sort: "recipient",
          type: "invitation",
          opened: "opened",
          status: "sent",
          q: "a&b=c",
        },
        "en",
      ),
    ).toBe(
      "/admin/email-log?lang=en&q=a%26b%3Dc&status=sent&opened=opened&type=invitation&sort=recipient&dir=asc&page=2",
    );
  });

  it("encodes the entry id", () => {
    expect(emailLogEntryHref("abc-123", "es")).toBe("/admin/email-log/abc-123?lang=es");
    expect(emailLogEntryHref("../x?y", "en")).toBe("/admin/email-log/..%2Fx%3Fy?lang=en");
  });

  it("carries the list's filters onto an entry and parses them back unchanged", () => {
    const filters = params({ q: "a&b=c", status: "failed", sort: "subject", page: 2 });
    const entry = emailLogEntryHref("abc-123", "es", filters);
    expect(entry).toBe(
      "/admin/email-log/abc-123?lang=es&q=a%26b%3Dc&status=failed&sort=subject&page=2",
    );
    const query = Object.fromEntries(new URL(entry, "https://archive.example").searchParams);
    expect(parseEmailLogSearchParams(query)).toEqual(filters);
    expect(localeFrom(query.lang)).toBe("es");
  });

  it("builds language-switch paths without a lang, so the switch's own lang wins", () => {
    const filters = params({ q: "ana", page: 3 });
    expect(emailLogSwitchPath(params())).toBe("/admin/email-log");
    expect(emailLogSwitchPath(filters)).toBe("/admin/email-log?q=ana&page=3");
    expect(emailLogEntrySwitchPath("abc-123")).toBe("/admin/email-log/abc-123");
    expect(emailLogEntrySwitchPath("abc-123", filters)).toBe("/admin/email-log/abc-123?q=ana&page=3");

    for (const path of [emailLogSwitchPath(filters), emailLogEntrySwitchPath("abc-123", filters)]) {
      for (const locale of ["en", "es"] as const) {
        const switched = new URL(withLocale(path, locale), "https://archive.example");
        expect(switched.searchParams.getAll("lang")).toEqual([locale]);
        expect(localeFrom(switched.searchParams.get("lang"))).toBe(locale);
        expect(parseEmailLogSearchParams(Object.fromEntries(switched.searchParams))).toEqual(filters);
      }
    }
  });
});

describe("escapeLike", () => {
  it("escapes the three LIKE metacharacters only", () => {
    expect(escapeLike("100% _done_ \\ ok")).toBe("100\\% \\_done\\_ \\\\ ok");
    expect(escapeLike("plain")).toBe("plain");
  });
});

describe("list and count queries", () => {
  it("has no where clause for the defaults", () => {
    expect(emailLogWhere(params())).toBeUndefined();
    const { sql, params: bound } = emailLogListQuery(db, params()).toSQL();
    expect(sql).not.toContain("where");
    expect(sql).toContain('order by "email_log"."created_at" desc nulls last, "email_log"."created_at" desc, "email_log"."id" desc');
    // drizzle elides a zero offset on the first page.
    expect(sql).toMatch(/limit \$1$/);
    expect(bound).toEqual([EMAIL_LOG_PAGE_SIZE]);
  });

  it("binds the search term once per column, escaped, never inlined", () => {
    const term = "O'Brien 100% _x_";
    const { sql, params: bound } = emailLogListQuery(db, params({ q: term })).toSQL();
    const pattern = `%O'Brien 100\\% \\_x\\_%`;
    expect(bound.filter((value) => value === pattern)).toHaveLength(5);
    expect(sql).not.toContain("O'Brien");
    expect(sql.match(/ilike/g)).toHaveLength(5);
    for (const column of ["recipient_email", "recipient_name", "subject", "email_type", "failure_reason"]) {
      expect(sql).toContain(`"email_log"."${column}" ilike $`);
    }
  });

  it("renders every filter with bound values", () => {
    const sent = emailLogListQuery(db, params({ status: "sent" })).toSQL();
    expect(sent.sql).toContain('"email_log"."status" = $1');
    expect(sent.params[0]).toBe("sent");

    const opened = emailLogListQuery(db, params({ opened: "opened" })).toSQL();
    expect(opened.sql).toContain('"email_log"."opened_at" is not null');

    const unopened = emailLogListQuery(db, params({ opened: "unopened" })).toSQL();
    expect(unopened.sql).toContain('"email_log"."tracking_token_hash" is not null');
    expect(unopened.sql).toContain('"email_log"."opened_at" is null');

    const untracked = emailLogListQuery(db, params({ opened: "untracked" })).toSQL();
    expect(untracked.sql).toContain('"email_log"."tracking_token_hash" is null');
    expect(untracked.sql).not.toContain("opened_at\" is");

    const typed = emailLogListQuery(db, params({ type: "ai_usage_alert" })).toSQL();
    expect(typed.sql).toContain('"email_log"."email_type" = $1');
    expect(typed.params[0]).toBe("ai_usage_alert");

    const combined = emailLogListQuery(
      db,
      params({ q: "x", status: "failed", opened: "untracked", type: "communication" }),
    ).toSQL();
    expect(combined.sql).toContain(" and ");
    expect(combined.params).toEqual(["%x%", "%x%", "%x%", "%x%", "%x%", "failed", "communication", 25]);
  });

  it("sorts by whitelisted columns with a stable tiebreak", () => {
    const byCount = emailLogListQuery(db, params({ sort: "open_count", dir: "asc" })).toSQL();
    expect(byCount.sql).toContain('order by "email_log"."open_count" asc nulls last, "email_log"."created_at" desc, "email_log"."id" desc');
    const byRecipient = emailLogListQuery(db, params({ sort: "recipient" })).toSQL();
    expect(byRecipient.sql).toContain('"email_log"."recipient_email" desc nulls last');
    const bySubject = emailLogListQuery(db, params({ sort: "subject", dir: "asc" })).toSQL();
    expect(bySubject.sql).toContain('"email_log"."subject" asc nulls last');
    const byType = emailLogListQuery(db, params({ sort: "type" })).toSQL();
    expect(byType.sql).toContain('"email_log"."email_type" desc nulls last');
    const byStatus = emailLogListQuery(db, params({ sort: "status" })).toSQL();
    expect(byStatus.sql).toContain('"email_log"."status" desc nulls last');
    const byOpened = emailLogListQuery(db, params({ sort: "opened_at" })).toSQL();
    expect(byOpened.sql).toContain('"email_log"."opened_at" desc nulls last');
  });

  it("pages 25 at a time", () => {
    const { params: bound } = emailLogListQuery(db, params({ page: 3 })).toSQL();
    expect(bound.slice(-2)).toEqual([25, 50]);
  });

  it("counts with the same filters and no paging", () => {
    const { sql, params: bound } = emailLogCountQuery(db, params({ status: "failed", q: "z" })).toSQL();
    expect(sql).toContain("cast(count(*) as integer)");
    expect(sql).not.toContain("limit");
    expect(sql).not.toContain("order by");
    expect(bound).toEqual(["%z%", "%z%", "%z%", "%z%", "%z%", "failed"]);
  });

  it("selects only list columns, never bodies", () => {
    const { sql } = emailLogListQuery(db, params()).toSQL();
    expect(sql).not.toContain("text_body");
    expect(sql).not.toContain("html_body");
    expect(sql).toMatch(/^select "id", "email_type", "status", "failure_reason", "recipient_email", "recipient_name", "subject", "tracking_token_hash", "opened_at", "last_opened_at", "open_count", "created_at" from "email_log"/);
  });
});

describe("summary and entry queries", () => {
  it("counts the four cards in one statement with a bound window", () => {
    const since = new Date("2026-09-02T00:00:00Z");
    const { sql, params: bound } = emailLogSummaryQuery(db, since).toSQL();
    expect(sql).toContain("filter (where \"status\" = 'sent')");
    expect(sql).toContain('filter (where "opened_at" is not null)');
    expect(sql).toContain("filter (where \"status\" = 'failed')");
    expect(sql).toContain('filter (where "email_log"."created_at" >= $1)');
    expect(sql.match(/count\(\*\)/g)).toHaveLength(4);
    // The window must reach the driver as a value it accepts: postgres-js
    // refuses a raw Date, and a `${since}` inside sql`` would hand it one.
    expect(bound).toEqual([since.toISOString()]);
    expect(bound.some((value) => value instanceof Date)).toBe(false);
  });

  it("loads one entry with actor and communication joins by bound id", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const { sql, params: bound } = emailLogEntryQuery(db, id).toSQL();
    expect(sql).toContain('left join "users" "actors" on "actors"."id" = "email_log"."actor_user_id"');
    expect(sql).toContain('left join "communications" on "communications"."id" = "email_log"."communication_id"');
    expect(sql).toContain('where "email_log"."id" = $1');
    expect(sql).toContain("limit $2");
    expect(bound).toEqual([id, 1]);
    expect(sql).not.toContain(id);
  });
});

describe("listEmailLog", () => {
  const row = (index: number): EmailLogListRow => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    emailType: "communication",
    status: "sent",
    failureReason: null,
    recipientEmail: `${index}@example.org`,
    recipientName: null,
    subject: `Subject ${index}`,
    trackingTokenHash: null,
    openedAt: null,
    lastOpenedAt: null,
    openCount: 0,
    createdAt: new Date("2026-10-01T00:00:00Z"),
  });

  it("computes the range for a last, partial page", async () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(51 + index));
    const page = await listEmailLog(params({ page: 3 }), fakeDatabase([[{ value: 60 }], rows]));
    expect(page).toMatchObject({
      total: 60,
      page: 3,
      pageCount: 3,
      pageSize: 25,
      firstResult: 51,
      lastResult: 60,
    });
    expect(page.rows).toHaveLength(10);
  });

  it("computes the range for a full middle page", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => row(26 + index));
    const database = fakeDatabase([[{ value: 60 }], rows]);
    const page = await listEmailLog(params({ page: 2 }), database);
    expect(page).toMatchObject({ firstResult: 26, lastResult: 50, pageCount: 3 });
    expect(database.offsets).toEqual([25]);
  });

  it("clamps a page past the end to the last page instead of showing nothing", async () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(51 + index));
    const database = fakeDatabase([[{ value: 60 }], rows]);
    const page = await listEmailLog(params({ page: 500 }), database);
    expect(page).toMatchObject({
      total: 60,
      page: 3,
      pageCount: 3,
      firstResult: 51,
      lastResult: 60,
    });
    expect(page.rows).toHaveLength(10);
    expect(database.offsets).toEqual([50]);
  });

  it("clamps to the last page when the results shrank under a paginated reader", async () => {
    const rows = Array.from({ length: 5 }, (_, index) => row(26 + index));
    const database = fakeDatabase([[{ value: 30 }], rows]);
    const page = await listEmailLog(params({ page: 3 }), database);
    expect(page).toMatchObject({
      total: 30,
      page: 2,
      pageCount: 2,
      firstResult: 26,
      lastResult: 30,
    });
    expect(database.offsets).toEqual([25]);
  });

  it("reports zero results without a phantom range", async () => {
    const page = await listEmailLog(params(), fakeDatabase([[{ value: 0 }], []]));
    expect(page).toEqual({
      rows: [],
      total: 0,
      page: 1,
      pageCount: 1,
      pageSize: 25,
      firstResult: 0,
      lastResult: 0,
    });
  });
});

describe("emailLogSummary and emailLogEntry", () => {
  it("coerces the summary counts and defaults missing rows to zero", async () => {
    const summary = await emailLogSummary(
      new Date(),
      fakeDatabase([[{ accepted: "4", opened: 2, failed: "1", recent: 3 }]]),
    );
    expect(summary).toEqual({ accepted: 4, opened: 2, failed: 1, recent: 3 });
    expect(await emailLogSummary(new Date(), fakeDatabase([[]]))).toEqual({
      accepted: 0,
      opened: 0,
      failed: 0,
      recent: 0,
    });
    expect(EMAIL_LOG_RECENT_WINDOW_MS).toBe(30 * 86_400_000);
  });

  it("returns null when the entry does not exist", async () => {
    expect(await emailLogEntry("x", fakeDatabase([[]]))).toBeNull();
    const entry = { id: "x", subject: "Hi" };
    expect(await emailLogEntry("x", fakeDatabase([[entry]]))).toBe(entry);
  });
});
