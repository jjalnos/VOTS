import { NextResponse } from "next/server";
import { can, type Actor } from "@/lib/auth/policy";
import { getActorFromRequest } from "@/lib/auth/server-session";
import { hasTrustedOrigin } from "@/lib/http/origin";
import {
  getSurvivorRegistryStore,
  SurvivorRegistryUnavailableError,
} from "@/lib/survivor-registry/store";
import {
  diffWorkbookImport,
  mergeImportedPerson,
  previewWorkbookImport,
  WorkbookFormatError,
} from "@/lib/survivor-registry/workbook-import";
import { XLSX_MAX_BYTES } from "@/lib/survivor-registry/xlsx-reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Origin",
};

const MAX_REQUEST_BYTES = XLSX_MAX_BYTES + 1024 * 1024;
const PREVIEW_SAMPLE = 12;

type CuratorAuthorization = { error: string; status: 401 | 403 } | { actor: Actor };

async function authorizedCurator(request: Request): Promise<CuratorAuthorization> {
  const actor = await getActorFromRequest(request);
  if (!actor) return { error: "Authentication required.", status: 401 };
  if (!can(actor, "view_archive_workspace") || !can(actor, "create_record")) {
    return { error: "Curator registry access is required.", status: 403 };
  }
  return { actor };
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

async function boundedBytes(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
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
  return bytes;
}

async function workbookFromRequest(
  request: Request,
): Promise<{ bytes: Uint8Array; filename: string; confirmed: boolean } | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLocaleLowerCase("en").startsWith("multipart/form-data")) return null;
  const bytes = await boundedBytes(request);
  if (!bytes) return null;
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  const clone = new Request("http://registry.local/import", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: body.buffer as ArrayBuffer,
  });
  const form = await clone.formData().catch(() => null);
  if (!form) return null;
  const file = form.get("workbook");
  if (!(file instanceof File) || file.size === 0) return null;
  const buffer = new Uint8Array(await file.arrayBuffer());
  return {
    bytes: buffer,
    filename: file.name.slice(0, 200),
    confirmed: String(form.get("confirm") ?? "") === "APPLY_WORKBOOK_IMPORT",
  };
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return errorResponse("Cross-site registry imports are not accepted.", 403);
  }
  const authorization = await authorizedCurator(request);
  if ("error" in authorization) {
    return errorResponse(authorization.error, authorization.status);
  }

  const upload = await workbookFromRequest(request);
  if (!upload) {
    return errorResponse(
      "Attach the .xlsx workbook as the “workbook” field. The importer accepts files up to 12 MB.",
      400,
    );
  }

  let preview;
  try {
    preview = previewWorkbookImport(upload.bytes);
  } catch (error) {
    if (error instanceof WorkbookFormatError) return errorResponse(error.message, 422);
    return errorResponse("This workbook could not be read.", 422);
  }

  try {
    const store = await getSurvivorRegistryStore();
    const existing = await store.all();
    const changes = diffWorkbookImport(preview.rows, existing);
    const summary = {
      new: changes.filter((change) => change.kind === "new").length,
      updated: changes.filter((change) => change.kind === "updated").length,
      unchanged: changes.filter((change) => change.kind === "unchanged").length,
      absent: existing.filter(
        (person) => !preview.rows.some((row) => row.person.id === person.id),
      ).length,
    };
    const samples = {
      new: changes.filter((change) => change.kind === "new").slice(0, PREVIEW_SAMPLE),
      updated: changes.filter((change) => change.kind === "updated").slice(0, PREVIEW_SAMPLE),
    };

    if (!upload.confirmed) {
      return NextResponse.json(
        {
          stage: "preview",
          filename: upload.filename,
          sheetName: preview.sheetName,
          sheets: preview.sheets,
          totals: preview.totals,
          warnings: preview.warnings,
          summary,
          samples,
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    const importedAt = new Date().toISOString();
    const byId = new Map(existing.map((person) => [person.id, person]));
    const merged = preview.rows.map((row) =>
      mergeImportedPerson(row, byId.get(row.person.id), importedAt),
    );
    const result = await store.applyImport(merged);

    return NextResponse.json(
      {
        stage: "applied",
        filename: upload.filename,
        sheetName: preview.sheetName,
        totals: preview.totals,
        result,
        storage: store.mode,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof SurvivorRegistryUnavailableError) {
      return errorResponse("The survivor registry database is not available.", 503);
    }
    return errorResponse("The workbook import could not be completed.", 503);
  }
}
