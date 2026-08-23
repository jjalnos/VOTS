import { NextResponse } from "next/server";
import type { FileVersion } from "@/lib/domain/types";
import { getActor } from "@/lib/auth/server-session";
import { createAuditEvent } from "@/lib/audit/events";
import { hasTrustedOrigin } from "@/lib/http/origin";
import {
  archiveRepositoryIsWritable,
  getArchiveRepository,
} from "@/lib/repository";
import {
  RepositoryAuthorizationError,
  RepositoryValidationError,
} from "@/lib/repository/types";
import { getMediaStorage } from "@/lib/storage/media-storage";
import type { OriginalMediaStorage } from "@/lib/storage/types";
import {
  createPrivateArchiveItem,
  MAX_UPLOAD_BYTES,
  uploadFileIssues,
  UploadValidationError,
} from "@/lib/uploads/validation";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Cross-site upload requests are not accepted." }, { status: 403 });
  }
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!archiveRepositoryIsWritable()) {
    return NextResponse.json({ error: "A writable data adapter is not enabled for this environment." }, { status: 503 });
  }

  // Refuse to buffer a body whose size is unknown or over the limit: without
  // this, a chunked request would be read into memory in full before any file
  // check runs. Browsers always send Content-Length for form uploads.
  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    return NextResponse.json({ error: "The upload request must declare its size." }, { status: 411 });
  }
  if (contentLength > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "A file between 1 byte and 25 MB is required." }, { status: 413 });
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "The upload request could not be read." }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file between 1 byte and 25 MB is required." }, { status: 400 });
  }
  const fileIssues = uploadFileIssues({ filename: file.name, byteSize: file.size });
  if (fileIssues.length > 0) {
    return NextResponse.json(
      { error: fileIssues[0], issues: fileIssues },
      { status: file.size > MAX_UPLOAD_BYTES ? 413 : 400 },
    );
  }

  let storedFileVersion: FileVersion | undefined;
  let mediaStorage: OriginalMediaStorage | undefined;
  try {
    mediaStorage = getMediaStorage();
    const archiveItem = createPrivateArchiveItem(
      {
        survivorId: String(formData.get("survivorId") ?? "").trim() || undefined,
        familyId: String(formData.get("familyId") ?? "").trim() || undefined,
        title: String(formData.get("title") ?? ""),
        itemType: String(formData.get("itemType") ?? "") as "document",
        sourceContributor: String(formData.get("sourceContributor") ?? ""),
        originalLanguage: String(formData.get("originalLanguage") ?? "") as "en",
        consentRights: String(formData.get("consentRights") ?? "") as "permission",
        rightsStatement: String(formData.get("rightsStatement") ?? ""),
      },
      actor,
    );
    const repository = getArchiveRepository();
    await repository.validatePrivateUpload(actor, archiveItem);
    const fileVersion = await mediaStorage.storeOriginal({
      archiveItemId: archiveItem.id,
      originalFilename: file.name,
      // The declared type is client-controlled; keep only a plausible token so
      // junk can neither overflow the column nor pose as markup later.
      mediaType: /^[\w.+-]{1,79}\/[\w.+-]{1,99}$/.test(file.type) ? file.type : "application/octet-stream",
      bytes: new Uint8Array(await file.arrayBuffer()),
      createdBy: actor.userId,
    });
    storedFileVersion = fileVersion;
    const auditEvent = createAuditEvent(actor, {
      action: "archive_item.uploaded_private",
      entityType: "archive_item",
      entityId: archiveItem.id,
      familyId: archiveItem.familyId,
      metadata: { reviewStatus: archiveItem.reviewStatus, visibility: archiveItem.visibility, fileVersionId: fileVersion.id },
    });
    await repository.persistPrivateUpload(actor, { archiveItem, fileVersion, auditEvent });
    return NextResponse.json({ archiveItem, fileVersion: { ...fileVersion, storageKey: "private" }, auditEventId: auditEvent.id }, { status: 201 });
  } catch (error) {
    if (storedFileVersion && mediaStorage) {
      // A failed compensation strands stored bytes that no metadata row
      // references; the key in the log is the only way to find them again.
      const stranded = `${storedFileVersion.storageProvider}:${storedFileVersion.storageKey}`;
      await mediaStorage.deleteOriginal(storedFileVersion).catch((cleanupError: unknown) => {
        console.error(
          `The stored original ${stranded} could not be removed after a failed upload; remove it manually.`,
          cleanupError,
        );
      });
    }
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 });
    }
    if (error instanceof RepositoryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof RepositoryAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "The private upload could not be stored." }, { status: 500 });
  }
}
