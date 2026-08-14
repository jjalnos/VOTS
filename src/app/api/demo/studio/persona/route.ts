import { NextResponse } from "next/server";
import { survivorStudioPersonaRequestSchema } from "@/lib/survivor-studio/contracts";
import { buildSurvivorStudioPersonaReply } from "@/lib/survivor-studio/engine";
import {
  prepareSurvivorStudioPost,
  SURVIVOR_STUDIO_NO_STORE_HEADERS,
} from "@/lib/survivor-studio/http";

export async function POST(request: Request) {
  const prepared = await prepareSurvivorStudioPost(request, "persona");
  if (!prepared.ok) return prepared.response;

  const parsed = survivorStudioPersonaRequestSchema.safeParse(prepared.body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Choose an HMMSA survivor and send a 2–700 character message with no more than eight history entries.",
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
    return NextResponse.json(buildSurvivorStudioPersonaReply(parsed.data), {
      headers: {
        ...SURVIVOR_STUDIO_NO_STORE_HEADERS,
        "X-RateLimit-Remaining": String(prepared.remaining),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "That survivor profile is not approved for the selected institution." },
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
