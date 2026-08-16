/**
 * The archive schema is installed by the checked-in Drizzle migration during
 * application startup. Request handlers only verify these tables; they never
 * attempt ad-hoc DDL while handling a curator upload.
 */
export const DEMO_ARCHIVE_REQUIRED_TABLES = [
  "demo_archive_records",
  "demo_archive_blobs",
  "demo_archive_audit_events",
  "demo_archive_idempotency",
  "demo_archive_rate_limits",
] as const;
