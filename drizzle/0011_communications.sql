-- One outbound message from the archive to its people. The recipients jsonb
-- is a point-in-time snapshot of who the message went to and how each
-- delivery ended; account rows may change later, the record of the send
-- may not.
CREATE TABLE IF NOT EXISTS "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" varchar(20) NOT NULL,
	"subject" varchar(150) NOT NULL,
	"body" text NOT NULL,
	"link_label" varchar(80),
	"link_url" text,
	"locale" varchar(2) NOT NULL,
	"recipients" jsonb NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"sent_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "communications" ADD CONSTRAINT "communications_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communications_created_idx" ON "communications" ("created_at");
