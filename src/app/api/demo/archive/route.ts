import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { can } from "@/lib/auth/policy";
import { getActorFromRequest } from "@/lib/auth/server-session";
import {
  archiveUploadRequestFingerprint,
  checksumSha256,
} from "@/lib/demo-archive/checksum";
import { checkDemoArchiveUploadLimit } from "@/lib/demo-archive/rate-limit";
import { getDemoArchiveStore } from "@/lib/demo-archive/store";
import type {
  DemoArchiveItemType,
  DemoArchiveRecord,
  DemoArchiveStatus,
  DemoArchiveStoredRecord,
} from "@/lib/demo-archive/types";
import {
  DEMO_ARCHIVE_GLOBAL_QUOTA_BYTES,
  DEMO_ARCHIVE_MAX_RECORDS,
  DEMO_ARCHIVE_MAX_REQUEST_BYTES,
  DEMO_ARCHIVE_WORKSPACE_QUOTA_BYTES,
  parseDemoArchiveMetadata,
  validateDemoArchiveFile,
} from "@/lib/demo-archive/validation";
import { hasTrustedOrigin } from "@/lib/http/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Origin",
};

const LIMITATIONS = [
  "This authenticated demo stores private originals and metadata in the connected PostgreSQL database; file bytes are encrypted with AES-256-GCM before they are committed.",
  "Every original begins private, needs review, and enters quarantine. A curator may separately invoke the bounded UTF-8 text safety review for validated .txt and .md originals only; it is not antivirus and never clears CSV, PDF, office, image, audio, or video files. Those formats still require a separately governed production malware scanner.",
  "After clearance, validated plain-text records can support Robin’s internal archive assistant directly from the encrypted original, without a plaintext database copy. PDFs and office files await text extraction; audio and video await transcription; photographs await OCR or a curator description.",
  "The bounded demo accepts one file per request and is not yet a production museum accession or digital-preservation system.",
];

function cleanFilename(value: string): string {
  return path.basename(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 240);
}

function publicRecord(record: DemoArchiveStoredRecord): DemoArchiveRecord {
  const { workspaceId, extractedText, previewable, checksumSha256, ...safe } = record;
  void workspaceId;
  void extractedText;
  void previewable;
  void checksumSha256;
  return safe;
}

function parsePositiveInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function parseListRequest(url: URL) {
  const rawType = url.searchParams.get("type") ?? "all";
  const rawStatus = url.searchParams.get("status") ?? "all";
  const itemTypes = new Set<DemoArchiveItemType>([
    "document",
    "photograph",
    "audio",
    "video",
  ]);
  const statuses = new Set<DemoArchiveStatus>([
    "needs-review",
    "processing",
    "ready",
    "approved-private",
  ]);
  return {
    query: (url.searchParams.get("q") ?? "").trim().slice(0, 180),
    survivor: (url.searchParams.get("survivor") ?? "all").trim().slice(0, 160),
    itemType: itemTypes.has(rawType as DemoArchiveItemType)
      ? (rawType as DemoArchiveItemType)
      : ("all" as const),
    status: statuses.has(rawStatus as DemoArchiveStatus)
      ? (rawStatus as DemoArchiveStatus)
      : ("all" as const),
    page: parsePositiveInteger(url.searchParams.get("page"), 1, 10_000),
    pageSize: parsePositiveInteger(url.searchParams.get("pageSize"), 8, 24),
  };
}

async function limitedRequestBytes(
  request: Request,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > DEMO_ARCHIVE_MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function boundedFormData(request: Request): Promise<FormData | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > DEMO_ARCHIVE_MAX_REQUEST_BYTES) {
    return null;
  }
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLocaleLowerCase("en").startsWith("multipart/form-data")) {
    return null;
  }
  const bytes = await limitedRequestBytes(request);
  if (!bytes) return null;
  const clone = new Request("http://archive.local/upload", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: bytes,
  });
  return clone.formData().catch(() => null);
}

async function authorizedCurator(request: Request) {
  const actor = await getActorFromRequest(request);
  if (!actor) return { error: "Authentication required.", status: 401 } as const;
  if (!can(actor, "view_archive_workspace")) {
    return { error: "Curator archive access is required.", status: 403 } as const;
  }
  return { actor } as const;
}

function unavailable() {
  return NextResponse.json(
    { error: "The encrypted private archive database is not available." },
    { status: 503, headers: NO_STORE_HEADERS },
  );
}

export async function GET(request: Request) {
  const authorization = await authorizedCurator(request);
  if ("error" in authorization) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const store = await getDemoArchiveStore();
    const result = await store.list(
      authorization.actor.userId,
      parseListRequest(new URL(request.url)),
    );
    const usage = await store.usage(authorization.actor.userId);
    return NextResponse.json(
      {
        ...result,
        items: result.items.map(publicRecord),
        limitations: LIMITATIONS,
        workspace: {
          kind: "authenticated-encrypted-demo",
          displayName: authorization.actor.displayName,
          records: usage.records,
          bytes: usage.bytes,
          quotaBytes: DEMO_ARCHIVE_WORKSPACE_QUOTA_BYTES,
          storage: store.mode,
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-site archive uploads are not accepted." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }
  const authorization = await authorizedCurator(request);
  if ("error" in authorization) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status, headers: NO_STORE_HEADERS },
    );
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return NextResponse.json(
      { error: "A UUID Idempotency-Key is required for every private original." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  let store: Awaited<ReturnType<typeof getDemoArchiveStore>>;
  try {
    store = await getDemoArchiveStore();
    const rateLimit = await checkDemoArchiveUploadLimit(
      request,
      authorization.actor.userId,
      store,
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "This curator workspace has reached its hourly upload limit." },
        {
          status: 429,
          headers: { ...NO_STORE_HEADERS, "Retry-After": String(rateLimit.retryAfter) },
        },
      );
    }
  } catch {
    return unavailable();
  }

  const formData = await boundedFormData(request);
  if (!formData) {
    return NextResponse.json(
      { error: "Use multipart form data within the live demo request limit." },
      { status: 413, headers: NO_STORE_HEADERS },
    );
  }
  const metadata = parseDemoArchiveMetadata(formData.get("metadata"));
  if (!metadata.ok) {
    return NextResponse.json(
      { error: metadata.error },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (files.length !== 1) {
    return NextResponse.json(
      { error: "Upload exactly one original per request; the intake queue saves them in order." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const file = files[0]!;
  const fileName = cleanFilename(file.name);
  const raw = new Uint8Array(await file.arrayBuffer());
  const content = new Uint8Array(new ArrayBuffer(raw.byteLength));
  content.set(raw);
  const validation = validateDemoArchiveFile(file, content, metadata.value.itemType);
  if (!validation.ok) {
    return NextResponse.json(
      { accepted: [], rejected: [{ fileName, reason: validation.error }] },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const contentChecksum = checksumSha256(content);
  const semanticMetadata = { ...metadata.value };
  delete semanticMetadata.clientId;
  const requestFingerprint = archiveUploadRequestFingerprint({
    checksumSha256: contentChecksum,
    originalFilename: fileName,
    metadata: semanticMetadata,
  });
  const record: DemoArchiveStoredRecord = {
    id,
    workspaceId: authorization.actor.userId,
    title: metadata.value.title,
    survivorName: metadata.value.survivorName,
    itemType: validation.value.itemType,
    mediaType: validation.value.itemType,
    mimeType: validation.value.mimeType,
    originalFilename: fileName,
    byteSize: content.byteLength,
    fileSize: content.byteLength,
    checksumSha256: contentChecksum,
    sourceContributor: metadata.value.sourceContributor,
    originalLanguage: metadata.value.originalLanguage,
    consentRights: metadata.value.consentRights,
    rightsStatement: metadata.value.rightsStatement,
    historicalDate: metadata.value.historicalDate,
    notes: metadata.value.notes,
    tags: metadata.value.tags,
    visibility: "private",
    status: "needs-review",
    reviewStatus: "needs-review",
    extractionStatus: validation.value.extractionStatus,
    scanStatus: validation.value.initialScanStatus,
    extractedText: undefined,
    previewable: validation.value.previewable,
    createdAt,
    uploadedAt: createdAt,
  };

  try {
    const inserted = await store.insert({
      record,
      content,
      idempotencyKey,
      requestFingerprint,
      workspaceQuotaBytes: DEMO_ARCHIVE_WORKSPACE_QUOTA_BYTES,
      globalQuotaBytes: DEMO_ARCHIVE_GLOBAL_QUOTA_BYTES,
      maximumRecords: DEMO_ARCHIVE_MAX_RECORDS,
    });
    if (!inserted.ok && inserted.reason === "idempotent-replay") {
      return NextResponse.json(
        {
          accepted: [{ clientId: metadata.value.clientId, record: publicRecord(inserted.record) }],
          rejected: [],
          replayed: true,
          limitations: LIMITATIONS,
        },
        { status: 200, headers: NO_STORE_HEADERS },
      );
    }
    if (!inserted.ok) {
      const reason =
        inserted.reason === "idempotency-conflict"
          ? "This retry key was already used for a different file or metadata. Remove and re-add the queue item before retrying."
          : inserted.reason === "duplicate"
          ? "This exact file is already in the private archive."
          : "The encrypted demo storage quota would be exceeded. Contact support before adding more.";
      return NextResponse.json(
        { accepted: [], rejected: [{ fileName, reason }] },
        {
          status:
            inserted.reason === "duplicate" || inserted.reason === "idempotency-conflict"
              ? 409
              : 413,
          headers: NO_STORE_HEADERS,
        },
      );
    }
    const usage = await store.usage(authorization.actor.userId);
    return NextResponse.json(
      {
        accepted: [{ clientId: metadata.value.clientId, record: publicRecord(record) }],
        rejected: [],
        limitations: LIMITATIONS,
        workspace: {
          kind: "authenticated-encrypted-demo",
          displayName: authorization.actor.displayName,
          records: usage.records,
          bytes: usage.bytes,
          quotaBytes: DEMO_ARCHIVE_WORKSPACE_QUOTA_BYTES,
          storage: store.mode,
        },
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch {
    return unavailable();
  }
}
