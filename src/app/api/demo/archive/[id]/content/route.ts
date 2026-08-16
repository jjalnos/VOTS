import { can } from "@/lib/auth/policy";
import { getActorFromRequest } from "@/lib/auth/server-session";
import { getDemoArchiveStore } from "@/lib/demo-archive/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeContentDisposition(filename: string): string {
  const fallback = filename.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 120) || "archive-file";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function rangeFromHeader(
  value: string | null,
  size: number,
): { start: number; end: number } | undefined {
  if (!value) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return undefined;
  const rawStart = match[1];
  const rawEnd = match[2];
  if (!rawStart && !rawEnd) return undefined;
  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isInteger(suffix) || suffix <= 0) return undefined;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : size - 1;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return undefined;
  }
  return { start, end: Math.min(end, size - 1) };
}

function privateHeaders(): Headers {
  return new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getActorFromRequest(request);
  if (!actor) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401, headers: privateHeaders() },
    );
  }
  if (!can(actor, "view_archive_workspace")) {
    return Response.json(
      { error: "Curator archive access is required." },
      { status: 403, headers: privateHeaders() },
    );
  }
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json(
      { error: "Private archive item not found." },
      { status: 404, headers: privateHeaders() },
    );
  }
  try {
    const store = await getDemoArchiveStore();
    const entry = await store.content(actor.userId, id);
    if (!entry) {
      return Response.json(
        { error: "Private archive item not found." },
        { status: 404, headers: privateHeaders() },
      );
    }
    if (entry.record.scanStatus !== "cleared") {
      return Response.json(
        {
          error:
            entry.record.scanStatus === "blocked"
              ? "This original was blocked by safety review."
              : "This original remains quarantined until its safety review clears.",
          scanStatus: entry.record.scanStatus,
        },
        { status: 423, headers: privateHeaders() },
      );
    }
    const size = entry.content.byteLength;
    const range = rangeFromHeader(request.headers.get("range"), size);
    const headers = privateHeaders();
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Disposition", safeContentDisposition(entry.record.originalFilename));
    headers.set("Content-Type", entry.record.mimeType);
    if (request.headers.has("range") && !range) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    headers.set("Content-Length", String(end - start + 1));
    if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    return new Response(entry.content.slice(start, end + 1), {
      status: range ? 206 : 200,
      headers,
    });
  } catch {
    return Response.json(
      { error: "The encrypted private archive database is not available." },
      { status: 503, headers: privateHeaders() },
    );
  }
}
