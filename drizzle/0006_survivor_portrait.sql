-- A photograph may only appear beside a survivor with its provenance attached:
-- who supplied it and under what permission. All three columns move together.
ALTER TABLE "survivors" ADD COLUMN IF NOT EXISTS "portrait_url" text;
--> statement-breakpoint
ALTER TABLE "survivors" ADD COLUMN IF NOT EXISTS "portrait_credit" text;
--> statement-breakpoint
ALTER TABLE "survivors" ADD COLUMN IF NOT EXISTS "portrait_rights" text;
