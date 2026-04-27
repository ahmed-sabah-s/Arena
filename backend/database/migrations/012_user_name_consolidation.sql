-- Migration 012: Consolidate user.name and user."fullName".
-- Drops the legacy `name` column from the template baseline.
-- fullName becomes the single non-null name field going forward.

-- Defensive backfill: any rows where fullName is NULL inherit name's value.
UPDATE "user" SET "fullName" = name WHERE "fullName" IS NULL AND name IS NOT NULL;

-- All rows now have fullName; enforce NOT NULL.
ALTER TABLE "user" ALTER COLUMN "fullName" SET NOT NULL;

-- Drop the legacy column.
ALTER TABLE "user" DROP COLUMN IF EXISTS name;
