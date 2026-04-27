-- Migration 010: User auth-state columns.
-- phoneVerifiedAt — set when a user verifies their phone via OTP (registration or phone change).
-- onboardingCompletedAt — set when the user has filled in their onboarding fields.

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP;

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP;
