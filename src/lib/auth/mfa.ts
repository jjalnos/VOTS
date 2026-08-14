export type MfaVerificationResult = "verified" | "invalid" | "unavailable";

export interface MfaVerificationInput {
  userId: string;
  providerReference: string;
  code: string | undefined;
}

export function staffMfaRequired(): boolean {
  return process.env.STAFF_MFA_REQUIRED === "true";
}

export function mfaWebhookConfiguration(): { url: string; token?: string } | null {
  if (process.env.MFA_PROVIDER !== "webhook") return null;
  const value = process.env.MFA_VERIFY_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { url: url.toString(), token: process.env.MFA_VERIFY_BEARER_TOKEN || undefined };
  } catch {
    return null;
  }
}

export async function verifyStaffMfa(input: MfaVerificationInput): Promise<MfaVerificationResult> {
  const configuration = mfaWebhookConfiguration();
  if (!configuration) return "unavailable";
  if (!input.code || !/^\d{6,12}$/.test(input.code)) return "invalid";
  try {
    const response = await fetch(configuration.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(configuration.token ? { Authorization: `Bearer ${configuration.token}` } : {}),
      },
      body: JSON.stringify({
        userId: input.userId,
        providerReference: input.providerReference,
        code: input.code,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return response.status >= 500 ? "unavailable" : "invalid";
    const body = (await response.json().catch(() => null)) as { verified?: unknown } | null;
    return body?.verified === true ? "verified" : "invalid";
  } catch {
    return "unavailable";
  }
}
