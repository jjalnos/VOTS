import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateDevelopmentUser } from "@/lib/auth/dev-auth";
import { SESSION_COOKIE, sessionSecret } from "@/lib/auth/server-session";
import { signSession } from "@/lib/auth/session-token";

const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  mfaCode: z.string().max(12).optional(),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400 });
  }
  const actor = authenticateDevelopmentUser(
    parsed.data.email,
    parsed.data.password,
    parsed.data.mfaCode,
  );
  if (!actor) {
    return NextResponse.json({ error: "Sign-in failed." }, { status: 401 });
  }
  const secret = sessionSecret();
  if (!secret) {
    return NextResponse.json({ error: "Production identity provider is not configured." }, { status: 503 });
  }
  const issuedAt = Date.now();
  const token = signSession({ ...actor, issuedAt, expiresAt: issuedAt + 8 * 60 * 60 * 1000 }, secret);
  const destination = actor.roles.includes("admin")
    ? "/admin/access"
    : actor.roles.includes("curator")
      ? "/curator/archive"
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
