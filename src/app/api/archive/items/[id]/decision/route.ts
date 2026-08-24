import { z } from "zod";
import { can } from "@/lib/auth/policy";
import { getActorFromRequest } from "@/lib/auth/server-session";
import { hasTrustedOrigin } from "@/lib/http/origin";
import { archiveRepositoryIsWritable, getArchiveRepository } from "@/lib/repository";
import {
  RepositoryAuthorizationError,
  RepositoryValidationError,
} from "@/lib/repository/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_SHAPE = /^[0-9a-f-]{36}$/i;
const MAX_BODY_BYTES = 4_000;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Origin",
} as const;

/**
 * A rejection must say why — the rationale is the record a family or a future
 * curator reads to understand a decision. Approval may stand on its own.
 */
const decisionSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    rationale: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .refine(
    (value) => value.decision !== "reject" || Boolean(value.rationale?.length),
    { message: "A returned upload needs a reason.", path: ["rationale"] },
  );

function failure(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasTrustedOrigin(request)) return failure("Untrusted request origin.", 403);

  const actor = await getActorFromRequest(request);
  if (!actor) return failure("Authentication required.", 401);
  if (!can(actor, "review_content")) {
    return failure("A curator with review access is required.", 403);
  }
  if (!archiveRepositoryIsWritable()) {
    return failure("This deployment cannot record review decisions.", 503);
  }

  const { id } = await context.params;
  if (!UUID_SHAPE.test(id)) return failure("That upload was not found.", 404);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return failure("That decision is too long.", 413);
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return failure("Send a JSON decision.", 400);
  }

  const parsed = decisionSchema.safeParse(payload);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "That decision was not understood.", 400);
  }

  try {
    const item = await getArchiveRepository().recordReviewDecision(actor, {
      itemId: id,
      decision: parsed.data.decision,
      rationale: parsed.data.rationale?.trim() || "Approved in review.",
    });
    return Response.json({ item }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof RepositoryAuthorizationError) {
      return failure("A curator with review access is required.", 403);
    }
    if (error instanceof RepositoryValidationError) {
      return failure(error.message, 404);
    }
    return failure("The decision could not be recorded.", 503);
  }
}
