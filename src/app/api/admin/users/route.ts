import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createInvitedUser,
  InvitationAuthorizationError,
  InvitationValidationError,
  issueInvitation,
} from "@/lib/auth/invitations";
import { passwordResetRequestConfiguration } from "@/lib/auth/password-reset";
import { getActorFromRequest } from "@/lib/auth/server-session";
import { can } from "@/lib/auth/policy";
import { hasTrustedOrigin } from "@/lib/http/origin";
import { readBoundedJson } from "@/lib/http/request";
import { configuredDataAdapter } from "@/lib/repository";
import { ROLES } from "@/lib/domain/types";

const BODY_LIMIT = 8 * 1024;

const createSchema = z
  .object({
    email: z.string().trim().max(320),
    displayName: z.string().trim().max(180),
    roles: z.array(z.enum(ROLES)).min(1).max(4),
    familyId: z.string().uuid().optional(),
    locale: z.enum(["en", "es"]).default("en"),
  })
  .strict();

export async function POST(request: Request) {
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
  const body = await readBoundedJson(request, BODY_LIMIT);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid request." }, { status: body.reason === "too-large" ? 413 : 400 });
  }
  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invitation request." }, { status: 400 });
  }

  let invited;
  try {
    invited = await createInvitedUser(actor, parsed.data);
  } catch (error) {
    if (error instanceof InvitationValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof InvitationAuthorizationError) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    return NextResponse.json({ error: "The invitation could not be created." }, { status: 500 });
  }

  // From here on the account exists. Whatever happens to the email, the
  // response must say so — a 500 would leave the administrator retrying an
  // invitation that now fails as a duplicate.
  try {
    const configuration = passwordResetRequestConfiguration();
    const invitation = await issueInvitation({
      actor,
      userId: invited.id,
      configuration,
    });
    return NextResponse.json({ user: invited, invitation }, { status: 201 });
  } catch {
    // Covers a missing email configuration and any unexpected issuance
    // failure alike; the page offers "Resend invitation" for exactly this.
    return NextResponse.json({ user: invited, invitation: "unavailable" }, { status: 201 });
  }
}
