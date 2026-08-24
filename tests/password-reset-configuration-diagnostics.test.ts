import { describe, expect, it } from "vitest";
import {
  PasswordResetConfigurationError,
  canonicalPasswordResetSiteOrigin,
  passwordResetConfirmationConfiguration,
  passwordResetRequestConfiguration,
  passwordResetTokenKey,
} from "@/lib/auth/password-reset";
import {
  EmailConfigurationError,
  smtpConfigurationFromEnvironment,
} from "@/lib/email/smtp";

// A deployment that fails one of these checks serves an identical 503 for every
// cause. The variable name on the error is the only signal an operator gets, so
// each check must keep naming the exact variable it rejected.

const VALID_TOKEN_KEY = "q9Vg3Yp8Kx2Lm7Nd4Rf6Ts1Wc5Zh0BjUaEiOoP";

const validEnvironment = {
  AUTH_PROVIDER: "database",
  DATABASE_URL: "postgres://archive@localhost:5432/archive",
  NEXT_PUBLIC_SITE_URL: "https://voicesoftheshoah.org",
  NODE_ENV: "production",
  PASSWORD_RESET_TOKEN_KEY: VALID_TOKEN_KEY,
  SMTP_HOST: "smtp.elasticemail.com",
  SMTP_PORT: "2525",
  SMTP_SECURE: "false",
  SMTP_REQUIRE_TLS: "true",
  SMTP_USER: "vots-smtp-vgxcdd0e0w@voicesoftheshoah.org",
  SMTP_PASSWORD: "credential-under-test",
  SMTP_FROM: "no-reply@voicesoftheshoah.org",
} as const;

function environmentWithout(
  key: keyof typeof validEnvironment,
): Record<string, string | undefined> {
  return { ...validEnvironment, [key]: undefined };
}

function rejectedVariable(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (
      error instanceof PasswordResetConfigurationError ||
      error instanceof EmailConfigurationError
    ) {
      return error.variable;
    }
    throw error;
  }
  throw new Error("The configuration check accepted an invalid environment.");
}

describe("password-reset configuration names the variable it rejected", () => {
  it("accepts a complete environment", () => {
    expect(() => passwordResetRequestConfiguration(validEnvironment)).not.toThrow();
  });

  it.each([
    ["AUTH_PROVIDER", environmentWithout("AUTH_PROVIDER")],
    ["DATABASE_URL", environmentWithout("DATABASE_URL")],
    ["NEXT_PUBLIC_SITE_URL", environmentWithout("NEXT_PUBLIC_SITE_URL")],
    ["PASSWORD_RESET_TOKEN_KEY", environmentWithout("PASSWORD_RESET_TOKEN_KEY")],
  ])("names %s when it is absent", (variable, environment) => {
    expect(rejectedVariable(() => passwordResetConfirmationConfiguration(environment))).toBe(
      variable,
    );
  });

  it("names NEXT_PUBLIC_SITE_URL for a non-canonical origin", () => {
    for (const raw of [
      "https://voicesoftheshoah.org/archive",
      "https://voicesoftheshoah.org?lang=en",
      " https://voicesoftheshoah.org",
      "http://voicesoftheshoah.org",
    ]) {
      expect(
        rejectedVariable(() =>
          canonicalPasswordResetSiteOrigin({ ...validEnvironment, NEXT_PUBLIC_SITE_URL: raw }),
        ),
      ).toBe("NEXT_PUBLIC_SITE_URL");
    }
  });

  it("names PASSWORD_RESET_TOKEN_KEY for a key a paste can produce", () => {
    for (const key of [
      `${VALID_TOKEN_KEY}\n`, // a trailing newline from a copy/paste
      "short",
      "a".repeat(48),
      "replace-me-with-a-real-32-byte-secret-value",
      validEnvironment.SMTP_PASSWORD,
    ]) {
      expect(
        rejectedVariable(() =>
          passwordResetTokenKey({
            ...validEnvironment,
            PASSWORD_RESET_TOKEN_KEY: key,
            AUTH_SESSION_SECRET: validEnvironment.SMTP_PASSWORD,
          }),
        ),
      ).toBe("PASSWORD_RESET_TOKEN_KEY");
    }
  });
});

describe("SMTP configuration names the variable it rejected", () => {
  it.each([
    ["SMTP_HOST", { SMTP_HOST: "smtp.example.com" }],
    ["SMTP_PORT", { SMTP_PORT: "587" }],
    ["SMTP_SECURE", { SMTP_SECURE: "true" }],
    ["SMTP_REQUIRE_TLS", { SMTP_REQUIRE_TLS: "false" }],
    ["SMTP_FROM", { SMTP_FROM: "hello@voicesoftheshoah.org" }],
    ["SMTP_PASSWORD", { SMTP_PASSWORD: undefined }],
  ])("names %s", (variable, override) => {
    expect(
      rejectedVariable(() =>
        smtpConfigurationFromEnvironment({ ...validEnvironment, ...override }),
      ),
    ).toBe(variable);
  });

  // docs/CLOUDWAYS.md describes a hyphenated house style for this suffix that
  // the pinned pattern rejects, so this is the mistake most likely to be made
  // against an Elastic Email password that is only ever shown once.
  it.each([
    "vots-smtp-vgxc-dd0e@voicesoftheshoah.org",
    "vots-smtp-vgxc.dd0e@voicesoftheshoah.org",
    "vots-smtp-vgxc_dd0e@voicesoftheshoah.org",
    "vots-smtp-short1@voicesoftheshoah.org",
    "vots-smtp-vgxcdd0e0w@example.com",
    "no-reply@voicesoftheshoah.org",
  ])("names SMTP_USER for the rejected username %s", (user) => {
    expect(
      rejectedVariable(() =>
        smtpConfigurationFromEnvironment({ ...validEnvironment, SMTP_USER: user }),
      ),
    ).toBe("SMTP_USER");
  });

  it("accepts the pinned username in any case", () => {
    expect(
      smtpConfigurationFromEnvironment({
        ...validEnvironment,
        SMTP_USER: "VOTS-SMTP-VGXCDD0E0W@VoicesOfTheShoah.org",
      }).user,
    ).toBe("vots-smtp-vgxcdd0e0w@voicesoftheshoah.org");
  });
});
