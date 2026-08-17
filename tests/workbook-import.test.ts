import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { excelSerialToIsoDate, readWorkbook, WorkbookFormatError } from "@/lib/survivor-registry/xlsx-reader";
import {
  diffWorkbookImport,
  mergeImportedPerson,
  previewWorkbookImport,
} from "@/lib/survivor-registry/workbook-import";
import { seedRegistryPeople } from "@/lib/survivor-registry/store";

const WORKBOOK = "/Users/clicksmith/Downloads/HMMSA Holocaust Survivors & Descendants.xlsx";

function loadWorkbook(): Uint8Array | null {
  try {
    return new Uint8Array(readFileSync(WORKBOOK));
  } catch {
    return null;
  }
}

describe("xlsx reader", () => {
  it("rejects files that are not workbooks", () => {
    expect(() => readWorkbook(new TextEncoder().encode("not a workbook"))).toThrow(
      WorkbookFormatError,
    );
  });

  it("converts Excel serial days, including across the 1900 leap-year bug", () => {
    expect(excelSerialToIsoDate(1)).toBe("1900-01-01");
    expect(excelSerialToIsoDate(61)).toBe("1900-03-01");
    expect(excelSerialToIsoDate(45000)).toBe("2023-03-15");
    expect(excelSerialToIsoDate(0)).toBe("");
    expect(excelSerialToIsoDate(Number.NaN)).toBe("");
  });
});

describe("workbook import against Robin's real workbook", () => {
  const bytes = loadWorkbook();
  const maybe = bytes ? it : it.skip;

  maybe("reads every sheet and chooses the fullest one", () => {
    const workbook = readWorkbook(bytes!);
    expect(workbook.sheets.length).toBeGreaterThanOrEqual(3);
    const preview = previewWorkbookImport(bytes!);
    expect(preview.sheetName).toContain("Work in Progress");
    expect(preview.totals.people).toBe(317);
    expect(preview.totals.survivors).toBe(68);
  });

  maybe("recovers the red-ink memorial marks", () => {
    const preview = previewWorkbookImport(bytes!);
    expect(preview.totals.deceased).toBe(60);
    const sam = preview.rows.find((row) => row.person.id === "sam-cohen");
    expect(sam?.person.deceased).toBe(true);
    expect(sam?.person.deceasedSource).toBe("red-font");
  });

  maybe("normalizes generations, camps, and century-shifted birth dates", () => {
    const preview = previewWorkbookImport(bytes!);
    const stephan = preview.rows.find((row) => row.person.id === "stephan-jalnos");
    expect(stephan?.person.camps).toEqual(["Auschwitz", "Bergen-Belsen", "Mauthausen"]);
    expect(stephan?.person.dateOfBirth).toBe("1925-06-10");
    expect(stephan?.person.generation).toBe("survivor");
    const fourthGeneration = preview.rows.filter((row) => row.person.generation === "4th-gen");
    expect(fourthGeneration.length).toBe(10);
    expect(preview.rows.every((row) => row.person.generation !== "unclassified" || !row.person.generationRaw)).toBe(true);
  });

  maybe("matches the checked-in seed, so re-importing the same file is a no-op", () => {
    const preview = previewWorkbookImport(bytes!);
    const changes = diffWorkbookImport(preview.rows, seedRegistryPeople());
    expect(changes.filter((change) => change.kind === "new")).toHaveLength(0);
    expect(changes.filter((change) => change.kind === "updated")).toHaveLength(0);
    expect(changes.filter((change) => change.kind === "unchanged")).toHaveLength(317);
  });

  maybe("preserves curator notes and hand-entered records when merging", () => {
    const preview = previewWorkbookImport(bytes!);
    const row = preview.rows.find((entry) => entry.person.id === "sam-cohen")!;
    const existing = seedRegistryPeople().find((person) => person.id === "sam-cohen")!;
    const withNote = { ...existing, notes: "Robin: confirmed with the family.", source: "curator" as const };
    const merged = mergeImportedPerson(row, withNote, "2026-08-17T12:00:00.000Z");
    expect(merged.notes).toBe("Robin: confirmed with the family.");
    expect(merged.source).toBe("curator");
    expect(merged.createdAt).toBe(withNote.createdAt);
    expect(merged.updatedAt).toBe("2026-08-17T12:00:00.000Z");
  });

  maybe("treats an empty registry as an all-new import", () => {
    const preview = previewWorkbookImport(bytes!);
    const changes = diffWorkbookImport(preview.rows, []);
    expect(changes.every((change) => change.kind === "new")).toBe(true);
    expect(changes).toHaveLength(317);
  });

  maybe("reports corrected people and names the fields that changed", () => {
    const preview = previewWorkbookImport(bytes!);
    const registry = seedRegistryPeople().map((person) =>
      person.id === "robi-jalnos"
        ? { ...person, email: "stale@example.org", city: "Houston" }
        : person,
    );
    const changes = diffWorkbookImport(preview.rows, registry);
    const corrected = changes.filter((change) => change.kind === "updated");
    expect(corrected).toHaveLength(1);
    expect(corrected[0].id).toBe("robi-jalnos");
    expect(corrected[0].changedFields.sort()).toEqual(["city", "email"]);
  });

  maybe("keeps people the workbook no longer lists", () => {
    const preview = previewWorkbookImport(bytes!);
    const handEntered = {
      ...seedRegistryPeople()[0],
      id: "curator-added-person",
      firstName: "Hand",
      lastName: "Entered",
      source: "curator" as const,
    };
    const changes = diffWorkbookImport(preview.rows, [...seedRegistryPeople(), handEntered]);
    expect(changes.some((change) => change.id === "curator-added-person")).toBe(false);
    expect(changes).toHaveLength(317);
  });
});
