import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateConfiguredUser,
  configuredAuthProvider,
} from "@/lib/auth/provider";
import { consumeLoginAttempt } from "@/lib/auth/login-rate-limit";
import { SESSION_COOKIE, sessionSecret } from "@/lib/auth/server-session";
import { signSession } from "@/lib/auth/session-token";
import { hasTrustedOrigin } from "@/lib/http/origin";
import { readBoundedJson } from "@/lib/http/request";
import { staffMfaRequired } from "@/lib/auth/mfa";

const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  mfaCode: z.string().max(12).optional(),
});

const LOGIN_BODY_LIMIT = 4 * 1024;

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Cross-site sign-in requests are not accepted." }, { status: 403 });
  }
  const body = await readBoundedJson(request, LOGIN_BODY_LIMIT);
  if (!body.ok) {
    return NextResponse.json(
      {
        error:
          body.reason === "too-large"
            ? "Sign-in request is too large."
            : "Invalid sign-in request.",
      },
      { status: body.reason === "too-large" ? 413 : 400 },
    );
  }
  const parsed = loginSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400 });
  }
  if (configuredAuthProvider() === "database") {
    try {
      const limit = await consumeLoginAttempt(request, parsed.data.email);
      if (!limit.allowed) {
        return NextResponse.json(
          { error: "Too many sign-in attempts. Wait before trying again." },
          { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
        );
      }
    } catch {
      return NextResponse.json({ error: "The identity provider is not available." }, { status: 503 });
    }
  }
  const authentication = await authenticateConfiguredUser(parsed.data);
  if (authentication.status === "unavailable") {
    return NextResponse.json({ error: "The identity provider is not available." }, { status: 503 });
  }
  if (authentication.status !== "authenticated") {
    return NextResponse.json({ error: "Sign-in failed." }, { status: 401 });
  }
  const actor = authentication.actor;
  const secret = sessionSecret();
  if (!secret) {
    return NextResponse.json({ error: "Production identity provider is not configured." }, { status: 503 });
  }
  const issuedAt = Date.now();
  const isStaff = actor.roles.some((role) => role === "admin" || role === "curator");
  const sessionActor = isStaff && !staffMfaRequired()
    ? { ...actor, mfaVerified: true }
    : actor;
  const token = signSession({ ...sessionActor, issuedAt, expiresAt: issuedAt + 8 * 60 * 60 * 1000 }, secret);
  const destination = actor.roles.includes("curator")
    ? "/demo/robin/archive"
    : actor.roles.includes("admin")
      ? "/admin/access"
      : "/family";
  const response = NextResponse.json({ ok: true, destination });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return response;
}
