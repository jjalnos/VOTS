import type {
  DemoArchiveContentRecord,
  DemoArchiveListInput,
  DemoArchiveListResult,
  DemoArchiveStoredRecord,
} from "@/lib/demo-archive/types";
import { checksumSha256 } from "@/lib/demo-archive/checksum";
import { reviewLimitedArchiveText } from "@/lib/demo-archive/validation";

export interface DemoArchiveUsage {
  records: number;
  bytes: number;
  globalBytes: number;
}

export interface DemoArchiveInsertInput {
  record: DemoArchiveStoredRecord;
  content: Uint8Array<ArrayBuffer>;
  idempotencyKey: string;
  requestFingerprint: string;
  workspaceQuotaBytes: number;
  globalQuotaBytes: number;
  maximumRecords: number;
}

export type DemoArchiveInsertResult =
  | { ok: true }
  | { ok: false; reason: "idempotent-replay"; record: DemoArchiveStoredRecord }
  | {
      ok: false;
      reason:
        | "idempotency-conflict"
        | "duplicate"
        | "workspace-quota"
        | "global-quota";
    };

export interface DemoArchiveRateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

export interface DemoArchiveLimitedTextReviewInput {
  workspaceId: string;
  recordId: string;
  reviewerUserId: string;
  reviewedAt: Date;
}

export type DemoArchiveLimitedTextReviewResult =
  | {
      ok: true;
      status: "cleared" | "already-cleared";
      record: DemoArchiveStoredRecord;
    }
  | {
      ok: false;
      reason: "not-found" | "ineligible-format" | "unsafe-content" | "blocked";
    };

export interface DemoArchiveStore {
  readonly mode: "postgres" | "memory-test";
  list(workspaceId: string, input: DemoArchiveListInput): Promise<DemoArchiveListResult>;
  usage(workspaceId: string): Promise<DemoArchiveUsage>;
  insert(input: DemoArchiveInsertInput): Promise<DemoArchiveInsertResult>;
  content(workspaceId: string, recordId: string): Promise<DemoArchiveContentRecord | undefined>;
  corpus(workspaceId: string, maximum?: number): Promise<DemoArchiveStoredRecord[]>;
  reviewLimitedText(
    input: DemoArchiveLimitedTextReviewInput,
  ): Promise<DemoArchiveLimitedTextReviewResult>;
  consumeUploadLimit(
    keys: string[],
    now: Date,
    windowSeconds: number,
    maximum: number,
  ): Promise<DemoArchiveRateLimitResult>;
}

export class DemoArchiveStoreUnavailableError extends Error {
  constructor(message = "The private archive database is not configured.") {
    super(message);
    this.name = "DemoArchiveStoreUnavailableError";
  }
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function cloneRecord(record: DemoArchiveStoredRecord): DemoArchiveStoredRecord {
  return { ...record, tags: [...record.tags] };
}

export function createMemoryDemoArchiveStore(): DemoArchiveStore {
  const records = new Map<string, { record: DemoArchiveStoredRecord; content: Uint8Array<ArrayBuffer> }>();
  const idempotency = new Map<string, { recordId: string; requestFingerprint: string }>();
  const rateLimits = new Map<string, { count: number; startedAt: number }>();

  function workspaceRecords(workspaceId: string): DemoArchiveStoredRecord[] {
    return [...records.values()]
      .map((entry) => entry.record)
      .filter((record) => record.workspaceId === workspaceId);
  }

  return {
    mode: "memory-test",
    async list(workspaceId, input) {
      const query = normalize(input.query);
      const filtered = workspaceRecords(workspaceId)
        .filter((record) => {
          if (input.survivor !== "all" && record.survivorName !== input.survivor) return false;
          if (input.itemType !== "all" && record.itemType !== input.itemType) return false;
          if (input.status !== "all" && record.status !== input.status) return false;
          if (!query) return true;
          return normalize(
            [
              record.title,
              record.originalFilename,
              record.survivorName,
              record.sourceContributor,
              record.notes,
              record.tags.join(" "),
              record.extractedText,
            ]
              .filter(Boolean)
              .join(" "),
          ).includes(query);
        })
        .sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
        );
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
      const page = Math.min(input.page, totalPages);
      const all = workspaceRecords(workspaceId);
      const countBy = <T extends string>(values: T[]) =>
        [...new Set(values)]
          .sort()
          .map((value) => ({ value, count: values.filter((entry) => entry === value).length }));
      return {
        items: filtered
          .slice((page - 1) * input.pageSize, page * input.pageSize)
          .map(cloneRecord),
        total,
        page,
        pageSize: input.pageSize,
        totalPages,
        facets: {
          survivors: [...new Set(all.map((record) => record.survivorName))].sort(),
          types: countBy(all.map((record) => record.itemType)),
          statuses: countBy(all.map((record) => record.status)),
        },
      };
    },
    async usage(workspaceId) {
      const workspace = workspaceRecords(workspaceId);
      const all = [...records.values()].map((entry) => entry.record);
      return {
        records: workspace.length,
        bytes: workspace.reduce((sum, record) => sum + record.byteSize, 0),
        globalBytes: all.reduce((sum, record) => sum + record.byteSize, 0),
      };
    },
    async insert(input) {
      const idempotencyScope = `${input.record.workspaceId}:${input.idempotencyKey}`;
      const idempotent = idempotency.get(idempotencyScope);
      const replay = idempotent ? records.get(idempotent.recordId) : undefined;
      if (replay) {
        if (idempotent?.requestFingerprint !== input.requestFingerprint) {
          return { ok: false, reason: "idempotency-conflict" };
        }
        return {
          ok: false,
          reason: "idempotent-replay",
          record: cloneRecord(replay.record),
        };
      }
      const workspace = workspaceRecords(input.record.workspaceId);
      if (
        workspace.some((record) => record.checksumSha256 === input.record.checksumSha256)
      ) {
        return { ok: false, reason: "duplicate" };
      }
      const workspaceBytes = workspace.reduce((sum, record) => sum + record.byteSize, 0);
      if (
        workspace.length + 1 > input.maximumRecords ||
        workspaceBytes + input.record.byteSize > input.workspaceQuotaBytes
      ) {
        return { ok: false, reason: "workspace-quota" };
      }
      const globalBytes = [...records.values()].reduce(
        (sum, entry) => sum + entry.record.byteSize,
        0,
      );
      if (globalBytes + input.record.byteSize > input.globalQuotaBytes) {
        return { ok: false, reason: "global-quota" };
      }
      records.set(input.record.id, {
        record: cloneRecord(input.record),
        content: input.content.slice(),
      });
      idempotency.set(idempotencyScope, {
        recordId: input.record.id,
        requestFingerprint: input.requestFingerprint,
      });
      return { ok: true };
    },
    async content(workspaceId, recordId) {
      const entry = records.get(recordId);
      if (!entry || entry.record.workspaceId !== workspaceId) return undefined;
      return { record: cloneRecord(entry.record), content: entry.content.slice() };
    },
    async corpus(workspaceId, maximum = 200) {
      return workspaceRecords(workspaceId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, maximum)
        .map(cloneRecord);
    },
    async reviewLimitedText(input) {
      const entry = records.get(input.recordId);
      if (!entry || entry.record.workspaceId !== input.workspaceId) {
        return { ok: false, reason: "not-found" };
      }
      const review = reviewLimitedArchiveText(entry.record, entry.content);
      if (!review.ok) {
        return {
          ok: false,
          reason: review.reason === "ineligible-format" ? "ineligible-format" : "unsafe-content",
        };
      }
      if (checksumSha256(entry.content) !== entry.record.checksumSha256) {
        return { ok: false, reason: "unsafe-content" };
      }
      if (entry.record.scanStatus === "blocked") return { ok: false, reason: "blocked" };
      if (entry.record.scanStatus === "cleared") {
        return { ok: true, status: "already-cleared", record: cloneRecord(entry.record) };
      }
      entry.record = {
        ...entry.record,
        scanStatus: "cleared",
        extractedText: review.text,
        previewUrl: `/api/demo/archive/${encodeURIComponent(entry.record.id)}/content`,
      };
      return { ok: true, status: "cleared", record: cloneRecord(entry.record) };
    },
    async consumeUploadLimit(keys, now, windowSeconds, maximum) {
      const nowMs = now.getTime();
      const windowMs = windowSeconds * 1_000;
      let allowed = true;
      let retryAfter = 1;
      for (const key of keys) {
        const previous = rateLimits.get(key);
        const entry =
          !previous || nowMs - previous.startedAt >= windowMs
            ? { count: 0, startedAt: nowMs }
            : previous;
        entry.count += 1;
        rateLimits.set(key, entry);
        allowed = allowed && entry.count <= maximum;
        retryAfter = Math.max(
          retryAfter,
          Math.max(1, Math.ceil((windowMs - (nowMs - entry.startedAt)) / 1_000)),
        );
      }
      return { allowed, retryAfter };
    },
  };
}

const storeState = globalThis as typeof globalThis & {
  votsDemoArchiveStore?: DemoArchiveStore;
};

export async function getDemoArchiveStore(): Promise<DemoArchiveStore> {
  if (storeState.votsDemoArchiveStore) return storeState.votsDemoArchiveStore;
  if (process.env.DEMO_ARCHIVE_STORE === "memory" && process.env.NODE_ENV !== "production") {
    storeState.votsDemoArchiveStore = createMemoryDemoArchiveStore();
    return storeState.votsDemoArchiveStore;
  }
  if (!process.env.DATABASE_URL) throw new DemoArchiveStoreUnavailableError();
  const { createPostgresDemoArchiveStore } = await import("@/lib/demo-archive/postgres-store");
  storeState.votsDemoArchiveStore = createPostgresDemoArchiveStore();
  return storeState.votsDemoArchiveStore;
}

export function setDemoArchiveStoreForTests(store: DemoArchiveStore | undefined): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The production archive store cannot be replaced.");
  }
  if (store) storeState.votsDemoArchiveStore = store;
  else delete storeState.votsDemoArchiveStore;
}
