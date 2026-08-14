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
import { getMediaStorage } from "@/lib/storage/local-mock";
import type { OriginalMediaStorage } from "@/lib/storage/types";
import { createPrivateArchiveItem, UploadValidationError } from "@/lib/uploads/validation";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Cross-site upload requests are not accepted." }, { status: 403 });
  }
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!archiveRepositoryIsWritable()) {
    return NextResponse.json({ error: "A writable data adapter is not enabled for this environment." }, { status: 503 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "A file between 1 byte and 25 MB is required." }, { status: 400 });
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
      mediaType: file.type,
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
      await mediaStorage.deleteOriginal(storedFileVersion).catch(() => undefined);
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
