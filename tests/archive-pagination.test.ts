import { describe, expect, it } from "vitest";
import {
  ARCHIVE_PAGE_SIZE,
  archivePageHref,
  paginateArchiveItems,
  parseArchiveQuery,
  type ArchiveQuery,
} from "@/lib/archive/pagination";
import type { ArchiveItem } from "@/lib/domain/types";

function archiveItem(
  id: string,
  createdAt: string,
  overrides: Partial<ArchiveItem> = {},
): ArchiveItem {
  return {
    id,
    familyId: "family-demo",
    title: `Synthetic upload ${id}`,
    itemType: "document",
    sourceContributor: "Robin demo intake",
    originalLanguage: "en",
    consentRights: "documented_restriction",
    rightsStatement: "Synthetic test fixture only.",
    visibility: "private",
    reviewStatus: "pending",
    uploadedBy: "user-curator-demo",
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

const defaultQuery: ArchiveQuery = {
  page: 1,
  q: "",
  type: "all",
  status: "all",
};

describe("archive pagination", () => {
  it("normalizes unsafe pages and unsupported filters", () => {
    expect(parseArchiveQuery({ page: "0", type: "film", status: "lost" })).toEqual(defaultQuery);
    expect(parseArchiveQuery({ page: "-2", q: "  Robin  ", type: "video", status: "in_review" }))
      .toEqual({ page: 1, q: "Robin", type: "video", status: "in_review" });
    expect(parseArchiveQuery({ page: ["3", "4"] }).page).toBe(3);
  });

  it("sorts by received date descending and id for equal timestamps", () => {
    const original = [
      archiveItem("record-c", "2026-08-13T10:00:00.000Z"),
      archiveItem("record-b", "2026-08-14T10:00:00.000Z"),
      archiveItem("record-a", "2026-08-14T10:00:00.000Z"),
    ];

    const result = paginateArchiveItems(original, defaultQuery);

    expect(result.items.map((item) => item.id)).toEqual(["record-a", "record-b", "record-c"]);
    expect(original.map((item) => item.id)).toEqual(["record-c", "record-b", "record-a"]);
  });

  it("returns eight records per page and clamps a page beyond the result set", () => {
    const records = Array.from({ length: 18 }, (_, index) =>
      archiveItem(
        `record-${String(index + 1).padStart(2, "0")}`,
        new Date(Date.UTC(2026, 7, 14, index)).toISOString(),
      ),
    );

    const second = paginateArchiveItems(records, { ...defaultQuery, page: 2 });
    expect(second.pageSize).toBe(ARCHIVE_PAGE_SIZE);
    expect(second.items).toHaveLength(8);
    expect(second.total).toBe(18);
    expect(second.pageCount).toBe(3);
    expect([second.firstResult, second.lastResult]).toEqual([9, 16]);

    const clamped = paginateArchiveItems(records, { ...defaultQuery, page: 99 });
    expect(clamped.page).toBe(3);
    expect(clamped.items).toHaveLength(2);
    expect([clamped.firstResult, clamped.lastResult]).toEqual([17, 18]);
  });

  it("combines case-insensitive search, format, and review filters", () => {
    const records = [
      archiveItem("wanted", "2026-08-14T10:00:00.000Z", {
        title: "Robin family photograph",
        itemType: "photograph",
        reviewStatus: "in_review",
      }),
      archiveItem("wrong-format", "2026-08-14T09:00:00.000Z", {
        title: "Robin transcript",
        itemType: "document",
        reviewStatus: "in_review",
      }),
      archiveItem("wrong-status", "2026-08-14T08:00:00.000Z", {
        title: "Robin portrait",
        itemType: "photograph",
        reviewStatus: "approved",
      }),
    ];

    const result = paginateArchiveItems(records, {
      page: 1,
      q: "ROBIN",
      type: "photograph",
      status: "in_review",
    });

    expect(result.items.map((item) => item.id)).toEqual(["wanted"]);
    expect(result.total).toBe(1);
  });

  it("preserves active filters and locale in pagination links", () => {
    expect(archivePageHref(
      { q: "Robin intake", type: "audio", status: "pending" },
      3,
      "es",
    )).toBe("/curator/archive?lang=es&q=Robin+intake&type=audio&status=pending&page=3");
    expect(archivePageHref(defaultQuery, 1, "en")).toBe("/curator/archive?lang=en");
  });
});
