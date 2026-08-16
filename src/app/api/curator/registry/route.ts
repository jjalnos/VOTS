import { NextResponse } from "next/server";
import { can, type Actor } from "@/lib/auth/policy";
import { getActorFromRequest } from "@/lib/auth/server-session";
import { hasTrustedOrigin } from "@/lib/http/origin";
import {
  getSurvivorRegistryStore,
  SurvivorRegistryUnavailableError,
} from "@/lib/survivor-registry/store";
import {
  parseRegistryListInput,
  parseRegistryPersonInput,
} from "@/lib/survivor-registry/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Origin",
};

type CuratorAuthorization =
  | { error: string; status: 401 | 403 }
  | { actor: Actor };

async function authorizedCurator(request: Request): Promise<CuratorAuthorization> {
  const actor = await getActorFromRequest(request);
  if (!actor) return { error: "Authentication required.", status: 401 };
  if (!can(actor, "view_archive_workspace")) {
    return { error: "Curator registry access is required.", status: 403 };
  }
  return { actor };
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

function unavailable() {
  return errorResponse("The survivor registry database is not available.", 503);
}

export async function GET(request: Request) {
  const authorization = await authorizedCurator(request);
  if ("error" in authorization) {
    return errorResponse(authorization.error, authorization.status);
  }
  try {
    const store = await getSurvivorRegistryStore();
    const result = await store.list(parseRegistryListInput(new URL(request.url)));
    return NextResponse.json(
      { ...result, storage: store.mode },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof SurvivorRegistryUnavailableError) return unavailable();
    return unavailable();
  }
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return errorResponse("Cross-site registry changes are not accepted.", 403);
  }
  const authorization = await authorizedCurator(request);
  if ("error" in authorization) {
    return errorResponse(authorization.error, authorization.status);
  }
  if (!can(authorization.actor, "create_record")) {
    return errorResponse("Curator create permission is required.", 403);
  }
  const payload: unknown = await request.json().catch(() => null);
  const parsed = parseRegistryPersonInput(payload);
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  try {
    const store = await getSurvivorRegistryStore();
    const person = await store.create(parsed.input, authorization.actor.userId);
    return NextResponse.json({ person }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof SurvivorRegistryUnavailableError) return unavailable();
    return unavailable();
  }
}

export async function PATCH(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return errorResponse("Cross-site registry changes are not accepted.", 403);
  }
  const authorization = await authorizedCurator(request);
  if ("error" in authorization) {
    return errorResponse(authorization.error, authorization.status);
  }
  if (!can(authorization.actor, "create_record")) {
    return errorResponse("Curator edit permission is required.", 403);
  }
  const payload: unknown = await request.json().catch(() => null);
  if (typeof payload !== "object" || payload === null) {
    return errorResponse("A person update payload is required.", 400);
  }
  const { id, ...rest } = payload as Record<string, unknown>;
  if (typeof id !== "string" || !id.trim() || id.length > 160) {
    return errorResponse("A valid person id is required.", 400);
  }
  const parsed = parseRegistryPersonInput(rest);
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  try {
    const store = await getSurvivorRegistryStore();
    const person = await store.update(id, parsed.input, authorization.actor.userId);
    if (!person) return errorResponse("That person record was not found.", 404);
    return NextResponse.json({ person }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof SurvivorRegistryUnavailableError) return unavailable();
    return unavailable();
  }
}
