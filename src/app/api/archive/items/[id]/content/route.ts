import { can } from "@/lib/auth/policy";
import { getActorFromRequest } from "@/lib/auth/server-session";
import { getArchiveRepository } from "@/lib/repository";
import { RepositoryAuthorizationError } from "@/lib/repository/types";
import { getMediaStorage } from "@/lib/storage/media-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_SHAPE = /^[0-9a-f-]{36}$/i;

function safeContentDisposition(filename: string, inline: boolean): string {
  const fallback = filename.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 120) || "archive-file";
  const mode = inline ? "inline" : "attachment";
  return `${mode}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Originals are private records under review. They are served with the same
 * hardening as the demo archive: never cached, never framed by another origin,
 * never sniffed into an executable type.
 */
function privateHeaders(): Headers {
  return new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    Vary: "Cookie",
  });
}

function failure(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: privateHeaders() });
}

/**
 * Only formats a browser renders safely in a sandboxed frame are shown inline.
 * Everything else downloads, so an uploaded HTML or SVG file can never execute
 * against a reviewer's session.
 */
const INLINE_TYPES = new Set([
  "application/pdf",
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getActorFromRequest(request);
  if (!actor) return failure("Authentication required.", 401);
  if (!can(actor, "view_archive_workspace")) {
    return failure("Curator archive access is required.", 403);
  }
  const { id } = await context.params;
  if (!UUID_SHAPE.test(id)) return failure("That upload was not found.", 404);

  try {
    const detail = await getArchiveRepository().archiveItemDetail(actor, id);
    if (!detail) return failure("That upload was not found.", 404);
    const [fileVersion] = detail.fileVersions;
    if (!fileVersion) return failure("No original is stored for this record.", 404);

    const bytes = await getMediaStorage().readOriginal(fileVersion);
    if (!bytes) return failure("The stored original is no longer available.", 410);

    const mediaType = fileVersion.mediaType || "application/octet-stream";
    const inline = INLINE_TYPES.has(mediaType.toLowerCase());
    const headers = privateHeaders();
    headers.set("Content-Type", mediaType);
    headers.set("Content-Length", String(bytes.byteLength));
    headers.set("Content-Disposition", safeContentDisposition(fileVersion.originalFilename, inline));
    return new Response(bytes, { status: 200, headers });
  } catch (error) {
    if (error instanceof RepositoryAuthorizationError) {
      return failure("Curator archive access is required.", 403);
    }
    return failure("The archive is not available right now.", 503);
  }
}
