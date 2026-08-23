import { describe, expect, it } from "vitest";
import type { ArchiveDatabase } from "@/db/client";
import type { FileVersion } from "@/lib/domain/types";
import { configuredMediaStorageProvider } from "@/lib/storage/media-storage";
import { PostgresBlobMediaStorage } from "@/lib/storage/postgres-blob";

describe("media storage provider selection", () => {
  it("honors an explicit provider", () => {
    expect(configuredMediaStorageProvider({ provider: "local_mock", dataAdapter: "postgres" })).toBe("local_mock");
    expect(configuredMediaStorageProvider({ provider: "postgres", dataAdapter: "mock" })).toBe("postgres");
  });

  it("follows the data adapter when unset", () => {
    expect(configuredMediaStorageProvider({ dataAdapter: "postgres" })).toBe("postgres");
    expect(configuredMediaStorageProvider({ dataAdapter: "mock" })).toBe("local_mock");
  });

  it("fails closed on an unknown provider", () => {
    expect(() => configuredMediaStorageProvider({ provider: "s3", dataAdapter: "postgres" })).toThrow(
      /Unsupported MEDIA_STORAGE_PROVIDER/,
    );
  });
});

interface InsertedRow {
  id: string;
  bytes: Uint8Array;
  byteSize: number;
  checksumSha256: string;
  createdBy: string;
}

function fakeDatabase() {
  const inserted: InsertedRow[] = [];
  const deletions: unknown[] = [];
  const database = {
    insert() {
      return {
        values(row: InsertedRow) {
          inserted.push(row);
          return Promise.resolve();
        },
      };
    },
    delete() {
      return {
        where(condition: unknown) {
          deletions.push(condition);
          return Promise.resolve();
        },
      };
    },
  } as unknown as ArchiveDatabase;
  return { database, inserted, deletions };
}

describe("postgres blob media storage", () => {
  it("stores bytes with an integrity checksum and returns matching metadata", async () => {
    const { database, inserted } = fakeDatabase();
    const storage = new PostgresBlobMediaStorage(database);
    const bytes = new TextEncoder().encode("a letter from 1946");
    const fileVersion = await storage.storeOriginal({
      archiveItemId: "item-1",
      originalFilename: "letter.pdf",
      mediaType: "application/pdf",
      bytes,
      createdBy: "user-admin",
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0].id).toBe(fileVersion.storageKey);
    expect(inserted[0].byteSize).toBe(bytes.byteLength);
    expect(inserted[0].checksumSha256).toBe(fileVersion.checksumSha256);
    expect(inserted[0].createdBy).toBe("user-admin");
    expect(fileVersion.storageProvider).toBe("postgres");
    expect(fileVersion.byteSize).toBe(bytes.byteLength);
    expect(fileVersion.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fileVersion.mediaType).toBe("application/pdf");
  });

  it("defaults a missing media type instead of storing an empty string", async () => {
    const { database } = fakeDatabase();
    const storage = new PostgresBlobMediaStorage(database);
    const fileVersion = await storage.storeOriginal({
      archiveItemId: "item-2",
      originalFilename: "photo.jpg",
      mediaType: "",
      bytes: new Uint8Array([1, 2, 3]),
      createdBy: "user-admin",
    });
    expect(fileVersion.mediaType).toBe("application/octet-stream");
  });

  it("deletes only its own blobs", async () => {
    const { database, deletions } = fakeDatabase();
    const storage = new PostgresBlobMediaStorage(database);
    const foreign: FileVersion = {
      id: "fv-1",
      archiveItemId: "item-1",
      versionNumber: 1,
      storageProvider: "local_mock",
      storageKey: "elsewhere",
      originalFilename: "x.jpg",
      mediaType: "image/jpeg",
      byteSize: 1,
      checksumSha256: "0".repeat(64),
      createdBy: "user-admin",
      createdAt: "2026-08-22T00:00:00.000Z",
    };
    await expect(storage.deleteOriginal(foreign)).rejects.toThrow(/does not belong/);
    await expect(storage.privateReadReference(foreign)).rejects.toThrow(/does not belong/);
    expect(deletions).toHaveLength(0);

    await storage.deleteOriginal({ ...foreign, storageProvider: "postgres", storageKey: "mine" });
    expect(deletions).toHaveLength(1);
  });
});
