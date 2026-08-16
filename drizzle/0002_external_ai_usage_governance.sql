CREATE TABLE "external_ai_usage_reservations" (
  "id" text PRIMARY KEY,
  "actor_id" text NOT NULL,
  "provider" text NOT NULL CHECK ("provider" = 'openai'),
  "model" text NOT NULL,
  "reserved_tokens" integer NOT NULL CHECK ("reserved_tokens" >= 0),
  "created_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_ai_usage_records" (
  "id" text PRIMARY KEY,
  "actor_id" text NOT NULL,
  "provider" text NOT NULL CHECK ("provider" = 'openai'),
  "model" text NOT NULL,
  "input_tokens" integer NOT NULL CHECK ("input_tokens" >= 0),
  "output_tokens" integer NOT NULL CHECK ("output_tokens" >= 0),
  "charged_tokens" integer NOT NULL CHECK ("charged_tokens" >= 0),
  "status" text NOT NULL CHECK ("status" IN ('completed', 'provider-error', 'blocked')),
  "created_at" timestamptz NOT NULL,
  "settled_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX "external_ai_usage_records_created_at_idx"
  ON "external_ai_usage_records" ("created_at");
--> statement-breakpoint
CREATE TABLE "external_ai_usage_alert_claims" (
  "alert_key" text PRIMARY KEY,
  "status" text NOT NULL CHECK ("status" IN ('pending', 'sent')),
  "claimed_at" timestamptz NOT NULL
);
