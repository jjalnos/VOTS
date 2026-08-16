import type {
  ExternalUsageStoreMode,
  UsageSnapshot,
} from "@/lib/ai/usage-ledger";

export const REQUIRED_USAGE_ALERT_RECIPIENT = "support@clicksmith.net";

export interface HighUsageAlert {
  periods: Array<"daily" | "monthly">;
  snapshot: UsageSnapshot;
  accountingMode: ExternalUsageStoreMode;
  thresholdPercent: number;
}

export interface UsageAlertAdapter {
  readonly name: "resend";
  sendHighUsageAlert(alert: HighUsageAlert): Promise<void>;
}

export class UsageAlertConfigurationError extends Error {}
export class UsageAlertDeliveryError extends Error {}

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
    const periods = alert.periods.join(" and ");
    const response = await this.request("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [this.recipient],
        subject: `HMMSA external AI usage alert — ${periods}`,
        text: [
          `External research usage reached at least ${alert.thresholdPercent}% of a configured limit.`,
          `Accounting adapter: ${alert.accountingMode}.`,
          `Daily: ${alert.snapshot.daily.requests}/${alert.snapshot.daily.requestLimit} requests; ${alert.snapshot.daily.tokens}/${alert.snapshot.daily.tokenLimit} tokens.`,
          `Monthly: ${alert.snapshot.monthly.requests}/${alert.snapshot.monthly.requestLimit} requests; ${alert.snapshot.monthly.tokens}/${alert.snapshot.monthly.tokenLimit} tokens.`,
          "No research query, survivor record, archive content, API key, or actor identity is included in this alert.",
        ].join("\n"),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      // Do not include provider bodies or request headers: either could echo a
      // credential or operational detail into application logs/responses.
      throw new UsageAlertDeliveryError("The usage alert could not be delivered.");
    }
  }
}

export function getUsageAlertAdapter(): UsageAlertAdapter {
  if (process.env.EXTERNAL_AI_USAGE_ALERT_PROVIDER !== "resend") {
    throw new UsageAlertConfigurationError("A usage-alert provider is required.");
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EXTERNAL_AI_USAGE_ALERT_FROM;
  const recipient =
    process.env.EXTERNAL_AI_USAGE_ALERT_TO || REQUIRED_USAGE_ALERT_RECIPIENT;
  if (!apiKey || !from || recipient.toLocaleLowerCase("en") !== REQUIRED_USAGE_ALERT_RECIPIENT) {
    throw new UsageAlertConfigurationError("The usage-alert provider is incomplete.");
  }
  return new ResendUsageAlertAdapter(apiKey, from, recipient);
}
