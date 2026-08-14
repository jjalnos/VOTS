import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileVersion } from "@/lib/domain/types";
import type { OriginalMediaStorage, StoreOriginalInput } from "@/lib/storage/types";

const SAFE_EXTENSION = /[^a-z0-9.]+/gi;

function safeFilename(filename: string): string {
  const extension = path.extname(filename).toLocaleLowerCase().replace(SAFE_EXTENSION, "").slice(0, 12);
  return `${randomUUID()}${extension}`;
}

export class LocalMockMediaStorage implements OriginalMediaStorage {
  readonly provider = "local_mock" as const;

  constructor(private readonly rootDirectory = process.env.LOCAL_MEDIA_ROOT ?? ".local-data/media") {}

  async storeOriginal(input: StoreOriginalInput): Promise<FileVersion> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Local mock media storage is disabled in production.");
    }
    const itemDirectory = path.resolve(this.rootDirectory, input.archiveItemId);
    const root = path.resolve(this.rootDirectory);
    if (!itemDirectory.startsWith(`${root}${path.sep}`)) {
      throw new Error("Invalid archive item storage path.");
    }
    await mkdir(itemDirectory, { recursive: true, mode: 0o700 });
    const filename = safeFilename(input.originalFilename);
    const storagePath = path.join(itemDirectory, filename);
    await writeFile(storagePath, input.bytes, { mode: 0o600 });
    const createdAt = new Date().toISOString();
    return {
      id: randomUUID(),
      archiveItemId: input.archiveItemId,
      versionNumber: 1,
      storageProvider: this.provider,
      storageKey: path.relative(root, storagePath),
      originalFilename: input.originalFilename,
      mediaType: input.mediaType || "application/octet-stream",
      byteSize: input.bytes.byteLength,
      checksumSha256: createHash("sha256").update(input.bytes).digest("hex"),
      createdBy: input.createdBy,
      createdAt,
    };
  }

  async privateReadReference(fileVersion: FileVersion): Promise<string> {
    if (fileVersion.storageProvider !== this.provider) {
      throw new Error("The requested file does not belong to the local mock provider.");
    }
    return `local-private://${fileVersion.storageKey}`;
  }
}

export function getMediaStorage(): OriginalMediaStorage {
  const provider = process.env.MEDIA_STORAGE_PROVIDER ?? "local_mock";
  if (provider !== "local_mock") {
    throw new Error(
      "Only the local_mock media provider is implemented. Configure Google Drive or object storage in a future adapter without changing archive metadata contracts.",
    );
  }
  return new LocalMockMediaStorage();
}
