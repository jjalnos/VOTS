import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const databaseMock = vi.hoisted(() => ({ getDatabase: vi.fn() }));
const logState = vi.hoisted(() => {
  const rows: unknown[] = [];
  return {
    rows,
    recorder: {
      async record(row: unknown) {
        rows.push(row);
      },
      async markOpened() {},
    },
  };
});

vi.mock("@/db/client", () => ({ getDatabase: databaseMock.getDatabase }));
vi.mock("@/lib/email/log-store", () => ({
  defaultEmailLogRecorder: () => logState.recorder,
  postgresEmailLogRecorder: () => logState.recorder,
}));

import { ResendUsageAlertAdapter, UsageAlertDeliveryError } from "@/lib/ai/usage-alert";
import { issueInvitation } from "@/lib/auth/invitations";
import { issuePasswordReset, type PasswordResetRequestConfiguration } from "@/lib/auth/password-reset";
import type { Actor } from "@/lib/auth/policy";
import { sendCommunication } from "@/lib/communications/communications";
import { escapeHtml } from "@/lib/email/branded";
import { hashTrackingToken, TRACKING_PIXEL_PATH, type EmailLogRow } from "@/lib/email/log";
import { EmailDeliveryError, type EmailMessage } from "@/lib/email/smtp";

const ORIGIN = "https://voicesoftheshoah.org";
const TARGET_USER = "00000000-0000-4000-8000-0000000000ff";
const admin: Actor = {
  userId: "00000000-0000-4000-8000-00000000000a",
  email: "admin@archive.local",
  displayName: "Admin",
  roles: ["admin"],
  mfaVerified: true,
};
const configuration: PasswordResetRequestConfiguration = {
  siteOrigin: ORIGIN,
  tokenKey: "q9Vg3Yp8Kx2Lm7Nd4Rf6Ts1Wc5Zh0BjUaEiOoP",
  smtp: {
    host: "smtp.elasticemail.com",
    port: 2525,
    secure: false,
    requireTLS: true,
    user: "vots-smtp-vgxcdd0e0w@voicesoftheshoah.org",
    password: "credential-under-test",
    from: "no-reply@voicesoftheshoah.org",
  },
};
const PIXEL_URL = new RegExp(`${ORIGIN}${TRACKING_PIXEL_PATH}([A-Za-z0-9_-]{32})`);

function rows(): EmailLogRow[] {
  return logState.rows as EmailLogRow[];
}

/** Shapes every secret the stored copy must be free of: raw, HTML-escaped and URL-encoded. */
function forms(value: string): string[] {
  return [...new Set([value, escapeHtml(value), encodeURIComponent(value)])];
}

function expectClean(row: EmailLogRow, secrets: string[]) {
  const serialized = JSON.stringify(row);
  for (const secret of secrets) {
    for (const form of forms(secret)) {
      expect(row.textBody, form).not.toContain(form);
      expect(row.htmlBody ?? "", form).not.toContain(form);
      expect(serialized, form).not.toContain(form);
    }
  }
  expect(row.htmlBody ?? "").not.toContain(TRACKING_PIXEL_PATH);
  expect(serialized).not.toContain(TRACKING_PIXEL_PATH);
}

function tokenFrom(message: EmailMessage): string {
  const match = /#token=([A-Za-z0-9_-]{43})/.exec(message.text);
  if (!match) throw new Error("The outgoing message carries no token.");
  return match[1];
}

/**
 * One transaction shape satisfies both issuePasswordReset and issueInvitation.
 * `rejectTransactionsAfter` makes every transaction past that count fail, the
 * way a connection dropping between the send and its bookkeeping would.
 */
function fakeIssueDatabase(
  options: { displayName?: string; rejectTransactionsAfter?: number } = {},
) {
  const displayName = options.displayName ?? "Eleanor Gossen";
  let selectCall = 0;
  let transactionCall = 0;
  const transaction = {
    select: vi.fn(() => {
      const call = (selectCall += 1);
      const builder = {
        from: vi.fn(() => builder),
        where: vi.fn(() => builder),
        for: vi.fn(() => builder),
        limit: vi.fn(async () =>
          call === 1
            ? [
                {
                  id: TARGET_USER,
                  email: "eleanor@example.org",
                  displayName,
                  active: true,
                  passwordHash: null,
                  sessionVersion: 4,
                },
              ]
            : [{ metadata: { locale: "en" } }],
        ),
      };
      (builder as { then?: unknown }).then = (resolve: (value: Array<{ value: number }>) => unknown) =>
        resolve([{ value: 0 }]);
      return builder;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: "token-1" }]),
        then: (resolve: (value: unknown) => unknown) => resolve(undefined),
      })),
    })),
    update: vi.fn(() => {
      const builder = {
        set: vi.fn(() => builder),
        where: vi.fn(async () => undefined),
      };
      return builder;
    }),
  };
  databaseMock.getDatabase.mockReturnValue({
    transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) => {
      transactionCall += 1;
      if (
        options.rejectTransactionsAfter !== undefined &&
        transactionCall > options.rejectTransactionsAfter
      ) {
        throw new Error("connection reset; password=hunter2");
      }
      return callback(transaction);
    }),
  });
}

const RECIPIENT_A = "00000000-0000-4000-8000-0000000000b1";
const RECIPIENT_B = "00000000-0000-4000-8000-0000000000b2";
const letter = {
  subject: "Committee update",
  body: "The archive grew this week.\n\nCome see the new survivors.",
  locale: "en" as const,
  recipientUserIds: [RECIPIENT_A, RECIPIENT_B],
};

function fakeSendDatabase() {
  const targets = [
    { id: RECIPIENT_A, email: "a@example.org", displayName: "Person A", active: true },
    { id: RECIPIENT_B, email: "b@example.org", displayName: "Person B", active: true },
  ];
  databaseMock.getDatabase.mockReturnValue({
    select: vi.fn(() => {
      const builder = { from: vi.fn(() => builder), where: vi.fn(async () => targets) };
      return builder;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn(async () => [{ id: "communication-1" }]) })),
    })),
    transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
      callback({
        update: vi.fn(() => {
          const builder = { set: vi.fn(() => builder), where: vi.fn(async () => undefined) };
          return builder;
        }),
        insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
      }),
    ),
  });
}

const alert = {
  periods: ["daily" as const],
  accountingMode: "demo-memory-non-durable" as const,
  thresholdPercent: 80,
  snapshot: {
    daily: { period: "2026-08-15", requests: 20, requestLimit: 25, tokens: 1, tokenLimit: 100 },
    monthly: { period: "2026-08", requests: 20, requestLimit: 250, tokens: 1, tokenLimit: 1000 },
  },
};

afterEach(() => {
  logState.rows.length = 0;
  databaseMock.getDatabase.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("password reset emails are logged", () => {
  it("records an accepted reset with no token, link or pixel in the stored copy", async () => {
    fakeIssueDatabase();
    const sent: EmailMessage[] = [];
    const status = await issuePasswordReset({
      email: "eleanor@example.org",
      locale: "en",
      configuration,
      send: async (message) => {
        sent.push(message);
      },
    });
    expect(status).toBe("issued");
    expect(sent).toHaveLength(1);

    const token = tokenFrom(sent[0]);
    const link = `${ORIGIN}/reset-password?lang=en#token=${token}`;
    expect(sent[0].text).toContain(link);
    expect(sent[0].html).toMatch(PIXEL_URL);
    const pixelToken = PIXEL_URL.exec(sent[0].html as string)?.[1] as string;

    expect(rows()).toHaveLength(1);
    const [row] = rows();
    expect(row).toMatchObject({
      emailType: "password_reset",
      status: "sent",
      transport: "smtp",
      failureReason: null,
      recipientEmail: "eleanor@example.org",
      recipientUserId: TARGET_USER,
      locale: "en",
      subject: sent[0].subject,
      trackingTokenHash: hashTrackingToken(pixelToken),
    });
    expect(row.textBody.length).toBeGreaterThan(50);
    expect(row.htmlBody).toContain("<");
    expectClean(row, [token, link, pixelToken]);
  });

  it("records a delivery failure and still revokes the token", async () => {
    fakeIssueDatabase();
    const sent: EmailMessage[] = [];
    const status = await issuePasswordReset({
      email: "eleanor@example.org",
      locale: "es",
      configuration,
      send: async (message) => {
        sent.push(message);
        throw new EmailDeliveryError();
      },
    });
    expect(status).toBe("delivery-failed");
    const token = tokenFrom(sent[0]);

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      emailType: "password_reset",
      status: "failed",
      failureReason: "delivery failed",
      locale: "es",
      trackingTokenHash: null,
    });
    expectClean(rows()[0], [token, `${ORIGIN}/reset-password?lang=es#token=${token}`]);
  });
});

describe("invitation emails are logged", () => {
  it("records who invited whom without either locale's one-time link", async () => {
    fakeIssueDatabase();
    const sent: EmailMessage[] = [];
    const status = await issueInvitation({
      actor: admin,
      userId: TARGET_USER,
      configuration,
      send: async (message) => {
        sent.push(message);
      },
    });
    expect(status).toBe("issued");
    expect(sent).toHaveLength(1);

    const token = tokenFrom(sent[0]);
    const links = ["en", "es"].map((locale) => `${ORIGIN}/reset-password?lang=${locale}&invited=1#token=${token}`);
    expect(sent[0].text).toContain(links[0]);
    expect(sent[0].html).toContain(escapeHtml(links[0]));
    const pixelToken = PIXEL_URL.exec(sent[0].html as string)?.[1] as string;

    expect(rows()).toHaveLength(1);
    const [row] = rows();
    expect(row).toMatchObject({
      emailType: "invitation",
      status: "sent",
      recipientEmail: "eleanor@example.org",
      recipientName: "Eleanor Gossen",
      recipientUserId: TARGET_USER,
      actorUserId: admin.userId,
      locale: "en",
      trackingTokenHash: hashTrackingToken(pixelToken),
    });
    expect(row.textBody).toContain("Eleanor Gossen");
    expectClean(row, [token, ...links, pixelToken]);
    expect(row.textBody).not.toContain("invited=1#token=");
  });

  it("records a failed invitation delivery", async () => {
    fakeIssueDatabase();
    const status = await issueInvitation({
      actor: admin,
      userId: TARGET_USER,
      configuration,
      send: async () => {
        throw new Error("451 4.3.0 try later; apikey=hunter2");
      },
    });
    expect(status).toBe("delivery-failed");
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ emailType: "invitation", status: "failed", failureReason: "delivery failed" });
    expect(JSON.stringify(rows()[0])).not.toContain("hunter2");
  });

  it("still answers issued when the bookkeeping after an accepted send fails", async () => {
    // Transaction 1 issues the token; transaction 2 records the delivery.
    fakeIssueDatabase({ rejectTransactionsAfter: 1 });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const sent: EmailMessage[] = [];
    const status = await issueInvitation({
      actor: admin,
      userId: TARGET_USER,
      configuration,
      send: async (message) => {
        sent.push(message);
      },
    });
    // The mail server has the message, so neither the caller nor the log may
    // be told it failed: a thrown error here would be recorded as one.
    expect(status).toBe("issued");
    expect(sent).toHaveLength(1);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ emailType: "invitation", status: "sent", failureReason: null });
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("hunter2");
  });

  it("places the pixel before the closing body tag whatever the name holds", async () => {
    // "İ" lower-cases to two code units; the insertion point must come from
    // the HTML as sent, not from a lower-cased copy of it.
    fakeIssueDatabase({ displayName: "İlhan Öztürk" });
    const sent: EmailMessage[] = [];
    const status = await issueInvitation({
      actor: admin,
      userId: TARGET_USER,
      configuration,
      send: async (message) => {
        sent.push(message);
      },
    });
    expect(status).toBe("issued");
    const html = sent[0].html as string;
    expect(html).toContain("İlhan Öztürk");
    const pixel = html.search(/<img[^>]*api\/email\/open\//);
    // Found on the string as sent: lower-casing it first would shift this index.
    const close = [...html.matchAll(/<\/body\s*>/gi)].at(-1)?.index ?? -1;
    expect(pixel).toBeGreaterThan(-1);
    expect(pixel).toBeLessThan(close);
    expect(html.slice(pixel, close)).toMatch(/^<img[^>]*>\s*$/);
    expect(html.slice(close)).toMatch(/^<\/body>\s*<\/html>\s*$/i);

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ status: "sent", recipientName: "İlhan Öztürk" });
    expect(rows()[0].htmlBody).toContain("İlhan Öztürk");
    expect(rows()[0].htmlBody).not.toContain(TRACKING_PIXEL_PATH);
  });
});

describe("communications are logged per recipient", () => {
  it("writes one tracked row per recipient linked to the communication", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://archive.example");
    fakeSendDatabase();
    const sent: EmailMessage[] = [];
    const outcome = await sendCommunication({
      actor: admin,
      communication: letter,
      send: async (message) => {
        sent.push(message);
      },
    });
    expect(outcome).toMatchObject({ status: "sent", sentCount: 2, failedCount: 0 });
    expect(sent).toHaveLength(2);
    for (const message of sent) {
      expect(message.html).toMatch(/https:\/\/archive\.example\/api\/email\/open\/[A-Za-z0-9_-]{32}/);
    }

    expect(rows()).toHaveLength(2);
    const byRecipient = Object.fromEntries(rows().map((row) => [row.recipientUserId, row]));
    expect(byRecipient[RECIPIENT_A]).toMatchObject({
      emailType: "communication",
      status: "sent",
      communicationId: "communication-1",
      recipientEmail: "a@example.org",
      recipientName: "Person A",
      actorUserId: admin.userId,
      replyTo: "admin@archive.local",
      locale: "en",
      subject: "Committee update",
    });
    expect(byRecipient[RECIPIENT_B]).toMatchObject({
      status: "sent",
      communicationId: "communication-1",
      recipientEmail: "b@example.org",
    });
    for (const row of rows()) {
      expect(row.trackingTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.htmlBody).toContain("Committee update");
      expect(row.htmlBody).not.toContain(TRACKING_PIXEL_PATH);
      expect(row.textBody).toContain("The archive grew this week.");
    }
    expect(rows()[0].trackingTokenHash).not.toBe(rows()[1].trackingTokenHash);
  });

  it("records a partial failure recipient by recipient", async () => {
    fakeSendDatabase();
    const outcome = await sendCommunication({
      actor: admin,
      communication: letter,
      send: async (message) => {
        if (message.to === "b@example.org") throw new EmailDeliveryError();
      },
    });
    expect(outcome).toMatchObject({ sentCount: 1, failedCount: 1 });
    const statuses = Object.fromEntries(rows().map((row) => [row.recipientEmail, [row.status, row.failureReason]]));
    expect(statuses).toEqual({
      "a@example.org": ["sent", null],
      "b@example.org": ["failed", "delivery failed"],
    });
    // No NEXT_PUBLIC_SITE_URL: nothing is tracked, and nothing breaks.
    for (const row of rows()) expect(row.trackingTokenHash).toBeNull();
  });

  it("records an unconfigured transport with only the variable name", async () => {
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("SMTP_USER", "vots-smtp-secret@voicesoftheshoah.org");
    vi.stubEnv("SMTP_PASSWORD", "hunter2");
    fakeSendDatabase();
    const outcome = await sendCommunication({ actor: admin, communication: letter });
    expect(outcome).toEqual({ status: "unconfigured", sentCount: 0, failedCount: 0 });

    expect(rows()).toHaveLength(1);
    const [row] = rows();
    expect(row).toMatchObject({
      emailType: "communication",
      status: "failed",
      recipientEmail: null,
      recipientUserId: null,
      communicationId: null,
      actorUserId: admin.userId,
      subject: "Committee update",
      metadata: { intendedRecipients: 2 },
      trackingTokenHash: null,
    });
    expect(row.failureReason).toMatch(/^configuration: SMTP_[A-Z_]+$/);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("vots-smtp-secret");
  });
});

describe("AI usage alerts are logged", () => {
  const secret = "re_secret_that_must_not_leak";

  it("records an accepted Resend delivery with the HTTP status only", async () => {
    const request = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const adapter = new ResendUsageAlertAdapter(secret, "Archive Alerts <alerts@example.org>", "support@clicksmith.net", request);
    await adapter.sendHighUsageAlert(alert);

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      emailType: "ai_usage_alert",
      transport: "resend",
      status: "sent",
      failureReason: null,
      recipientEmail: "support@clicksmith.net",
      actorUserId: null,
      locale: null,
      htmlBody: null,
      trackingTokenHash: null,
      metadata: { httpStatus: 200 },
    });
    expect(rows()[0].textBody.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows()[0])).not.toContain(secret);
  });

  it("records a refused delivery without the provider's response body", async () => {
    const request = vi.fn().mockResolvedValue(new Response(`provider echoed ${secret}`, { status: 500 }));
    const adapter = new ResendUsageAlertAdapter(secret, "Archive Alerts <alerts@example.org>", "support@clicksmith.net", request);
    await expect(adapter.sendHighUsageAlert(alert)).rejects.toBeInstanceOf(UsageAlertDeliveryError);

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ status: "failed", failureReason: "delivery failed", metadata: { httpStatus: 500 } });
    const serialized = JSON.stringify(rows()[0]);
    expect(serialized).not.toContain("provider echoed");
    expect(serialized).not.toContain(secret);
  });

  it("records a network failure with no status at all", async () => {
    const request = vi.fn().mockRejectedValue(new Error(`ECONNRESET while sending Bearer ${secret}`));
    const adapter = new ResendUsageAlertAdapter(secret, "Archive Alerts <alerts@example.org>", "support@clicksmith.net", request);
    await expect(adapter.sendHighUsageAlert(alert)).rejects.toBeInstanceOf(UsageAlertDeliveryError);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ status: "failed", failureReason: "delivery failed", metadata: null });
    expect(JSON.stringify(rows()[0])).not.toContain(secret);
  });
});

describe("every sender in the tree goes through the log", () => {
  function sourceFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((entry) => {
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry) ? [full] : [];
    });
  }

  it("has no transport call site outside the four logged senders", () => {
    const root = path.join(process.cwd(), "src");
    const callers = sourceFiles(root)
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return (
          /(?<!function )\bcreate(Pooled)?SmtpEmailSender\(/.test(source) ||
          source.includes("api.resend.com")
        );
      })
      .map((file) => path.relative(process.cwd(), file))
      .sort();
    expect(callers).toEqual([
      "src/lib/ai/usage-alert.ts",
      "src/lib/auth/invitations.ts",
      "src/lib/auth/password-reset.ts",
      "src/lib/communications/communications.ts",
    ]);
    for (const file of callers) {
      expect(readFileSync(path.join(process.cwd(), file), "utf8"), file).toContain('from "@/lib/email/log"');
    }
    // The SMTP usage-alert path wraps the sender where it is created, so a
    // future caller of getUsageAlertAdapter() is logged by default.
    expect(readFileSync(path.join(root, "lib/ai/usage-alert.ts"), "utf8")).toMatch(
      /withEmailLog\(\s*createSmtpEmailSender\(/,
    );
  });
});
