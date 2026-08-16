CREATE TABLE IF NOT EXISTS "vots_survivor_registry" (
  "id" varchar(160) PRIMARY KEY,
  "first_name" varchar(120) NOT NULL DEFAULT '',
  "last_name" varchar(120) NOT NULL DEFAULT '',
  "title" varchar(40) NOT NULL DEFAULT '',
  "generation" varchar(40) NOT NULL DEFAULT 'unclassified',
  "generation_raw" varchar(80) NOT NULL DEFAULT '',
  "family_thread" varchar(160) NOT NULL DEFAULT '',
  "family_key" varchar(160) NOT NULL DEFAULT '',
  "country_of_origin" varchar(160) NOT NULL DEFAULT '',
  "date_of_birth" varchar(40) NOT NULL DEFAULT '',
  "date_of_death" varchar(40) NOT NULL DEFAULT '',
  "camps" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "fate_notes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "address" varchar(160) NOT NULL DEFAULT '',
  "city" varchar(160) NOT NULL DEFAULT '',
  "state" varchar(40) NOT NULL DEFAULT '',
  "zip" varchar(20) NOT NULL DEFAULT '',
  "email" varchar(160) NOT NULL DEFAULT '',
  "phone" varchar(60) NOT NULL DEFAULT '',
  "deceased" boolean NOT NULL DEFAULT false,
  "deceased_source" varchar(40) NOT NULL DEFAULT '',
  "notes" text NOT NULL DEFAULT '',
  "source" varchar(24) NOT NULL DEFAULT 'workbook-import',
  "created_at" varchar(40) NOT NULL DEFAULT '',
  "updated_at" varchar(40) NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vots_survivor_registry_family_key_idx"
  ON "vots_survivor_registry" ("family_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vots_survivor_registry_generation_idx"
  ON "vots_survivor_registry" ("generation");
