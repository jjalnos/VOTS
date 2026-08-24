import { NextResponse } from "next/server";
import { z } from "zod";
import {
  InvitationAuthorizationError,
  setUserActive,
} from "@/lib/auth/invitations";
import { getActorFromRequest } from "@/lib/auth/server-session";
import { can } from "@/lib/auth/policy";
import { hasTrustedOrigin } from "@/lib/http/origin";
import { readBoundedJson } from "@/lib/http/request";
import { configuredDataAdapter } from "@/lib/repository";

const BODY_LIMIT = 2 * 1024;
const patchSchema = z.object({ active: z.boolean() }).strict();
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
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
  const body = await readBoundedJson(request, BODY_LIMIT);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const outcome = await setUserActive({ actor, userId: id, active: parsed.data.active });
    if (outcome === "not-found") {
      return NextResponse.json({ error: "Unknown account." }, { status: 404 });
    }
    if (outcome === "refused") {
      return NextResponse.json(
        {
          error:
            "An administrator cannot deactivate their own account or the last active administrator.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvitationAuthorizationError) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    return NextResponse.json({ error: "The account could not be updated." }, { status: 500 });
  }
}
