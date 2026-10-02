import { NextResponse } from "next/server";
import { can, type Actor } from "@/lib/auth/policy";
import { getActorFromRequest } from "@/lib/auth/server-session";
import { localeFrom } from "@/lib/i18n";
import { serializeCsv } from "@/lib/survivor-registry/csv-writer";
import {
  buildRegistryExportTable,
  isRegistryExportFormat,
  REGISTRY_EXPORT_CONTENT_TYPES,
  registryExportFilename,
} from "@/lib/survivor-registry/export";
import { recordRegistryExport } from "@/lib/survivor-registry/export-audit";
import {
  filterAndPageRegistry,
  getSurvivorRegistryStore,
  visibleRegistryPeople,
  type SurvivorRegistryStore,
} from "@/lib/survivor-registry/store";
import type { RegistryPerson } from "@/lib/survivor-registry/types";
import { parseRegistryListInput } from "@/lib/survivor-registry/validation";
import { writeWorkbook } from "@/lib/survivor-registry/xlsx-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Origin",
};

type RegistryAuthorization =
  | { error: string; status: 401 | 403 }
  | { actor: Actor };

async function authorizedReader(request: Request): Promise<RegistryAuthorization> {
  const actor = await getActorFromRequest(request);
  if (!actor) return { error: "Authentication required.", status: 401 };
  if (!can(actor, "view_survivor_registry")) {
    return { error: "Registry access is required.", status: 403 };
  }
  return { actor };
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

function unavailable() {
  return errorResponse("The survivor registry database is not available.", 503);
}

/**
 * Downloads the registry as CSV or XLSX. The file holds what the signed-in
 * person can see on /curator/survivors with the same search and filters, on
 * every page of results rather than only the visible one.
 */
export async function GET(request: Request) {
  const authorization = await authorizedReader(request);
  if ("error" in authorization) {
    return errorResponse(authorization.error, authorization.status);
  }
  const { actor } = authorization;

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (!isRegistryExportFormat(format)) {
    return errorResponse('Choose a download format: "csv" or "xlsx".', 400);
  }
  const locale = localeFrom(url.searchParams.get("lang"));
  const input = parseRegistryListInput(url);

  // Read-only accounts see the shape of the record, never contact details or
  // life dates: their file has none of those columns at all, and their search
  // runs on the redacted records so it cannot probe what the file leaves out.
  const includeContact = can(actor, "create_record");

  let store: SurvivorRegistryStore;
  let visible: RegistryPerson[];
  let people: RegistryPerson[];
  try {
    store = await getSurvivorRegistryStore();
    visible = await visibleRegistryPeople(store, includeContact);
    // The page's own filter and sort, asked for a single page large enough to
    // hold every match.
    people = filterAndPageRegistry(visible, {
      ...input,
      page: 1,
      pageSize: Math.max(1, visible.length),
    }).items;
  } catch {
    return unavailable();
  }

  const table = buildRegistryExportTable(people, { locale, includeContact });
  const body: Uint8Array<ArrayBuffer> =
    format === "csv"
      ? new TextEncoder().encode(serializeCsv(table.rows))
      : writeWorkbook({ sheetName: table.sheetName, rows: table.rows });

  // The family filter is free text from the request. Only a family that
  // exists in the registry is worth recording; anything else is noted as
  // unknown rather than copied into the audit trail.
  const knownFamily =
    input.family === "all" || visible.some((person) => person.familyKey === input.family);

  try {
    await recordRegistryExport(actor, store.mode, {
      format,
      rowCount: people.length,
      redacted: !includeContact,
      generation: input.generation,
      family: knownFamily ? input.family : "unknown",
      status: input.status,
      hasQuery: input.query.length > 0,
    });
  } catch {
    // No audit record, no file.
    return errorResponse("The download could not be recorded, so no file was produced.", 503);
  }

  return new NextResponse(body, {
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": REGISTRY_EXPORT_CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${registryExportFilename(format)}"`,
      "Content-Length": String(body.byteLength),
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Without this Next.js answers HEAD by running GET, which would build the
 * whole file and record a download that never happened. A download is GET.
 */
export function HEAD() {
  return new Response(null, {
    status: 405,
    headers: { ...NO_STORE_HEADERS, Allow: "GET" },
  });
}
