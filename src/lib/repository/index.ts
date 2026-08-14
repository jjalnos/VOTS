import { mockArchiveRepository } from "@/lib/repository/mock-repository";
import { postgresArchiveRepository } from "@/lib/repository/postgres-repository";
import type { ArchiveRepository } from "@/lib/repository/types";

export type DataAdapter = "mock" | "postgres";

export function configuredDataAdapter(value = process.env.DATA_ADAPTER): DataAdapter {
  if (!value || value === "mock") return "mock";
  if (value === "postgres") return "postgres";
  throw new Error(`Unsupported DATA_ADAPTER: ${value}`);
}

export function getArchiveRepository(): ArchiveRepository {
  return configuredDataAdapter() === "postgres"
    ? postgresArchiveRepository
    : mockArchiveRepository;
}

export function archiveRepositoryIsWritable(): boolean {
  const adapter = configuredDataAdapter();
  return adapter === "postgres" || (adapter === "mock" && process.env.NODE_ENV !== "production");
}
