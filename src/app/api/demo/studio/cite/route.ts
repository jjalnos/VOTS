import { NextResponse } from "next/server";
import { survivorStudioCiteRequestSchema } from "@/lib/survivor-studio/contracts";
import { buildSurvivorStudioCitation } from "@/lib/survivor-studio/engine";
import {
  prepareSurvivorStudioPost,
  SURVIVOR_STUDIO_NO_STORE_HEADERS,
} from "@/lib/survivor-studio/http";

export async function POST(request: Request) {
  const prepared = await prepareSurvivorStudioPost(request, "cite");
  if (!prepared.ok) return prepared.response;

  const parsed = survivorStudioCiteRequestSchema.safeParse(prepared.body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Choose an HMMSA survivor, ask a 2–700 character question, and select Chicago, MLA, or APA.",
      },
      {
        status: 400,
        headers: {
          ...SURVIVOR_STUDIO_NO_STORE_HEADERS,
          "X-RateLimit-Remaining": String(prepared.remaining),
        },
      },
    );
  }

  try {
    return NextResponse.json(buildSurvivorStudioCitation(parsed.data), {
      headers: {
        ...SURVIVOR_STUDIO_NO_STORE_HEADERS,
        "X-RateLimit-Remaining": String(prepared.remaining),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "That source is not approved for the selected HMMSA profile." },
      {
        status: 400,
        headers: {
          ...SURVIVOR_STUDIO_NO_STORE_HEADERS,
          "X-RateLimit-Remaining": String(prepared.remaining),
        },
      },
    );
  }
}
