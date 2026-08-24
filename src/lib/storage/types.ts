import type { FileVersion } from "@/lib/domain/types";

export interface StoreOriginalInput {
  archiveItemId: string;
  originalFilename: string;
  mediaType: string;
  bytes: Uint8Array;
  createdBy: string;
}

export interface OriginalMediaStorage {
  readonly provider: FileVersion["storageProvider"];
  storeOriginal(input: StoreOriginalInput): Promise<FileVersion>;
  privateReadReference(fileVersion: FileVersion): Promise<string>;
  /** Returns null when the stored bytes are missing, so a reviewer sees a
   * "file unavailable" state instead of a crash. The ArrayBuffer-backed view
   * is what a Response body accepts without copying. */
  readOriginal(fileVersion: FileVersion): Promise<Uint8Array<ArrayBuffer> | null>;
  deleteOriginal(fileVersion: FileVersion): Promise<void>;
}

export interface GoogleDriveStorageConfiguration {
  provider: "google_drive";
  folderId: string;
}

// Google Drive is represented only as a swappable contract in this foundation.
// No Google credential, SDK, or network call is present.
export type FutureStorageConfiguration =
  | { provider: "local_mock"; rootDirectory: string }
  | GoogleDriveStorageConfiguration
  | { provider: "object_storage"; bucket: string };
