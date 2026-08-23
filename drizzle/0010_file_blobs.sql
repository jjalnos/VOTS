-- Original upload bytes for the "postgres" media storage provider, so the
-- archive can accept family and administrator uploads without a filesystem
-- the panel-only host cannot guarantee. The row id equals
-- file_versions.storage_key; there is no foreign key because bytes are stored
-- before the metadata row, with the API route deleting the blob again when
-- metadata persistence fails.
CREATE TABLE IF NOT EXISTS "file_blobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bytes" bytea NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_blobs" ADD CONSTRAINT "file_blobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
