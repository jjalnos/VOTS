import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/policy";
import { getActorFromRequest } from "@/lib/auth/server-session";
import {
  CommunicationAuthorizationError,
  CommunicationValidationError,
  MAX_COMMUNICATION_BODY_LENGTH,
  MAX_COMMUNICATION_RECIPIENTS,
  MAX_COMMUNICATION_SUBJECT_LENGTH,
  sendCommunication,
} from "@/lib/communications/communications";
import { hasTrustedOrigin } from "@/lib/http/origin";
import { readBoundedJson } from "@/lib/http/request";
import { configuredDataAdapter } from "@/lib/repository";

const BODY_LIMIT = 32 * 1024;

const sendSchema = z
  .object({
    subject: z.string().trim().min(1).max(MAX_COMMUNICATION_SUBJECT_LENGTH),
    body: z.string().min(1).max(MAX_COMMUNICATION_BODY_LENGTH),
    locale: z.enum(["en", "es"]).default("en"),
    recipientUserIds: z.array(z.string().uuid()).min(1).max(MAX_COMMUNICATION_RECIPIENTS),
    link: z
      .object({
        label: z.string().trim().min(1).max(80),
        url: z.string().trim().url().max(500),
      })
      .optional(),
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
  if (!can(actor, "send_communications")) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  if (configuredDataAdapter() !== "postgres") {
    return NextResponse.json(
      { error: "Communications require the database adapter." },
      { status: 503 },
    );
  }
  const body = await readBoundedJson(request, BODY_LIMIT);
  if (!body.ok) {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: body.reason === "too-large" ? 413 : 400 },
    );
  }
  const parsed = sendSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  }

  try {
    const outcome = await sendCommunication({ actor, communication: parsed.data });
    if (outcome.status === "unconfigured") {
      return NextResponse.json(
        { error: "Email sending is not configured for this environment yet." },
        { status: 503 },
      );
    }
    return NextResponse.json(outcome, { status: 201 });
  } catch (error) {
    if (error instanceof CommunicationValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CommunicationAuthorizationError) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    return NextResponse.json({ error: "The message could not be sent." }, { status: 500 });
  }
}
