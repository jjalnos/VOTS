import type { Actor } from "@/lib/auth/policy";
import { visibleArchiveItems } from "@/lib/auth/policy";
import type { ArchiveItem, Locale } from "@/lib/domain/types";
import { seedArchiveItems } from "@/lib/data/seed";
import { getPublicCatalog } from "@/lib/data/public-catalog";

const runtimeItems = [...seedArchiveItems];

export const mockArchiveRepository = {
  publicCatalog(locale: Locale) {
    return getPublicCatalog(locale);
  },
  archiveItems(actor: Actor | null) {
    return visibleArchiveItems(runtimeItems, actor);
  },
  addArchiveItem(item: ArchiveItem) {
    runtimeItems.push(item);
    return item;
  },
};

export function writableMockRepositoryEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DATA_ADAPTER === "mock";
}
