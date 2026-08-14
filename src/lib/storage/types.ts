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
