import { after, NextResponse } from "next/server";
import { z } from "zod";
import {
  hasExactPasswordResetOrigin,
  issuePasswordReset,
  PasswordResetConfigurationError,
  passwordResetRequestConfiguration,
  type PasswordResetRequestConfiguration,
} from "@/lib/auth/password-reset";
import { consumePasswordResetRequestAttempt } from "@/lib/auth/password-reset-rate-limit";
import { EmailConfigurationError } from "@/lib/email/smtp";
import { readBoundedJson } from "@/lib/http/request";

const PASSWORD_RESET_BODY_LIMIT = 4 * 1024;
const requestSchema = z
  .object({
    email: z.string().email().max(320),
    locale: z.enum(["en", "es"]),
  })
  .strict();

const responseHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

interface PasswordResetRequestDependencies {
  configuration(): PasswordResetRequestConfiguration;
  consumeAttempt(
    request: Request,
    email: string,
  ): Promise<{ allowed: boolean; retryAfter: number }>;
  schedule(callback: () => Promise<void>): void;
  issue(input: Parameters<typeof issuePasswordReset>[0]): Promise<unknown>;
}

const productionDependencies: PasswordResetRequestDependencies = {
  configuration: passwordResetRequestConfiguration,
  consumeAttempt: consumePasswordResetRequestAttempt,
  schedule: (callback) => after(callback),
  issue: issuePasswordReset,
};

/**
 * Records which environment variable rejected the deployment. The response
 * stays byte-identical for every cause so it cannot be used to probe
 * configuration; only the variable NAME reaches the log, never its value.
 */
function logConfigurationFailure(error: unknown): void {
  const variable =
    error instanceof PasswordResetConfigurationError ||
    error instanceof EmailConfigurationError
      ? error.variable
      : "UNKNOWN";
  console.error(
    `Password reset is unavailable; configuration check failed for ${variable}.`,
  );
}

function unavailableResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Password reset is temporarily unavailable." },
    { status: 503, headers: responseHeaders },
  );
}

/** Exported for focused request-boundary tests; POST uses production dependencies. */
export async function handlePasswordResetRequest(
  request: Request,
  dependencies: PasswordResetRequestDependencies = productionDependencies,
): Promise<NextResponse> {
  let configuration: PasswordResetRequestConfiguration;
  try {
    // SMTP, the database provider, the token key, and the canonical public URL
    // are checked before throttling and before any deferred identity lookup.
    configuration = dependencies.configuration();
  } catch (error) {
    logConfigurationFailure(error);
    return unavailableResponse();
  }
  if (!hasExactPasswordResetOrigin(request, configuration.siteOrigin)) {
    return NextResponse.json(
      { ok: false, error: "Cross-site password-reset requests are not accepted." },
      { status: 403, headers: responseHeaders },
    );
  }

  const body = await readBoundedJson(request, PASSWORD_RESET_BODY_LIMIT, {
    requireJsonContentType: true,
  });
  if (!body.ok) {
    return NextResponse.json(
      { ok: false, error: "Invalid password-reset request." },
      {
        status:
          body.reason === "too-large"
            ? 413
            : body.reason === "unsupported-media-type"
              ? 415
              : 400,
        headers: responseHeaders,
      },
    );
  }
  const parsed = requestSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid password-reset request." },
      { status: 400, headers: responseHeaders },
    );
  }

  let limit: { allowed: boolean; retryAfter: number };
  try {
    limit = await dependencies.consumeAttempt(request, parsed.data.email);
  } catch {
    return unavailableResponse();
  }

  if (limit.allowed) {
    dependencies.schedule(async () => {
      try {
        await dependencies.issue({
          email: parsed.data.email,
          locale: parsed.data.locale,
          configuration,
        });
      } catch {
        // Deferred database and SMTP failures are deliberately private. The
        // issuance service revokes and audits a token after delivery failure.
      }
    });
  }

  // This exact response covers eligible, ineligible, and throttled identities.
  return NextResponse.json(
    { ok: true },
    { status: 202, headers: responseHeaders },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  return handlePasswordResetRequest(request);
}
