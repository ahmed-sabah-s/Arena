-- Migration 020: Matches and match participants.
--
-- A match represents a single contest. Two participants per match (sides A and B),
-- each either a team or a single user (xor enforced at the participant level).
-- ELO is calculated using the snapshot mmrAtMatch / eloAtMatch / matchesPlayedAtMatch
-- on the participant rows — never current values — so concurrent match resolutions
-- can't compound on stale state.
--
-- venueId is nullable here; FK to venues(id) is added in Phase 7's first migration.
-- seasonId is nullable; Phase 8 introduces seasons.

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "gameId" UUID NOT NULL REFERENCES games(id),
  "formatId" UUID NOT NULL REFERENCES "gameFormats"(id),
  "divisionId" UUID REFERENCES divisions(id),
  "seasonId" UUID REFERENCES seasons(id),
  "matchMode" VARCHAR(20) NOT NULL
    CHECK ("matchMode" IN ('refereed', 'player_stats', 'score_only')),
  stakes VARCHAR(20) NOT NULL DEFAULT 'ranked'
    CHECK (stakes IN ('ranked', 'friendly')),
  -- VARCHAR(30) to fit 'awaiting_confirmation' (21 chars) plus headroom.
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'active', 'awaiting_confirmation', 'completed', 'disputed', 'cancelled', 'voided', 'forfeited')),
  "venueId" UUID,
  "scheduledAt" TIMESTAMP NOT NULL,
  "startedAt" TIMESTAMP,
  "completedAt" TIMESTAMP,
  "finalScoreA" INTEGER,
  "finalScoreB" INTEGER,
  "creationSource" VARCHAR(20) NOT NULL
    CHECK ("creationSource" IN ('queue', 'qr_invite', 'admin_created')),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_matches_updated_at ON matches;
CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Lookups by status + scheduled time (admin / forfeit-sweep)
CREATE INDEX IF NOT EXISTS idx_matches_status
  ON matches(status, "scheduledAt");
-- Within-scope listings (recent matches in a game/format/division)
CREATE INDEX IF NOT EXISTS idx_matches_game_scope
  ON matches("gameId", "formatId", "divisionId", status);
-- Active-match dashboards
CREATE INDEX IF NOT EXISTS idx_matches_active
  ON matches(status, "scheduledAt")
  WHERE status IN ('scheduled', 'active', 'awaiting_confirmation');

-- ─── matchParticipants ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "matchParticipants" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "matchId" UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  side VARCHAR(1) NOT NULL CHECK (side IN ('A', 'B')),
  "teamId" UUID REFERENCES teams(id),
  "userId" UUID REFERENCES "user"(id),
  "statKeeperUserId" UUID REFERENCES "user"(id),
  "mmrAtMatch" INTEGER NOT NULL,
  "eloAtMatch" INTEGER NOT NULL,
  "matchesPlayedAtMatch" INTEGER NOT NULL,
  CONSTRAINT match_participants_team_xor_user
    CHECK (("teamId" IS NOT NULL AND "userId" IS NULL)
        OR ("teamId" IS NULL AND "userId" IS NOT NULL))
);

-- Exactly one row per side per match
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_participants_match_side
  ON "matchParticipants"("matchId", side);
-- Lookups by team (team profile / leaderboard)
CREATE INDEX IF NOT EXISTS idx_match_participants_team
  ON "matchParticipants"("teamId")
  WHERE "teamId" IS NOT NULL;
-- Lookups by user (player history for individual games)
CREATE INDEX IF NOT EXISTS idx_match_participants_user
  ON "matchParticipants"("userId")
  WHERE "userId" IS NOT NULL;
