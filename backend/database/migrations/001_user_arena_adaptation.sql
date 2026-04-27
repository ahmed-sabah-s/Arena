-- Migration 001: Adapt the user table for Arena.
-- Relaxes email/password constraints (phone-first auth comes in Phase 2)
-- while keeping the existing email/password auth path functional.
-- Adds Arena-specific profile columns and soft-delete support.

-- Make email nullable (phone becomes the primary identifier in Phase 2)
ALTER TABLE "user" ALTER COLUMN email DROP NOT NULL;

-- Make password nullable (OTP auth doesn't use a password)
ALTER TABLE "user" ALTER COLUMN password DROP NOT NULL;

-- Backfill NULL phone values before setting NOT NULL.
-- Any existing rows (template seed users) get a synthetic placeholder phone.
-- These are replaced by the dev seed after db:reset, so correctness doesn't matter.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn
  FROM "user"
  WHERE phone IS NULL
)
UPDATE "user" u
SET phone = CONCAT('+96475', LPAD(r.rn::text, 8, '0'))
FROM ranked r
WHERE u.id = r.id;

ALTER TABLE "user" ALTER COLUMN phone SET NOT NULL;
ALTER TABLE "user" ADD CONSTRAINT user_phone_unique UNIQUE (phone);

-- Arena profile columns
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "fullName" VARCHAR(255);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS gender VARCHAR(20)
  CHECK (gender IN ('male', 'female', 'prefer_not_say'));
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS country VARCHAR(2) NOT NULL DEFAULT 'IQ';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "preferredLanguage" VARCHAR(2) NOT NULL DEFAULT 'ar'
  CHECK ("preferredLanguage" IN ('ar', 'en'));
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "preferredCurrency" VARCHAR(3) NOT NULL DEFAULT 'IQD';
-- FK to currencies(code) deferred to migration 002 (currencies table doesn't exist yet).

-- Soft delete
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_phone ON "user"(phone);
CREATE INDEX IF NOT EXISTS idx_user_country ON "user"(country);
CREATE INDEX IF NOT EXISTS idx_user_city ON "user"(city);
CREATE INDEX IF NOT EXISTS idx_user_active ON "user"(id) WHERE "deletedAt" IS NULL;
