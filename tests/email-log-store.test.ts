import { drizzle } from "drizzle-orm/postgres-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emailLog } from "@/db/schema";
import { noopEmailLogRecorder, type EmailLogRow } from "@/lib/email/log";
import {
  defaultEmailLogRecorder,
  EMAIL_OPEN_COUNT_CAP,
  EMAIL_OPEN_DEBOUNCE_SECONDS,
  postgresEmailLogRecorder,
} from "@/lib/email/log-store";

const captured = vi.hoisted(() => ({
  inserts: [] as Array<{ table: unknown; values: unknown }>,
  updates: [] as Array<{ table: unknown; set: unknown; where: unknown }>,
}));

vi.mock("@/db/client", () => ({
  getDatabase: () => ({
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        captured.inserts.push({ table, values });
      },
    }),
    update: (table: unknown) => ({
      set: (set: unknown) => ({
        where: async (where: unknown) => {
          captured.updates.push({ table, set, where });
        },
      }),
    }),
  }),
}));

const row: EmailLogRow = {
  emailType: "communication",
  status: "sent",
  transport: "smtp",
  failureReason: null,
  recipientEmail: "a@example.org",
  recipientName: "Person A",
  recipientUserId: null,
  communicationId: null,
  actorUserId: null,
  locale: "en",
  subject: "Committee update",
  replyTo: null,
  textBody: "Body",
  htmlBody: null,
  metadata: null,
  trackingTokenHash: null,
  createdAt: new Date("2026-10-02T12:00:00Z"),
};

afterEach(() => {
  captured.inserts.length = 0;
  captured.updates.length = 0;
  vi.unstubAllEnvs();
});

describe("postgresEmailLogRecorder", () => {
  it("inserts the row as given into email_log", async () => {
    await postgresEmailLogRecorder().record(row);
    expect(captured.inserts).toHaveLength(1);
    expect(captured.inserts[0].table).toBe(emailLog);
    expect(captured.inserts[0].values).toBe(row);
  });

  it("marks an open with one atomic UPDATE limited to accepted rows, debounced and capped", async () => {
    const hash = "f".repeat(64);
    await postgresEmailLogRecorder().markOpened(hash);
    expect(captured.updates).toHaveLength(1);
    const [update] = captured.updates;
    expect(update.table).toBe(emailLog);

    const rendered = drizzle
      .mock()
      .update(emailLog)
      .set(update.set as Record<string, never>)
      .where(update.where as never)
      .toSQL();
    expect(rendered.sql).toContain('"opened_at" = coalesce("email_log"."opened_at", now())');
    expect(rendered.sql).toContain('"last_opened_at" = now()');
    expect(rendered.sql).toContain('"open_count" = "email_log"."open_count" + 1');
    expect(rendered.sql).toContain('"email_log"."tracking_token_hash" = $1');
    expect(rendered.sql).toContain('"email_log"."status" = $2');
    // A client re-fetching the pixel in a loop, or a replayed pixel URL,
    // must not turn one row into unbounded writes: loads within the
    // debounce window are skipped, and the count stops at the cap.
    expect(rendered.sql).toContain(
      '("email_log"."last_opened_at" is null or "email_log"."last_opened_at" < now() - make_interval(secs => $3))',
    );
    expect(rendered.sql).toContain('"email_log"."open_count" < $4');
    expect(rendered.params).toEqual([hash, "sent", EMAIL_OPEN_DEBOUNCE_SECONDS, EMAIL_OPEN_COUNT_CAP]);
    expect(EMAIL_OPEN_DEBOUNCE_SECONDS).toBe(60);
    expect(EMAIL_OPEN_COUNT_CAP).toBe(1000);
    expect(rendered.sql).not.toContain(hash);
  });
});

describe("defaultEmailLogRecorder", () => {
  it("is a no-op under the mock adapter", () => {
    vi.stubEnv("DATA_ADAPTER", "mock");
    expect(defaultEmailLogRecorder()).toBe(noopEmailLogRecorder);
    vi.stubEnv("DATA_ADAPTER", "");
    expect(defaultEmailLogRecorder()).toBe(noopEmailLogRecorder);
  });

  it("writes to postgres under the postgres adapter", async () => {
    vi.stubEnv("DATA_ADAPTER", "postgres");
    const recorder = defaultEmailLogRecorder();
    expect(recorder).not.toBe(noopEmailLogRecorder);
    await recorder.record(row);
    expect(captured.inserts).toHaveLength(1);
  });
});
