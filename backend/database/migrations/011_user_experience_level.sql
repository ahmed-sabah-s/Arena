-- Migration 011: experienceLevel column on user.
-- Captured at onboarding; mapped to a starting MMR seed in Phase 3 when player_elos exists.

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "experienceLevel" VARCHAR(20)
    CHECK ("experienceLevel" IN ('beginner','intermediate','advanced','expert'));
