-- Email delivery log: one row per message handed to (or refused by) the mail
-- transport. Bodies are stored AFTER one-time links are removed; the tracking
-- pixel is never stored; only a SHA-256 of the pixel token is kept, so a row
-- can never be turned back into a working open-tracking URL.
CREATE TABLE IF NOT EXISTS "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_type" varchar(40) NOT NULL,
	"status" varchar(16) NOT NULL,
	"transport" varchar(16) DEFAULT 'smtp' NOT NULL,
	"failure_reason" varchar(120),
	"recipient_email" varchar(320),
	"recipient_name" varchar(180),
	"recipient_user_id" uuid,
	"communication_id" uuid,
	"actor_user_id" uuid,
	"locale" varchar(2),
	"subject" varchar(200) NOT NULL,
	"reply_to" varchar(320),
	"text_body" text NOT NULL,
	"html_body" text,
	"metadata" jsonb,
	"tracking_token_hash" varchar(64),
	"opened_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"open_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_status_check" CHECK ("status" IN ('sent', 'failed')),
	CONSTRAINT "email_log_open_count_check" CHECK ("open_count" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_log" ADD CONSTRAINT "email_log_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_log" ADD CONSTRAINT "email_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_log" ADD CONSTRAINT "email_log_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_log_created_idx" ON "email_log" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_log_status_created_idx" ON "email_log" ("status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_log_type_created_idx" ON "email_log" ("email_type", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_log_opened_idx" ON "email_log" ("opened_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_log_communication_idx" ON "email_log" ("communication_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_log_tracking_token_hash_idx" ON "email_log" ("tracking_token_hash") WHERE "tracking_token_hash" IS NOT NULL;
