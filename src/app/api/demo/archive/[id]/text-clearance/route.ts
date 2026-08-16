import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/policy";
import { getActorFromRequest } from "@/lib/auth/server-session";
import { getDemoArchiveStore } from "@/lib/demo-archive/store";
import { hasTrustedOrigin } from "@/lib/http/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_024;
const ACKNOWLEDGEMENT = "RUN_LIMITED_TEXT_SAFETY_REVIEW";
const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  Vary: "Cookie, Origin",
};

const requestSchema = z.object({
  confirmed: z.literal(true),
  acknowledgement: z.literal(ACKNOWLEDGEMENT),
}).strict();

async function boundedJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLocaleLowerCase("en").startsWith("application/json")) {
    throw new TypeError("content-type");
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new RangeError("oversize");
  if (!request.body) throw new SyntaxError("missing");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RangeError("oversize");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-site text clearance requests are not accepted." },
      { status: 403, headers: RESPONSE_HEADERS },
    );
  }
  const actor = await getActorFromRequest(request);
  if (!actor || !can(actor, "review_content")) {
    return NextResponse.json(
      { error: actor ? "Curator MFA and review access are required." : "Archive sign-in is required." },
      { status: actor ? 403 : 401, headers: RESPONSE_HEADERS },
    );
  }
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json(
      { error: "Private archive item not found." },
      { status: 404, headers: RESPONSE_HEADERS },
    );
  }

  let body: unknown;
  try {
    body = await boundedJson(request);
  } catch (error) {
    const status = error instanceof RangeError ? 413 : error instanceof TypeError ? 415 : 400;
    return NextResponse.json(
      { error: status === 413 ? "The review request is too large." : "Explicit text safety review confirmation is required." },
      { status, headers: RESPONSE_HEADERS },
    );
  }
  if (!requestSchema.safeParse(body).success) {
    return NextResponse.json(
      { error: "Explicit text safety review confirmation is required." },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  try {
    const store = await getDemoArchiveStore();
    const result = await store.reviewLimitedText({
      workspaceId: actor.userId,
      recordId: id,
      reviewerUserId: actor.userId,
      reviewedAt: new Date(),
    });
    if (!result.ok) {
      const response = result.reason === "not-found"
        ? { status: 404, error: "Private archive item not found." }
        : result.reason === "ineligible-format"
          ? {
              status: 409,
              error: "Only bounded, validated UTF-8 .txt and .md originals can use this limited review. CSV, PDF, office, image, audio, and video files remain quarantined for the production scanner.",
            }
          : result.reason === "blocked"
            ? { status: 409, error: "This original is blocked and cannot be cleared here." }
            : {
                status: 422,
                error: "The original did not pass the limited UTF-8 text checks and remains quarantined.",
              };
      return NextResponse.json(
        { error: response.error },
        { status: response.status, headers: RESPONSE_HEADERS },
      );
    }
    return NextResponse.json(
      {
        record: {
          id: result.record.id,
          scanStatus: result.record.scanStatus,
          previewUrl: result.record.previewUrl,
        },
        clearance: {
          status: result.status,
          kind: "limited-utf8-text-safety-review",
          antivirusScanPerformed: false,
          productionScannerStillRequiredForOtherFormats: true,
        },
      },
      { headers: RESPONSE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      { error: "The encrypted private archive database is not available." },
      { status: 503, headers: RESPONSE_HEADERS },
    );
  }
}
