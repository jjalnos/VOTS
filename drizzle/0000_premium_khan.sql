CREATE TYPE "public"."archive_language" AS ENUM('en', 'es', 'other');--> statement-breakpoint
CREATE TYPE "public"."decision_type" AS ENUM('approve', 'reject', 'request_changes');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('draft', 'published', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'in_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."role_name" AS ENUM('admin', 'curator', 'family');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('suggested', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('private', 'family', 'public');--> statement-breakpoint
CREATE TABLE "archive_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survivor_id" uuid,
	"family_id" uuid,
	"title" varchar(180) NOT NULL,
	"item_type" varchar(32) NOT NULL,
	"source_contributor" varchar(240) NOT NULL,
	"original_language" "archive_language" NOT NULL,
	"consent_rights" varchar(40) NOT NULL,
	"rights_statement" text NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(120) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" uuid,
	"family_id" uuid,
	"metadata" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(60) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"requested_by" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"locale" "archive_language" NOT NULL,
	"visitor_token_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extracted_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archive_item_id" uuid NOT NULL,
	"field" varchar(120) NOT NULL,
	"value" jsonb NOT NULL,
	"confidence" real,
	"source_locator" text NOT NULL,
	"status" "suggestion_status" DEFAULT 'suggested' NOT NULL,
	"generated_by" varchar(32) NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(240) NOT NULL,
	"invitation_only" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_memberships" (
	"family_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invited_by" uuid,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "family_memberships_family_id_user_id_pk" PRIMARY KEY("family_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "file_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archive_item_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"storage_provider" varchar(40) NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"media_type" varchar(180) NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" uuid NOT NULL,
	"locale" "archive_language" NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"source_ids" jsonb NOT NULL,
	"rights_snapshot" text NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"survivor_id" uuid NOT NULL,
	"related_user_id" uuid,
	"relationship_label" jsonb NOT NULL,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" uuid NOT NULL,
	"decision" "decision_type" NOT NULL,
	"rationale" text NOT NULL,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"publisher" text NOT NULL,
	"url" text,
	"citation" jsonb NOT NULL,
	"approval_status" "review_status" DEFAULT 'pending' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(180) NOT NULL,
	"survivor_id" uuid,
	"family_id" uuid,
	"title" jsonb NOT NULL,
	"dek" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"source_ids" jsonb NOT NULL,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survivors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(180) NOT NULL,
	"family_id" uuid NOT NULL,
	"display_name" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"original_language" "archive_language" NOT NULL,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"is_demonstration" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survivor_id" uuid,
	"family_id" uuid,
	"date_label" jsonb NOT NULL,
	"sort_date" timestamp with time zone,
	"title" jsonb NOT NULL,
	"description" jsonb NOT NULL,
	"source_ids" jsonb NOT NULL,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "role_name" NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(180) NOT NULL,
	"password_hash" text,
	"mfa_required" boolean DEFAULT false NOT NULL,
	"mfa_provider_reference" text,
	"active" boolean DEFAULT true NOT NULL,
	"invited_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "archive_items" ADD CONSTRAINT "archive_items_survivor_id_survivors_id_fk" FOREIGN KEY ("survivor_id") REFERENCES "public"."survivors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_items" ADD CONSTRAINT "archive_items_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_items" ADD CONSTRAINT "archive_items_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_facts" ADD CONSTRAINT "extracted_facts_archive_item_id_archive_items_id_fk" FOREIGN KEY ("archive_item_id") REFERENCES "public"."archive_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_facts" ADD CONSTRAINT "extracted_facts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_memberships" ADD CONSTRAINT "family_memberships_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_memberships" ADD CONSTRAINT "family_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_memberships" ADD CONSTRAINT "family_memberships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_archive_item_id_archive_items_id_fk" FOREIGN KEY ("archive_item_id") REFERENCES "public"."archive_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_releases" ADD CONSTRAINT "public_releases_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_survivor_id_survivors_id_fk" FOREIGN KEY ("survivor_id") REFERENCES "public"."survivors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_related_user_id_users_id_fk" FOREIGN KEY ("related_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_survivor_id_survivors_id_fk" FOREIGN KEY ("survivor_id") REFERENCES "public"."survivors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survivors" ADD CONSTRAINT "survivors_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survivors" ADD CONSTRAINT "survivors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_survivor_id_survivors_id_fk" FOREIGN KEY ("survivor_id") REFERENCES "public"."survivors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "archive_items_survivor_idx" ON "archive_items" USING btree ("survivor_id");--> statement-breakpoint
CREATE INDEX "archive_items_family_idx" ON "archive_items" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "archive_items_visibility_review_idx" ON "archive_items" USING btree ("visibility","review_status");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_occurred_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "background_jobs_status_created_idx" ON "background_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "chat_sessions_last_active_idx" ON "chat_sessions" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "extracted_facts_item_status_idx" ON "extracted_facts" USING btree ("archive_item_id","status");--> statement-breakpoint
CREATE INDEX "families_name_idx" ON "families" USING btree ("name");--> statement-breakpoint
CREATE INDEX "family_memberships_user_idx" ON "family_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_versions_item_version_unique" ON "file_versions" USING btree ("archive_item_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "public_releases_entity_locale_unique" ON "public_releases" USING btree ("entity_type","entity_id","locale");--> statement-breakpoint
CREATE INDEX "public_releases_status_idx" ON "public_releases" USING btree ("status","locale");--> statement-breakpoint
CREATE INDEX "relationships_family_idx" ON "relationships" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "relationships_survivor_idx" ON "relationships" USING btree ("survivor_id");--> statement-breakpoint
CREATE INDEX "review_decisions_entity_idx" ON "review_decisions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "sources_approval_idx" ON "sources" USING btree ("approval_status");--> statement-breakpoint
CREATE UNIQUE INDEX "stories_slug_unique" ON "stories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "stories_review_idx" ON "stories" USING btree ("review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "survivors_slug_unique" ON "survivors" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "survivors_family_idx" ON "survivors" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "survivors_review_idx" ON "survivors" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "timeline_events_review_sort_idx" ON "timeline_events" USING btree ("review_status","sort_date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");