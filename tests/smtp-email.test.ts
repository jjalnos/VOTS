import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSmtpTransport,
  EmailConfigurationError,
  EmailDeliveryError,
  sendEmail,
  smtpConfigurationFromEnvironment,
  type EmailTransport,
} from "@/lib/email/smtp";
import {
  getUsageAlertAdapter,
  SmtpUsageAlertAdapter,
} from "@/lib/ai/usage-alert";

const smtpEnvironment = {
  SMTP_HOST: "smtp.elasticemail.com",
  SMTP_PORT: "2525",
  SMTP_SECURE: "false",
  SMTP_REQUIRE_TLS: "true",
  SMTP_USER: "vots-smtp-4f9a2c1d@voicesoftheshoah.org",
  SMTP_PASSWORD: "smtp-secret",
  SMTP_FROM: "no-reply@voicesoftheshoah.org",
};

const highUsageAlert = {
  periods: ["daily"] as Array<"daily" | "monthly">,
  accountingMode: "postgres" as const,
  thresholdPercent: 80,
  snapshot: {
    daily: {
      period: "2026-08-21",
      requests: 20,
      requestLimit: 25,
      tokens: 1_000,
      tokenLimit: 60_000,
    },
    monthly: {
      period: "2026-08",
      requests: 20,
      requestLimit: 250,
      tokens: 1_000,
      tokenLimit: 600_000,
    },
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Elastic Email SMTP configuration", () => {
  it("parses the documented STARTTLS settings", () => {
    expect(smtpConfigurationFromEnvironment(smtpEnvironment)).toEqual({
      host: "smtp.elasticemail.com",
      port: 2525,
      secure: false,
      requireTLS: true,
      user: "vots-smtp-4f9a2c1d@voicesoftheshoah.org",
      password: "smtp-secret",
      from: "no-reply@voicesoftheshoah.org",
    });
  });

  it.each([
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_REQUIRE_TLS",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
  ])("fails closed when %s is missing", (missing) => {
    const environment = { ...smtpEnvironment, [missing]: "" };
    expect(() => smtpConfigurationFromEnvironment(environment)).toThrow(
      EmailConfigurationError,
    );
  });

  it("rejects malformed settings and SMTP without enforced TLS", () => {
    expect(() => smtpConfigurationFromEnvironment({
      ...smtpEnvironment,
      SMTP_PORT: "2525.5",
    })).toThrow(EmailConfigurationError);
    expect(() => smtpConfigurationFromEnvironment({
      ...smtpEnvironment,
      SMTP_SECURE: "FALSE",
    })).toThrow(EmailConfigurationError);
    expect(() => smtpConfigurationFromEnvironment({
      ...smtpEnvironment,
      SMTP_REQUIRE_TLS: "false",
    })).toThrow(EmailConfigurationError);
    expect(() => smtpConfigurationFromEnvironment({
      ...smtpEnvironment,
      SMTP_HOST: "attacker.example",
    })).toThrow(EmailConfigurationError);
    expect(() => smtpConfigurationFromEnvironment({
      ...smtpEnvironment,
      SMTP_PORT: "587",
    })).toThrow(EmailConfigurationError);
    expect(() => smtpConfigurationFromEnvironment({
      ...smtpEnvironment,
      SMTP_SECURE: "true",
    })).toThrow(EmailConfigurationError);
    expect(() => smtpConfigurationFromEnvironment({
      ...smtpEnvironment,
      SMTP_FROM: "other@voicesoftheshoah.org",
    })).toThrow(EmailConfigurationError);
    expect(() => smtpConfigurationFromEnvironment({
      ...smtpEnvironment,
      SMTP_USER: "shared-account-api-key",
    })).toThrow(EmailConfigurationError);
    expect(() => smtpConfigurationFromEnvironment({
      ...smtpEnvironment,
      SMTP_USER: "other-credential@voicesoftheshoah.org",
    })).toThrow(EmailConfigurationError);
    expect(smtpConfigurationFromEnvironment({
      ...smtpEnvironment,
      SMTP_USER: "vots-smtp-4f9a2c1d@voicesoftheshoah.org",
    }).user).toBe("vots-smtp-4f9a2c1d@voicesoftheshoah.org");
  });

  it("configures bounded timeouts, certificate validation, and no provider logging", () => {
    const transport: EmailTransport = { sendMail: vi.fn() };
    const factory = vi.fn(() => transport);

    expect(createSmtpTransport(
      smtpConfigurationFromEnvironment(smtpEnvironment),
      factory,
    )).toBe(transport);
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.elasticemail.com",
      port: 2525,
      secure: false,
      requireTLS: true,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
      auth: {
        user: "vots-smtp-4f9a2c1d@voicesoftheshoah.org",
        pass: "smtp-secret",
      },
      tls: expect.objectContaining({
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
      }),
    }));
  });
});

describe("minimal email delivery boundary", () => {
  it("sends only the supplied plain-text fields through an injected transport", async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: ["support@clicksmith.net"] });

    await sendEmail({
      to: "support@clicksmith.net",
      subject: "Usage alert",
      text: "Aggregate counters only.",
    }, {
      from: "no-reply@voicesoftheshoah.org",
      transport: { sendMail },
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: "no-reply@voicesoftheshoah.org",
      to: "support@clicksmith.net",
      subject: "Usage alert",
      text: "Aggregate counters only.",
    });
  });

  it("replaces provider exceptions without exposing credentials or response bodies", async () => {
    const secret = "smtp-secret-that-must-not-leak";
    const transport: EmailTransport = {
      sendMail: vi.fn().mockRejectedValue(
        new Error(`provider echoed ${secret} in its response body`),
      ),
    };

    let caught: unknown;
    try {
      await sendEmail({
        to: "support@clicksmith.net",
        subject: "Usage alert",
        text: "Aggregate counters only.",
      }, {
        from: "no-reply@voicesoftheshoah.org",
        transport,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EmailDeliveryError);
    expect(String(caught)).toBe("EmailDeliveryError: The email could not be delivered.");
    expect(String(caught)).not.toContain(secret);
    expect(String(caught)).not.toContain("response body");
  });

  it.each([
    "support@clicksmith.net,attacker@example.com",
    "Friends: support@clicksmith.net;",
    "support@@clicksmith.net",
    "support@clicksmith.net\r\nBcc: attacker@example.com",
  ])("rejects non-single or header-injection recipients: %s", async (to) => {
    const sendMail = vi.fn();

    await expect(sendEmail({
      to,
      subject: "Usage alert",
      text: "Aggregate counters only.",
    }, {
      from: "no-reply@voicesoftheshoah.org",
      transport: { sendMail },
    })).rejects.toThrow(EmailConfigurationError);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("SMTP usage-alert adapter", () => {
  it("selects SMTP only when every required server setting is valid", () => {
    vi.stubEnv("EXTERNAL_AI_USAGE_ALERT_PROVIDER", "smtp");
    vi.stubEnv("EXTERNAL_AI_USAGE_ALERT_TO", "support@clicksmith.net");
    for (const [name, value] of Object.entries(smtpEnvironment)) {
      vi.stubEnv(name, value);
    }

    expect(getUsageAlertAdapter().name).toBe("smtp");

    vi.stubEnv("SMTP_PASSWORD", "");
    expect(() => getUsageAlertAdapter()).toThrow(EmailConfigurationError);
  });

  it("sends aggregate counters to the fixed approved recipient", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const adapter = new SmtpUsageAlertAdapter(send);

    await adapter.sendHighUsageAlert(highUsageAlert);

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: "support@clicksmith.net",
      subject: expect.stringMatching(/external AI usage alert/i),
      text: expect.stringContaining("Daily: 20/25 requests"),
    }));
    expect(JSON.stringify(send.mock.calls)).not.toMatch(
      /private archive evidence|smtp-secret/i,
    );
  });
});
