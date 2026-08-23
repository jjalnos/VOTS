import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDatabase, type ArchiveDatabase } from "@/db/client";
import { fileBlobs } from "@/db/schema";
import type { FileVersion } from "@/lib/domain/types";
import type { OriginalMediaStorage, StoreOriginalInput } from "@/lib/storage/types";

/**
 * Stores original upload bytes inside PostgreSQL, next to the metadata that
 * describes them. The host is managed through a panel without shell access, so
 * the database — which is already migrated, backed up, and required in
 * production — is the one storage this deployment can rely on. Uploads are
 * capped well below anything that would strain a bytea column, and a future
 * Google Drive or object-storage adapter can move the bytes without touching
 * archive metadata contracts.
 */
export class PostgresBlobMediaStorage implements OriginalMediaStorage {
  readonly provider = "postgres" as const;

  constructor(private readonly database?: ArchiveDatabase) {}

  /** Resolved lazily so constructing the adapter never opens a connection. */
  private db(): ArchiveDatabase {
    return this.database ?? getDatabase();
  }

  async storeOriginal(input: StoreOriginalInput): Promise<FileVersion> {
    const storageKey = randomUUID();
    const createdAt = new Date().toISOString();
    const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");
    await this.db().insert(fileBlobs).values({
      id: storageKey,
      bytes: input.bytes,
      byteSize: input.bytes.byteLength,
      checksumSha256,
      createdBy: input.createdBy,
    });
    return {
      id: randomUUID(),
      archiveItemId: input.archiveItemId,
      versionNumber: 1,
      storageProvider: this.provider,
      storageKey,
      originalFilename: input.originalFilename,
      mediaType: input.mediaType || "application/octet-stream",
      byteSize: input.bytes.byteLength,
      checksumSha256,
      createdBy: input.createdBy,
      createdAt,
    };
  }

  async privateReadReference(fileVersion: FileVersion): Promise<string> {
    if (fileVersion.storageProvider !== this.provider) {
      throw new Error("The requested file does not belong to the postgres provider.");
    }
    return `postgres-blob://${fileVersion.storageKey}`;
  }

  async deleteOriginal(fileVersion: FileVersion): Promise<void> {
    if (fileVersion.storageProvider !== this.provider) {
      throw new Error("The requested file does not belong to the postgres provider.");
    }
    await this.db().delete(fileBlobs).where(eq(fileBlobs.id, fileVersion.storageKey));
  }
}
