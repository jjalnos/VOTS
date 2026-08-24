import { NextResponse } from "next/server";
import {
  InvitationAuthorizationError,
  issueInvitation,
} from "@/lib/auth/invitations";
import {
  PasswordResetConfigurationError,
  passwordResetRequestConfiguration,
} from "@/lib/auth/password-reset";
import { getActorFromRequest } from "@/lib/auth/server-session";
import { can } from "@/lib/auth/policy";
import { hasTrustedOrigin } from "@/lib/http/origin";
import { configuredDataAdapter } from "@/lib/repository";

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resends the branded first-password invitation to an invited account. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Cross-site requests are not accepted." }, { status: 403 });
  }
  const actor = await getActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!can(actor, "manage_access")) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  if (configuredDataAdapter() !== "postgres") {
    return NextResponse.json(
      { error: "Account management requires the database adapter." },
      { status: 503 },
    );
  }
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Unknown account." }, { status: 404 });
  }

  let configuration;
  try {
    configuration = passwordResetRequestConfiguration();
  } catch (error) {
    if (error instanceof PasswordResetConfigurationError) {
      return NextResponse.json(
        { error: "Invitation email is not configured for this environment." },
        { status: 503 },
      );
    }
    throw error;
  }

  try {
    const invitation = await issueInvitation({ actor, userId: id, configuration });
    if (invitation === "ineligible") {
      return NextResponse.json(
        { error: "This account cannot receive an invitation right now." },
        { status: 409 },
      );
    }
    if (invitation === "already-accepted") {
      return NextResponse.json(
        { error: "This account already has a password. Use the password reset instead." },
        { status: 409 },
      );
    }
    if (invitation === "delivery-failed") {
      return NextResponse.json(
        { error: "The invitation email could not be delivered." },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, invitation });
  } catch (error) {
    if (error instanceof InvitationAuthorizationError) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    return NextResponse.json({ error: "The invitation could not be sent." }, { status: 500 });
  }
}
