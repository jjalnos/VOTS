import { NextResponse } from "next/server";
import { z } from "zod";
import { changeDatabaseUserPassword } from "@/lib/auth/change-password";
import { configuredAuthProvider } from "@/lib/auth/provider";
import {
  getActorFromRequest,
  SESSION_COOKIE,
} from "@/lib/auth/server-session";
import { hasTrustedOrigin } from "@/lib/http/origin";
import { readBoundedJson } from "@/lib/http/request";

const PASSWORD_CHANGE_BODY_LIMIT = 4 * 1024;

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(16).max(200),
  })
  .strict();

function clearSession(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-site password-change requests are not accepted." },
      { status: 403 },
    );
  }

  const body = await readBoundedJson(request, PASSWORD_CHANGE_BODY_LIMIT, {
    requireJsonContentType: true,
  });
  if (!body.ok) {
    return NextResponse.json(
      {
        error:
          body.reason === "too-large"
            ? "Password-change request is too large."
            : "Invalid password-change request.",
      },
      { status: body.reason === "too-large" ? 413 : 400 },
    );
  }

  const parsed = passwordChangeSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid password-change request." },
      { status: 400 },
    );
  }

  if (configuredAuthProvider() !== "database") {
    return NextResponse.json(
      { error: "Password change is temporarily unavailable." },
      { status: 503 },
    );
  }

  const actor = await getActorFromRequest(request);
  if (!actor) {
    return clearSession(
      NextResponse.json(
        { error: "Sign in again before changing your password." },
        { status: 401 },
      ),
    );
  }

  const result = await changeDatabaseUserPassword({
    userId: actor.userId,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
  });
  if (result === "unavailable") {
    return NextResponse.json(
      { error: "Password change is temporarily unavailable." },
      { status: 503 },
    );
  }
  if (result === "rejected") {
    return NextResponse.json(
      { error: "Password change was not successful." },
      { status: 400 },
    );
  }

  return clearSession(NextResponse.json({ ok: true, signedOut: true }));
}
