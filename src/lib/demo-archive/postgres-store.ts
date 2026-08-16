import postgres from "postgres";
import {
  decryptDemoArchiveContent,
  encryptDemoArchiveContent,
} from "@/lib/demo-archive/crypto";
import { checksumSha256 } from "@/lib/demo-archive/checksum";
import {
  DEMO_ARCHIVE_REQUIRED_TABLES,
} from "@/lib/demo-archive/migration";
import type {
  DemoArchiveContentRecord,
  DemoArchiveExtractionStatus,
  DemoArchiveItemType,
  DemoArchiveStatus,
  DemoArchiveStoredRecord,
} from "@/lib/demo-archive/types";
import type {
  DemoArchiveInsertResult,
  DemoArchiveLimitedTextReviewResult,
  DemoArchiveStore,
  DemoArchiveUsage,
} from "@/lib/demo-archive/store";
import {
  decodeValidatedPlainText,
  DEMO_ARCHIVE_LIMITED_TEXT_REVIEW_MAX_BYTES,
  reviewLimitedArchiveText,
} from "@/lib/demo-archive/validation";

type Sql = postgres.Sql;
type Row = Record<string, unknown>;

const postgresState = globalThis as typeof globalThis & {
  votsDemoArchiveSql?: Sql;
  votsDemoArchiveInitialized?: Promise<void>;
};

const ITEM_TYPES = new Set<DemoArchiveItemType>([
  "document",
  "photograph",
  "audio",
  "video",
]);
const STATUSES = new Set<DemoArchiveStatus>([
  "needs-review",
  "processing",
  "ready",
  "approved-private",
]);
const EXTRACTION_STATUSES = new Set<DemoArchiveExtractionStatus>([
  "text-ready",
  "metadata-only",
  "awaiting-ocr",
  "awaiting-transcription",
  "awaiting-text-extraction",
]);

function sqlClient(): Sql {
  if (postgresState.votsDemoArchiveSql) return postgresState.votsDemoArchiveSql;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the private archive.");
  postgresState.votsDemoArchiveSql = postgres(databaseUrl, {
    max: Math.max(1, Math.min(Number(process.env.DATABASE_POOL_MAX ?? "4") || 4, 8)),
    ssl: process.env.DATABASE_SSL === "require" ? "require" : false,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 20,
  });
  return postgresState.votsDemoArchiveSql;
}

async function initialize(sql: Sql): Promise<void> {
  postgresState.votsDemoArchiveInitialized ??= (async () => {
    const rows = await sql<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ${sql(DEMO_ARCHIVE_REQUIRED_TABLES)}
    `;
    const present = new Set(rows.map((row) => row.table_name));
    const missing = DEMO_ARCHIVE_REQUIRED_TABLES.filter((table) => !present.has(table));
    if (missing.length) {
      throw new Error("The checked-in private archive migration has not been applied.");
    }
  })().catch((error) => {
    delete postgresState.votsDemoArchiveInitialized;
    throw error;
  });
  return postgresState.votsDemoArchiveInitialized;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function dateText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(text(value));
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function optionalText(value: unknown): string | undefined {
  const valueText = text(value).trim();
  return valueText || undefined;
}

function tags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((tag): tag is string => typeof tag === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function mapRecord(row: Row): DemoArchiveStoredRecord {
  const itemTypeValue = text(row.item_type);
  const statusValue = text(row.status);
  const extractionValue = text(row.extraction_status);
  const itemType = ITEM_TYPES.has(itemTypeValue as DemoArchiveItemType)
    ? (itemTypeValue as DemoArchiveItemType)
    : "document";
  const status = STATUSES.has(statusValue as DemoArchiveStatus)
    ? (statusValue as DemoArchiveStatus)
    : "needs-review";
  const extractionStatus = EXTRACTION_STATUSES.has(
    extractionValue as DemoArchiveExtractionStatus,
  )
    ? (extractionValue as DemoArchiveExtractionStatus)
    : "metadata-only";
  const id = text(row.id);
  const byteSize = numberValue(row.byte_size);
  const previewable = row.previewable === true;
  const scanStatus =
    row.scan_status === "cleared" || row.scan_status === "blocked"
      ? row.scan_status
      : "quarantined";
  const createdAt = dateText(row.created_at);
  return {
    id,
    workspaceId: text(row.workspace_id),
    title: text(row.title),
    survivorName: text(row.survivor_name, "Unassigned"),
    itemType,
    mediaType: itemType,
    mimeType: text(row.mime_type, "application/octet-stream"),
    originalFilename: text(row.original_filename),
    byteSize,
    fileSize: byteSize,
    checksumSha256: text(row.checksum_sha256),
    sourceContributor: text(row.source_contributor),
    originalLanguage: text(row.original_language),
    consentRights: text(row.consent_rights),
    rightsStatement: text(row.rights_statement),
    historicalDate: optionalText(row.historical_date),
    notes: optionalText(row.notes),
    tags: tags(row.tags_json),
    visibility: "private",
    status,
    reviewStatus: status,
    extractionStatus,
    scanStatus,
    extractedText: undefined,
    previewable,
    createdAt,
    uploadedAt: createdAt,
    previewUrl:
      previewable && scanStatus === "cleared"
        ? `/api/demo/archive/${encodeURIComponent(id)}/content`
        : undefined,
  };
}

function bytes(value: unknown): Uint8Array<ArrayBuffer> {
  const source = value instanceof Uint8Array ? value : Buffer.from([]);
  const target = new Uint8Array(new ArrayBuffer(source.byteLength));
  target.set(source);
  return target;
}

async function usageWith(sql: Sql, workspaceId: string): Promise<DemoArchiveUsage> {
  const [workspaceRows, globalRows] = await Promise.all([
    sql`
      SELECT COUNT(*)::integer AS records, COALESCE(SUM(byte_size), 0)::bigint AS bytes
      FROM demo_archive_records WHERE workspace_id = ${workspaceId}::uuid
    `,
    sql`SELECT COALESCE(SUM(byte_size), 0)::bigint AS bytes FROM demo_archive_records`,
  ]);
  return {
    records: numberValue(workspaceRows[0]?.records),
    bytes: numberValue(workspaceRows[0]?.bytes),
    globalBytes: numberValue(globalRows[0]?.bytes),
  };
}

export function createPostgresDemoArchiveStore(): DemoArchiveStore {
  const sql = sqlClient();
  return {
    mode: "postgres",
    async list(workspaceId, input) {
      await initialize(sql);
      const query = input.query.trim();
      const pattern = `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      const [countRows, survivorRows, typeRows, statusRows] = await Promise.all([
        sql`
          SELECT COUNT(*)::integer AS count
          FROM demo_archive_records r
          WHERE r.workspace_id = ${workspaceId}::uuid
            AND (${query} = '' OR r.title ILIKE ${pattern} ESCAPE '\\' OR r.original_filename ILIKE ${pattern} ESCAPE '\\'
              OR r.survivor_name ILIKE ${pattern} ESCAPE '\\' OR r.source_contributor ILIKE ${pattern} ESCAPE '\\'
              OR COALESCE(r.notes, '') ILIKE ${pattern} ESCAPE '\\' OR r.tags_json::text ILIKE ${pattern} ESCAPE '\\'
              )
            AND (${input.survivor} = 'all' OR r.survivor_name = ${input.survivor})
            AND (${input.itemType} = 'all' OR r.item_type = ${input.itemType})
            AND (${input.status} = 'all' OR r.status = ${input.status})
        `,
        sql`
          SELECT survivor_name AS value FROM demo_archive_records
          WHERE workspace_id = ${workspaceId}::uuid GROUP BY survivor_name ORDER BY survivor_name
        `,
        sql`
          SELECT item_type AS value, COUNT(*)::integer AS count FROM demo_archive_records
          WHERE workspace_id = ${workspaceId}::uuid GROUP BY item_type ORDER BY item_type
        `,
        sql`
          SELECT status AS value, COUNT(*)::integer AS count FROM demo_archive_records
          WHERE workspace_id = ${workspaceId}::uuid GROUP BY status ORDER BY status
        `,
      ]);
      const total = numberValue(countRows[0]?.count);
      const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
      const page = Math.min(input.page, totalPages);
      const pageRows = await sql`
        SELECT r.id, r.workspace_id, r.title, r.survivor_name, r.item_type, r.mime_type,
          r.original_filename, r.byte_size, r.checksum_sha256, r.source_contributor,
          r.original_language, r.consent_rights, r.rights_statement, r.historical_date,
          r.notes, r.tags_json, r.status, r.extraction_status,
          r.previewable, r.created_at, b.scan_status
        FROM demo_archive_records r
        JOIN demo_archive_blobs b ON b.record_id = r.id
        WHERE r.workspace_id = ${workspaceId}::uuid
          AND (${query} = '' OR r.title ILIKE ${pattern} ESCAPE '\\' OR r.original_filename ILIKE ${pattern} ESCAPE '\\'
            OR r.survivor_name ILIKE ${pattern} ESCAPE '\\' OR r.source_contributor ILIKE ${pattern} ESCAPE '\\'
            OR COALESCE(r.notes, '') ILIKE ${pattern} ESCAPE '\\' OR r.tags_json::text ILIKE ${pattern} ESCAPE '\\'
            )
          AND (${input.survivor} = 'all' OR r.survivor_name = ${input.survivor})
          AND (${input.itemType} = 'all' OR r.item_type = ${input.itemType})
          AND (${input.status} = 'all' OR r.status = ${input.status})
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ${input.pageSize} OFFSET ${(page - 1) * input.pageSize}
      `;
      return {
        items: pageRows.map((row) => mapRecord(row)),
        total,
        page,
        pageSize: input.pageSize,
        totalPages,
        facets: {
          survivors: survivorRows.map((row) => text(row.value)).filter(Boolean),
          types: typeRows
            .filter((row) => ITEM_TYPES.has(text(row.value) as DemoArchiveItemType))
            .map((row) => ({
              value: text(row.value) as DemoArchiveItemType,
              count: numberValue(row.count),
            })),
          statuses: statusRows
            .filter((row) => STATUSES.has(text(row.value) as DemoArchiveStatus))
            .map((row) => ({
              value: text(row.value) as DemoArchiveStatus,
              count: numberValue(row.count),
            })),
        },
      };
    },
    async usage(workspaceId) {
      await initialize(sql);
      return usageWith(sql, workspaceId);
    },
    async insert(input): Promise<DemoArchiveInsertResult> {
      await initialize(sql);
      const encrypted = encryptDemoArchiveContent(
        input.content,
        input.record.workspaceId,
        input.record.id,
      );
      return sql.begin(async (transaction) => {
        await transaction`SELECT pg_advisory_xact_lock(hashtext('vots-demo-archive-quota'))`;
        const replayRows = await transaction`
          SELECT i.request_fingerprint, r.id, r.workspace_id, r.title, r.survivor_name, r.item_type, r.mime_type,
            r.original_filename, r.byte_size, r.checksum_sha256, r.source_contributor,
            r.original_language, r.consent_rights, r.rights_statement, r.historical_date,
            r.notes, r.tags_json, r.status, r.extraction_status,
            r.previewable, r.created_at, b.scan_status
          FROM demo_archive_idempotency i
          JOIN demo_archive_records r ON r.id = i.record_id
          JOIN demo_archive_blobs b ON b.record_id = r.id
          WHERE i.workspace_id = ${input.record.workspaceId}::uuid
            AND i.idempotency_key = ${input.idempotencyKey}::uuid
          LIMIT 1
        `;
        if (replayRows[0]) {
          if (text(replayRows[0].request_fingerprint) !== input.requestFingerprint) {
            return { ok: false, reason: "idempotency-conflict" } as const;
          }
          return {
            ok: false,
            reason: "idempotent-replay",
            record: mapRecord(replayRows[0]),
          } as const;
        }
        const duplicate = await transaction`
          SELECT id FROM demo_archive_records
          WHERE workspace_id = ${input.record.workspaceId}::uuid
            AND checksum_sha256 = ${input.record.checksumSha256}
          LIMIT 1
        `;
        if (duplicate.length) return { ok: false, reason: "duplicate" } as const;
        const workspaceRows = await transaction`
          SELECT COUNT(*)::integer AS records, COALESCE(SUM(byte_size), 0)::bigint AS bytes
          FROM demo_archive_records WHERE workspace_id = ${input.record.workspaceId}::uuid
        `;
        const globalRows = await transaction`
          SELECT COALESCE(SUM(byte_size), 0)::bigint AS bytes FROM demo_archive_records
        `;
        const current: DemoArchiveUsage = {
          records: numberValue(workspaceRows[0]?.records),
          bytes: numberValue(workspaceRows[0]?.bytes),
          globalBytes: numberValue(globalRows[0]?.bytes),
        };
        if (
          current.records + 1 > input.maximumRecords ||
          current.bytes + input.record.byteSize > input.workspaceQuotaBytes
        ) {
          return { ok: false, reason: "workspace-quota" } as const;
        }
        if (current.globalBytes + input.record.byteSize > input.globalQuotaBytes) {
          return { ok: false, reason: "global-quota" } as const;
        }
        await transaction`
          INSERT INTO demo_archive_records (
            id, workspace_id, title, survivor_name, item_type, mime_type,
            original_filename, byte_size, checksum_sha256, source_contributor,
            original_language, consent_rights, rights_statement, historical_date,
            notes, tags_json, visibility, status, extraction_status, previewable,
            created_at, updated_at
          ) VALUES (
            ${input.record.id}::uuid, ${input.record.workspaceId}::uuid,
            ${input.record.title}, ${input.record.survivorName}, ${input.record.itemType},
            ${input.record.mimeType}, ${input.record.originalFilename}, ${input.record.byteSize},
            ${input.record.checksumSha256}, ${input.record.sourceContributor},
            ${input.record.originalLanguage}, ${input.record.consentRights},
            ${input.record.rightsStatement}, ${input.record.historicalDate ?? null},
            ${input.record.notes ?? null}, ${JSON.stringify(input.record.tags)}::jsonb,
            'private', ${input.record.status}, ${input.record.extractionStatus},
            ${input.record.previewable},
            ${input.record.createdAt}::timestamptz, ${input.record.createdAt}::timestamptz
          )
        `;
        await transaction`
          INSERT INTO demo_archive_blobs (
            record_id, ciphertext, nonce, auth_tag, key_version,
            scan_status, created_at, updated_at
          ) VALUES (
            ${input.record.id}::uuid, ${encrypted.ciphertext}, ${encrypted.nonce},
            ${encrypted.authTag}, ${encrypted.keyVersion}, ${input.record.scanStatus},
            ${input.record.createdAt}::timestamptz, ${input.record.createdAt}::timestamptz
          )
        `;
        await transaction`
          INSERT INTO demo_archive_audit_events (
            workspace_id, action, record_id, metadata_json, occurred_at
          ) VALUES (
            ${input.record.workspaceId}::uuid, 'archive.uploaded_private',
            ${input.record.id}::uuid,
            ${JSON.stringify({
              byteSize: input.record.byteSize,
              checksumSha256: input.record.checksumSha256,
              itemType: input.record.itemType,
              extractionStatus: input.record.extractionStatus,
            })}::jsonb,
            ${input.record.createdAt}::timestamptz
          )
        `;
        await transaction`
          INSERT INTO demo_archive_idempotency (
            workspace_id, idempotency_key, request_fingerprint, record_id, created_at
          ) VALUES (
            ${input.record.workspaceId}::uuid, ${input.idempotencyKey}::uuid,
            ${input.requestFingerprint},
            ${input.record.id}::uuid, ${input.record.createdAt}::timestamptz
          )
        `;
        return { ok: true } as const;
      });
    },
    async content(workspaceId, recordId): Promise<DemoArchiveContentRecord | undefined> {
      await initialize(sql);
      const rows = await sql`
        SELECT r.id, r.workspace_id, r.title, r.survivor_name, r.item_type, r.mime_type,
          r.original_filename, r.byte_size, r.checksum_sha256, r.source_contributor,
          r.original_language, r.consent_rights, r.rights_statement, r.historical_date,
          r.notes, r.tags_json, r.status, r.extraction_status,
          r.previewable, r.created_at, b.scan_status, b.ciphertext, b.nonce,
          b.auth_tag, b.key_version
        FROM demo_archive_records r
        JOIN demo_archive_blobs b ON b.record_id = r.id
        WHERE r.workspace_id = ${workspaceId}::uuid AND r.id = ${recordId}::uuid
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) return undefined;
      const record = mapRecord(row);
      const content =
        record.scanStatus === "cleared"
          ? decryptDemoArchiveContent({
              ciphertext: bytes(row.ciphertext),
              nonce: bytes(row.nonce),
              authTag: bytes(row.auth_tag),
              keyVersion: numberValue(row.key_version),
              workspaceId,
              recordId,
            })
          : new Uint8Array(new ArrayBuffer(0));
      return { record, content };
    },
    async corpus(workspaceId, maximum = 200) {
      await initialize(sql);
      const rows = await sql`
        SELECT r.id, r.workspace_id, r.title, r.survivor_name, r.item_type, r.mime_type,
          r.original_filename, r.byte_size, r.checksum_sha256, r.source_contributor,
          r.original_language, r.consent_rights, r.rights_statement, r.historical_date,
          r.notes, r.tags_json, r.status, r.extraction_status,
          r.previewable, r.created_at, b.scan_status, b.ciphertext, b.nonce,
          b.auth_tag, b.key_version
        FROM demo_archive_records r
        JOIN demo_archive_blobs b ON b.record_id = r.id
        WHERE r.workspace_id = ${workspaceId}::uuid
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ${Math.max(1, Math.min(maximum, 500))}
      `;
      return rows.map((row) => {
        const record = mapRecord(row);
        if (record.scanStatus !== "cleared" || record.extractionStatus !== "text-ready") {
          return { ...record, extractedText: undefined };
        }
        const content = decryptDemoArchiveContent({
          ciphertext: bytes(row.ciphertext),
          nonce: bytes(row.nonce),
          authTag: bytes(row.auth_tag),
          keyVersion: numberValue(row.key_version),
          workspaceId,
          recordId: record.id,
        });
        return { ...record, extractedText: decodeValidatedPlainText(content) };
      });
    },
    async reviewLimitedText(input): Promise<DemoArchiveLimitedTextReviewResult> {
      await initialize(sql);
      return sql.begin(async (transaction) => {
        const rows = await transaction`
          SELECT r.id, r.workspace_id, r.title, r.survivor_name, r.item_type, r.mime_type,
            r.original_filename, r.byte_size, r.checksum_sha256, r.source_contributor,
            r.original_language, r.consent_rights, r.rights_statement, r.historical_date,
            r.notes, r.tags_json, r.status, r.extraction_status,
            r.previewable, r.created_at, b.scan_status, b.ciphertext, b.nonce,
            b.auth_tag, b.key_version
          FROM demo_archive_records r
          JOIN demo_archive_blobs b ON b.record_id = r.id
          WHERE r.workspace_id = ${input.workspaceId}::uuid
            AND r.id = ${input.recordId}::uuid
          LIMIT 1
          FOR UPDATE OF b
        `;
        const row = rows[0];
        if (!row) return { ok: false, reason: "not-found" } as const;
        const record = mapRecord(row);
        const content = decryptDemoArchiveContent({
          ciphertext: bytes(row.ciphertext),
          nonce: bytes(row.nonce),
          authTag: bytes(row.auth_tag),
          keyVersion: numberValue(row.key_version),
          workspaceId: input.workspaceId,
          recordId: input.recordId,
        });
        const review = reviewLimitedArchiveText(record, content);
        if (!review.ok) {
          return {
            ok: false,
            reason:
              review.reason === "ineligible-format"
                ? "ineligible-format"
                : "unsafe-content",
          } as const;
        }
        if (checksumSha256(content) !== record.checksumSha256) {
          return { ok: false, reason: "unsafe-content" } as const;
        }
        if (record.scanStatus === "blocked") {
          return { ok: false, reason: "blocked" } as const;
        }
        if (record.scanStatus === "cleared") {
          return { ok: true, status: "already-cleared", record } as const;
        }

        await transaction`
          UPDATE demo_archive_blobs
          SET scan_status = 'cleared', updated_at = ${input.reviewedAt}
          WHERE record_id = ${input.recordId}::uuid AND scan_status = 'quarantined'
        `;
        await transaction`
          INSERT INTO demo_archive_audit_events (
            workspace_id, action, record_id, metadata_json, occurred_at
          ) VALUES (
            ${input.workspaceId}::uuid,
            'archive.limited_text_safety_review_cleared',
            ${input.recordId}::uuid,
            ${JSON.stringify({
              reviewerUserId: input.reviewerUserId,
              reviewKind: "limited-utf8-text-safety-review",
              result: "cleared-private-text",
              eligibleExtensions: ["txt", "md"],
              checkedBytes: content.byteLength,
              maximumBytes: DEMO_ARCHIVE_LIMITED_TEXT_REVIEW_MAX_BYTES,
              checks: [
                "recorded-file-family",
                "authenticated-encryption",
                "sha256-integrity",
                "strict-utf8",
                "nul-and-control-characters",
                "bidirectional-control-characters",
              ],
              antivirusScanPerformed: false,
              productionScannerStillRequiredForOtherFormats: true,
            })}::jsonb,
            ${input.reviewedAt}
          )
        `;
        return {
          ok: true,
          status: "cleared",
          record: mapRecord({ ...row, scan_status: "cleared" }),
        } as const;
      });
    },
    async consumeUploadLimit(keys, now, windowSeconds, maximum) {
      await initialize(sql);
      return sql.begin(async (transaction) => {
        let allowed = true;
        let retryAfter = 1;
        for (const key of keys) {
          const rows = await transaction`
            INSERT INTO demo_archive_rate_limits (
              scope_key, window_started_at, request_count, updated_at
            ) VALUES (${key}, ${now}::timestamptz, 1, ${now}::timestamptz)
            ON CONFLICT (scope_key) DO UPDATE SET
              window_started_at = CASE
                WHEN demo_archive_rate_limits.window_started_at <= ${now}::timestamptz - (${windowSeconds} * interval '1 second')
                THEN ${now}::timestamptz
                ELSE demo_archive_rate_limits.window_started_at
              END,
              request_count = CASE
                WHEN demo_archive_rate_limits.window_started_at <= ${now}::timestamptz - (${windowSeconds} * interval '1 second')
                THEN 1
                ELSE demo_archive_rate_limits.request_count + 1
              END,
              updated_at = ${now}::timestamptz
            RETURNING request_count, window_started_at
          `;
          const count = numberValue(rows[0]?.request_count);
          const startedAt = new Date(rows[0]?.window_started_at as string | Date).getTime();
          allowed = allowed && count <= maximum;
          retryAfter = Math.max(
            retryAfter,
            Math.max(1, Math.ceil((startedAt + windowSeconds * 1_000 - now.getTime()) / 1_000)),
          );
        }
        await transaction`
          DELETE FROM demo_archive_rate_limits
          WHERE updated_at < ${new Date(now.getTime() - 2 * 24 * 60 * 60 * 1_000)}::timestamptz
        `;
        return { allowed, retryAfter };
      });
    },
  };
}
