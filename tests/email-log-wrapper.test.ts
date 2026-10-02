import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeHtml } from "@/lib/email/branded";
import {
  hashTrackingToken,
  recordEmailAttempt,
  TRACKING_PIXEL_PATH,
  withEmailLog,
  type EmailLogRecorder,
  type EmailLogRow,
} from "@/lib/email/log";
import { EmailConfigurationError, EmailDeliveryError, type EmailMessage } from "@/lib/email/smtp";

const ORIGIN = "https://archive.example";
const TOKEN = "xK9_v2-Lm7Nd4Rf6Ts1Wc5Zh0BjUaEiOoPq3Yp8Kx2L";
const LINK = `${ORIGIN}/reset-password?lang=en#token=${TOKEN}`;
const PIXEL_URL = new RegExp(`${ORIGIN}${TRACKING_PIXEL_PATH}([A-Za-z0-9_-]{32})`);

const message: EmailMessage = {
  to: "eleanor@example.org",
  subject: "Reset your password",
  text: `Open ${LINK} within an hour.`,
  html: `<html><body><p><a href="${escapeHtml(LINK)}">Reset</a></p></body></html>`,
  replyTo: "archive@example.org",
};

function fakeRecorder(options: { fail?: boolean } = {}) {
  const rows: EmailLogRow[] = [];
  const recorder: EmailLogRecorder = {
    async record(row) {
      if (options.fail) throw new Error("connection refused; password=hunter2");
      rows.push(row);
    },
    async markOpened() {},
  };
  return { rows, recorder };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withEmailLog on success", () => {
  it("records the accepted message with the pixel in the OUTGOING html only", async () => {
    const { rows, recorder } = fakeRecorder();
    const outgoing: EmailMessage[] = [];
    const now = new Date("2026-10-02T12:00:00Z");
    const logged = withEmailLog(
      async (sent) => {
        outgoing.push(sent);
      },
      {
        emailType: "password_reset",
        locale: "en",
        recipientUserId: "00000000-0000-4000-8000-0000000000ff",
        recipientName: "Eleanor Gossen",
        secrets: [TOKEN, LINK],
        trackingOrigin: ORIGIN,
        metadata: { attempt: 1 },
        now: () => now,
      },
      recorder,
    );

    await expect(logged(message)).resolves.toBeUndefined();

    expect(outgoing).toHaveLength(1);
    const [sent] = outgoing;
    expect(sent.to).toBe(message.to);
    expect(sent.subject).toBe(message.subject);
    expect(sent.text).toBe(message.text);
    expect(sent.replyTo).toBe(message.replyTo);
    expect(sent.html).toMatch(PIXEL_URL);
    expect(sent.html).toContain(LINK.replace(/&/g, "&amp;"));
    const pixelToken = PIXEL_URL.exec(sent.html as string)?.[1] as string;

    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.status).toBe("sent");
    expect(row.failureReason).toBeNull();
    expect(row.emailType).toBe("password_reset");
    expect(row.transport).toBe("smtp");
    expect(row.recipientEmail).toBe("eleanor@example.org");
    expect(row.recipientName).toBe("Eleanor Gossen");
    expect(row.recipientUserId).toBe("00000000-0000-4000-8000-0000000000ff");
    expect(row.locale).toBe("en");
    expect(row.subject).toBe("Reset your password");
    expect(row.replyTo).toBe("archive@example.org");
    expect(row.metadata).toEqual({ attempt: 1 });
    expect(row.createdAt).toBe(now);
    expect(row.trackingTokenHash).toBe(hashTrackingToken(pixelToken));

    // Stored bodies: no pixel, no token, no link in any form.
    expect(row.htmlBody).not.toContain(TRACKING_PIXEL_PATH);
    expect(row.htmlBody).not.toContain("<img");
    expect(row.htmlBody).not.toContain(pixelToken);
    expect(row.htmlBody).not.toContain(TOKEN);
    expect(row.htmlBody).not.toContain(LINK);
    expect(row.htmlBody).not.toContain(escapeHtml(LINK));
    expect(row.textBody).not.toContain(TOKEN);
    expect(row.textBody).not.toContain(LINK);
    expect(row.textBody).toContain("within an hour");
    expect(JSON.stringify(row)).not.toContain(TOKEN);
    expect(JSON.stringify(row)).not.toContain(pixelToken);
  });

  it("gives every message its own token", async () => {
    const { rows, recorder } = fakeRecorder();
    const logged = withEmailLog(async () => {}, { emailType: "communication", trackingOrigin: ORIGIN }, recorder);
    await logged(message);
    await logged(message);
    expect(rows[0].trackingTokenHash).not.toBe(rows[1].trackingTokenHash);
  });

  it("does not track text-only messages or messages without a tracking origin", async () => {
    const { rows, recorder } = fakeRecorder();
    const outgoing: EmailMessage[] = [];
    const send = async (sent: EmailMessage) => {
      outgoing.push(sent);
    };
    const textOnly: EmailMessage = { to: "a@example.org", subject: "Alert", text: "Plain text" };

    await withEmailLog(send, { emailType: "ai_usage_alert", trackingOrigin: ORIGIN }, recorder)(textOnly);
    await withEmailLog(send, { emailType: "communication" }, recorder)(message);

    expect(outgoing[0]).toBe(textOnly);
    expect(rows[0].trackingTokenHash).toBeNull();
    expect(rows[0].htmlBody).toBeNull();
    expect(outgoing[1]).toBe(message);
    expect(outgoing[1].html).not.toContain(TRACKING_PIXEL_PATH);
    expect(rows[1].trackingTokenHash).toBeNull();
    expect(rows[1].htmlBody).toContain("<a href=");
  });

  it("keeps the outgoing html inside the transport's 200,000-character bound", async () => {
    const { recorder } = fakeRecorder();
    let length = 0;
    const big: EmailMessage = { ...message, html: `<body>${"x".repeat(190_000)}</body>` };
    await withEmailLog(
      async (sent) => {
        length = sent.html?.length ?? 0;
      },
      { emailType: "communication", trackingOrigin: ORIGIN },
      recorder,
    )(big);
    expect(length).toBeGreaterThan(190_000);
    expect(length).toBeLessThanOrEqual(200_000);
  });

  it("clamps oversized columns and drops an unknown locale instead of failing", async () => {
    const { rows, recorder } = fakeRecorder();
    await withEmailLog(
      async () => {},
      { emailType: "communication", locale: "fr" as unknown as "en" },
      recorder,
    )({
      to: `${"a".repeat(400)}@example.org`,
      subject: "s".repeat(500),
      text: "t",
    });
    expect(rows[0].subject).toHaveLength(200);
    expect(rows[0].recipientEmail).toHaveLength(320);
    expect(rows[0].locale).toBeNull();
  });
});

describe("withEmailLog on failure", () => {
  it("records a delivery failure and rethrows the very same error object", async () => {
    const { rows, recorder } = fakeRecorder();
    const failure = new EmailDeliveryError();
    const logged = withEmailLog(
      async () => {
        throw failure;
      },
      { emailType: "invitation", secrets: [TOKEN, LINK], trackingOrigin: ORIGIN },
      recorder,
    );

    await expect(logged(message)).rejects.toBe(failure);

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].failureReason).toBe("delivery failed");
    expect(rows[0].trackingTokenHash).toBeNull();
    expect(rows[0].htmlBody).not.toContain(TRACKING_PIXEL_PATH);
    expect(rows[0].htmlBody).not.toContain(TOKEN);
    expect(rows[0].textBody).not.toContain(TOKEN);
  });

  it("records only the variable NAME of a configuration failure", async () => {
    const { rows, recorder } = fakeRecorder();
    const reasons: string[] = [];
    for (const error of [
      new EmailConfigurationError("SMTP_USER=secret@example.org is not approved", "SMTP_USER"),
      new EmailConfigurationError(),
    ]) {
      const logged = withEmailLog(
        async () => {
          throw error;
        },
        { emailType: "ai_usage_alert" },
        recorder,
      );
      await expect(logged(message)).rejects.toBe(error);
      reasons.push(rows[rows.length - 1].failureReason as string);
    }
    expect(reasons).toEqual(["configuration: SMTP_USER", "invalid message"]);
    expect(JSON.stringify(rows)).not.toContain("secret@example.org");
  });

  it("maps provider errors to the fixed vocabulary without copying their text", async () => {
    const { rows, recorder } = fakeRecorder();
    const providerError = new Error("535 5.7.8 Authentication failed for apikey hunter2");
    const logged = withEmailLog(
      async () => {
        throw providerError;
      },
      { emailType: "communication" },
      recorder,
    );
    await expect(logged(message)).rejects.toBe(providerError);
    expect(rows[0].failureReason).toBe("delivery failed");
    expect(JSON.stringify(rows[0])).not.toContain("hunter2");
  });
});

describe("withEmailLog when the log itself fails", () => {
  it("still resolves after a successful send and reports a fixed string", async () => {
    const { recorder } = fakeRecorder({ fail: true });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn(async () => {});

    await expect(
      withEmailLog(send, { emailType: "communication", trackingOrigin: ORIGIN }, recorder)(message),
    ).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("Email log write failed for communication (sent).");
    const printed = JSON.stringify(error.mock.calls);
    expect(printed).not.toContain("hunter2");
    expect(printed).not.toContain(TOKEN);
    expect(printed).not.toContain("Reset your password");
  });

  it("still rethrows the sender's own error after a failed send", async () => {
    const { recorder } = fakeRecorder({ fail: true });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new EmailDeliveryError();
    await expect(
      withEmailLog(
        async () => {
          throw failure;
        },
        { emailType: "invitation" },
        recorder,
      )(message),
    ).rejects.toBe(failure);
    expect(error).toHaveBeenCalledWith("Email log write failed for invitation (failed).");
  });
});

describe("recordEmailAttempt", () => {
  const attempt = {
    emailType: "invitation" as const,
    status: "failed" as const,
    failureReason: "configuration: SMTP_HOST" as const,
    recipientEmail: null,
    recipientName: null,
    recipientUserId: null,
    communicationId: null,
    actorUserId: "00000000-0000-4000-8000-00000000000a",
    locale: null,
    subject: "Invitation",
  };

  it("writes a transport-less row with safe defaults and sweeps token fragments", async () => {
    const { rows, recorder } = fakeRecorder();
    const now = new Date("2026-10-02T12:00:00Z");
    await recordEmailAttempt(
      { ...attempt, textBody: `see #token=${"B".repeat(40)}`, now: () => now },
      recorder,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ...attempt,
      transport: "smtp",
      replyTo: null,
      htmlBody: null,
      metadata: null,
      trackingTokenHash: null,
      createdAt: now,
    });
    expect(rows[0].textBody).toBe("see #token=[removed]");
  });

  it("never throws, even when the recorder does", async () => {
    const { recorder } = fakeRecorder({ fail: true });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordEmailAttempt({ ...attempt, transport: "resend" }, recorder)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("Email log write failed for invitation (failed).");
  });
});
