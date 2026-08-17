-- A read-only account type for showing the survivor registry. It carries no
-- archive-workspace permission, and the application redacts living people's
-- contact details from every response it receives.
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'viewer';
