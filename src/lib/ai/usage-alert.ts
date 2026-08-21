import type {
  ExternalUsageStoreMode,
  UsageSnapshot,
} from "@/lib/ai/usage-ledger";
import {
  createSmtpEmailSender,
  type EmailSender,
} from "@/lib/email/smtp";

export const REQUIRED_USAGE_ALERT_RECIPIENT = "support@clicksmith.net";

export interface HighUsageAlert {
  periods: Array<"daily" | "monthly">;
  snapshot: UsageSnapshot;
  accountingMode: ExternalUsageStoreMode;
  thresholdPercent: number;
}

export interface UsageAlertAdapter {
  readonly name: "resend" | "smtp";
  sendHighUsageAlert(alert: HighUsageAlert): Promise<void>;
}

export class UsageAlertConfigurationError extends Error {}
export class UsageAlertDeliveryError extends Error {}

function usageAlertMessage(alert: HighUsageAlert): {
  subject: string;
  text: string;
} {
  const periods = alert.periods.join(" and ");
  return {
    subject: `HMMSA external AI usage alert — ${periods}`,
    text: [
      `External research usage reached at least ${alert.thresholdPercent}% of a configured limit.`,
      `Accounting adapter: ${alert.accountingMode}.`,
      `Daily: ${alert.snapshot.daily.requests}/${alert.snapshot.daily.requestLimit} requests; ${alert.snapshot.daily.tokens}/${alert.snapshot.daily.tokenLimit} tokens.`,
      `Monthly: ${alert.snapshot.monthly.requests}/${alert.snapshot.monthly.requestLimit} requests; ${alert.snapshot.monthly.tokens}/${alert.snapshot.monthly.tokenLimit} tokens.`,
      "No research query, survivor record, archive content, API key, or actor identity is included in this alert.",
    ].join("\n"),
  };
}

export class ResendUsageAlertAdapter implements UsageAlertAdapter {
  readonly name = "resend" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly recipient = REQUIRED_USAGE_ALERT_RECIPIENT,
    private readonly request: typeof fetch = fetch,
  ) {}

  async sendHighUsageAlert(alert: HighUsageAlert): Promise<void> {
    if (this.recipient.toLocaleLowerCase("en") !== REQUIRED_USAGE_ALERT_RECIPIENT) {
      throw new UsageAlertConfigurationError("The usage-alert recipient is not approved.");
    }
    const message = usageAlertMessage(alert);
    let response: Response;
    try {
      response = await this.request("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [this.recipient],
          subject: message.subject,
          text: message.text,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new UsageAlertDeliveryError("The usage alert could not be delivered.");
    }
    if (!response.ok) {
      // Do not include provider bodies or request headers: either could echo a
      // credential or operational detail into application logs/responses.
      throw new UsageAlertDeliveryError("The usage alert could not be delivered.");
    }
  }
}

export class SmtpUsageAlertAdapter implements UsageAlertAdapter {
  readonly name = "smtp" as const;

  constructor(
    private readonly send: EmailSender,
    private readonly recipient = REQUIRED_USAGE_ALERT_RECIPIENT,
  ) {}

  async sendHighUsageAlert(alert: HighUsageAlert): Promise<void> {
    if (this.recipient.toLocaleLowerCase("en") !== REQUIRED_USAGE_ALERT_RECIPIENT) {
      throw new UsageAlertConfigurationError("The usage-alert recipient is not approved.");
    }
    const message = usageAlertMessage(alert);
    try {
      await this.send({
        to: this.recipient,
        subject: message.subject,
        text: message.text,
      });
    } catch {
      throw new UsageAlertDeliveryError("The usage alert could not be delivered.");
    }
  }
}

export function getUsageAlertAdapter(): UsageAlertAdapter {
  const provider = process.env.EXTERNAL_AI_USAGE_ALERT_PROVIDER;
  const recipient =
    process.env.EXTERNAL_AI_USAGE_ALERT_TO || REQUIRED_USAGE_ALERT_RECIPIENT;
  if (recipient.toLocaleLowerCase("en") !== REQUIRED_USAGE_ALERT_RECIPIENT) {
    throw new UsageAlertConfigurationError("The usage-alert provider is incomplete.");
  }

  if (provider === "smtp") {
    return new SmtpUsageAlertAdapter(createSmtpEmailSender(), recipient);
  }
  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EXTERNAL_AI_USAGE_ALERT_FROM;
    if (!apiKey || !from) {
      throw new UsageAlertConfigurationError("The usage-alert provider is incomplete.");
    }
    return new ResendUsageAlertAdapter(apiKey, from, recipient);
  }
  throw new UsageAlertConfigurationError("A usage-alert provider is required.");
}
