CREATE TABLE "demo_archive_settings" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_archive_records" (
  "id" uuid PRIMARY KEY,
  "workspace_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "title" varchar(180) NOT NULL,
  "survivor_name" varchar(160) NOT NULL,
  "item_type" varchar(24) NOT NULL CHECK ("item_type" IN ('document', 'photograph', 'audio', 'video')),
  "mime_type" varchar(180) NOT NULL,
  "original_filename" varchar(240) NOT NULL,
  "byte_size" integer NOT NULL CHECK ("byte_size" > 0 AND "byte_size" <= 8388608),
  "checksum_sha256" varchar(64) NOT NULL,
  "source_contributor" varchar(240) NOT NULL,
  "original_language" varchar(80) NOT NULL,
  "consent_rights" varchar(120) NOT NULL,
  "rights_statement" text NOT NULL,
  "historical_date" varchar(80),
  "notes" text,
  "tags_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "visibility" varchar(16) NOT NULL CHECK ("visibility" = 'private'),
  "status" varchar(32) NOT NULL,
  "extraction_status" varchar(40) NOT NULL,
  "previewable" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  UNIQUE ("workspace_id", "checksum_sha256")
);
--> statement-breakpoint
CREATE INDEX "demo_archive_workspace_created_idx"
  ON "demo_archive_records" ("workspace_id", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE TABLE "demo_archive_blobs" (
  "record_id" uuid PRIMARY KEY REFERENCES "demo_archive_records"("id") ON DELETE CASCADE,
  "ciphertext" bytea NOT NULL,
  "nonce" bytea NOT NULL CHECK (octet_length("nonce") = 12),
  "auth_tag" bytea NOT NULL CHECK (octet_length("auth_tag") = 16),
  "key_version" integer NOT NULL CHECK ("key_version" > 0),
  "scan_status" varchar(24) NOT NULL DEFAULT 'quarantined'
    CHECK ("scan_status" IN ('quarantined', 'cleared', 'blocked')),
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_archive_audit_events" (
  "id" bigserial PRIMARY KEY,
  "workspace_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "action" varchar(80) NOT NULL,
  "record_id" uuid REFERENCES "demo_archive_records"("id") ON DELETE SET NULL,
  "metadata_json" jsonb NOT NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "demo_archive_audit_workspace_time_idx"
  ON "demo_archive_audit_events" ("workspace_id", "occurred_at" DESC);
--> statement-breakpoint
CREATE TABLE "demo_archive_idempotency" (
  "workspace_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "idempotency_key" uuid NOT NULL,
  "request_fingerprint" varchar(64) NOT NULL,
  "record_id" uuid NOT NULL REFERENCES "demo_archive_records"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("workspace_id", "idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "demo_archive_rate_limits" (
  "scope_key" varchar(220) PRIMARY KEY,
  "window_started_at" timestamptz NOT NULL,
  "request_count" integer NOT NULL CHECK ("request_count" > 0),
  "updated_at" timestamptz NOT NULL
);
