-- Migration 015: Team creation log.
-- Auxiliary append-only event log for cooldown enforcement.
-- One row per team creation OR captain disband event. Drives:
--   - team_creation_cooldown_days (max creates per window)
--   - captain_disband_cooldown_days (cooldown between disband and next create)

CREATE TABLE IF NOT EXISTS "teamCreationLog" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES "user"(id),
  "gameId" UUID NOT NULL REFERENCES games(id),
  "teamId" UUID NOT NULL REFERENCES teams(id),
  action VARCHAR(20) NOT NULL CHECK (action IN ('created', 'disbanded')),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tcl_user_game_recent
  ON "teamCreationLog" ("userId", "gameId", "createdAt" DESC);
