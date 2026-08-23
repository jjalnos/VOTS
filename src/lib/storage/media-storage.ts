import { configuredDataAdapter } from "@/lib/repository";
import { LocalMockMediaStorage } from "@/lib/storage/local-mock";
import { PostgresBlobMediaStorage } from "@/lib/storage/postgres-blob";
import type { OriginalMediaStorage } from "@/lib/storage/types";

export type MediaStorageProvider = "local_mock" | "postgres";

/**
 * Which media storage the deployment uses. MEDIA_STORAGE_PROVIDER wins when
 * set; otherwise a postgres data adapter stores bytes in postgres and
 * development keeps the on-disk mock. local_mock refuses to run in production,
 * so a misconfigured deployment fails closed instead of writing originals to
 * an unmanaged filesystem.
 */
export function configuredMediaStorageProvider(
  environment: {
    provider?: string;
    dataAdapter?: "mock" | "postgres";
  } = { provider: process.env.MEDIA_STORAGE_PROVIDER, dataAdapter: configuredDataAdapter() },
): MediaStorageProvider {
  const configured = environment.provider?.trim();
  if (configured === "local_mock" || configured === "postgres") return configured;
  if (configured) {
    throw new Error(`Unsupported MEDIA_STORAGE_PROVIDER: ${configured}`);
  }
  return environment.dataAdapter === "postgres" ? "postgres" : "local_mock";
}

export function getMediaStorage(): OriginalMediaStorage {
  return configuredMediaStorageProvider() === "postgres"
    ? new PostgresBlobMediaStorage()
    : new LocalMockMediaStorage();
}
