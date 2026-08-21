import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE } from "@/lib/auth/server-session";
import {
  confirmPasswordReset,
  hasExactPasswordResetOrigin,
  PASSWORD_RESET_INVALID_MESSAGE,
  passwordResetConfirmationConfiguration,
  passwordResetTokenDigest,
  type PasswordResetConfirmationConfiguration,
} from "@/lib/auth/password-reset";
import { consumePasswordResetConfirmationAttempt } from "@/lib/auth/password-reset-rate-limit";
import { readBoundedJson } from "@/lib/http/request";

const PASSWORD_RESET_CONFIRM_BODY_LIMIT = 4 * 1024;
const confirmationSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    password: z.string().min(16).max(200),
    passwordConfirmation: z.string().min(16).max(200),
    mfaCode: z.string().regex(/^\d{6,12}$/).optional(),
  })
  .strict()
  .refine((value) => value.password === value.passwordConfirmation);

const responseHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

interface PasswordResetConfirmationDependencies {
  configuration(): PasswordResetConfirmationConfiguration;
  consumeAttempt(
    request: Request,
    tokenDigest: string,
  ): Promise<{ allowed: boolean; retryAfter: number }>;
  confirm(
    input: Parameters<typeof confirmPasswordReset>[0],
  ): Promise<"reset" | "invalid" | "unavailable">;
}

const productionDependencies: PasswordResetConfirmationDependencies = {
  configuration: passwordResetConfirmationConfiguration,
  consumeAttempt: consumePasswordResetConfirmationAttempt,
  confirm: confirmPasswordReset,
};

function invalidResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: PASSWORD_RESET_INVALID_MESSAGE },
    { status: 400, headers: responseHeaders },
  );
}

function unavailableResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Password reset is temporarily unavailable." },
    { status: 503, headers: responseHeaders },
  );
}

/** Exported for focused request-boundary tests; POST uses production dependencies. */
export async function handlePasswordResetConfirmation(
  request: Request,
  dependencies: PasswordResetConfirmationDependencies = productionDependencies,
): Promise<NextResponse> {
  let configuration: PasswordResetConfirmationConfiguration;
  try {
    configuration = dependencies.configuration();
  } catch {
    return unavailableResponse();
  }
  if (!hasExactPasswordResetOrigin(request, configuration.siteOrigin)) {
    return NextResponse.json(
      { ok: false, error: "Cross-site password-reset requests are not accepted." },
      { status: 403, headers: responseHeaders },
    );
  }

  const body = await readBoundedJson(request, PASSWORD_RESET_CONFIRM_BODY_LIMIT, {
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
  const parsed = confirmationSchema.safeParse(body.value);
  if (!parsed.success) return invalidResponse();

  const tokenDigest = passwordResetTokenDigest(
    parsed.data.token,
    configuration.tokenKey,
  );
  try {
    const limit = await dependencies.consumeAttempt(request, tokenDigest);
    if (!limit.allowed) return invalidResponse();
  } catch {
    return unavailableResponse();
  }

  const result = await dependencies.confirm({
    ...parsed.data,
    configuration,
  });
  if (result === "unavailable") return unavailableResponse();
  if (result !== "reset") return invalidResponse();

  const response = NextResponse.json(
    { ok: true },
    { status: 200, headers: responseHeaders },
  );
  // Password recovery never authenticates the caller. It also removes any
  // existing browser session; sessionVersion invalidates all sibling clients.
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function POST(request: Request): Promise<NextResponse> {
  return handlePasswordResetConfirmation(request);
}
