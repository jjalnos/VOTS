import type { ArchiveItem, ReviewStatus } from "@/lib/domain/types";

export const ARCHIVE_PAGE_SIZE = 8;

const archiveItemTypes = [
  "document",
  "photograph",
  "audio",
  "video",
  "artifact",
  "other",
] as const satisfies readonly ArchiveItem["itemType"][];

const reviewStatuses = [
  "pending",
  "in_review",
  "approved",
  "rejected",
] as const satisfies readonly ReviewStatus[];

export type ArchiveTypeFilter = ArchiveItem["itemType"] | "all";
export type ArchiveStatusFilter = ReviewStatus | "all";

export interface ArchiveQuery {
  page: number;
  q: string;
  type: ArchiveTypeFilter;
  status: ArchiveStatusFilter;
}

export interface ArchivePage {
  items: ArchiveItem[];
  page: number;
  pageCount: number;
  pageSize: typeof ARCHIVE_PAGE_SIZE;
  total: number;
  firstResult: number;
  lastResult: number;
  query: ArchiveQuery;
}

export type ArchiveSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function parseType(value: string | undefined): ArchiveTypeFilter {
  return archiveItemTypes.includes(value as ArchiveItem["itemType"])
    ? (value as ArchiveItem["itemType"])
    : "all";
}

function parseStatus(value: string | undefined): ArchiveStatusFilter {
  return reviewStatuses.includes(value as ReviewStatus)
    ? (value as ReviewStatus)
    : "all";
}

export function parseArchiveQuery(searchParams: ArchiveSearchParams): ArchiveQuery {
  return {
    page: parsePage(firstValue(searchParams.page)),
    q: (firstValue(searchParams.q) ?? "").trim().slice(0, 180),
    type: parseType(firstValue(searchParams.type)),
    status: parseStatus(firstValue(searchParams.status)),
  };
}

function searchableText(item: ArchiveItem): string {
  return [
    item.id,
    item.title,
    item.sourceContributor,
    item.familyId,
    item.survivorId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export function paginateArchiveItems(
  archiveItems: readonly ArchiveItem[],
  requestedQuery: ArchiveQuery,
): ArchivePage {
  const normalizedSearch = requestedQuery.q.toLocaleLowerCase();
  const filtered = archiveItems
    .filter((item) => !normalizedSearch || searchableText(item).includes(normalizedSearch))
    .filter((item) => requestedQuery.type === "all" || item.itemType === requestedQuery.type)
    .filter((item) => requestedQuery.status === "all" || item.reviewStatus === requestedQuery.status)
    .toSorted((left, right) => {
      const dateOrder = right.createdAt.localeCompare(left.createdAt);
      return dateOrder || left.id.localeCompare(right.id);
    });

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE));
  const page = Math.min(requestedQuery.page, pageCount);
  const firstIndex = (page - 1) * ARCHIVE_PAGE_SIZE;
  const items = filtered.slice(firstIndex, firstIndex + ARCHIVE_PAGE_SIZE);

  return {
    items,
    page,
    pageCount,
    pageSize: ARCHIVE_PAGE_SIZE,
    total,
    firstResult: total ? firstIndex + 1 : 0,
    lastResult: total ? firstIndex + items.length : 0,
    query: { ...requestedQuery, page },
  };
}

export function archivePageHref(
  query: Pick<ArchiveQuery, "q" | "type" | "status">,
  page: number,
  locale: "en" | "es",
): string {
  const params = new URLSearchParams();
  params.set("lang", locale);
  if (query.q) params.set("q", query.q);
  if (query.type !== "all") params.set("type", query.type);
  if (query.status !== "all") params.set("status", query.status);
  if (page > 1) params.set("page", String(page));
  return `/curator/archive?${params.toString()}`;
}
