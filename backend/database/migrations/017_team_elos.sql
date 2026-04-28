-- Migration 017: Team ELOs.
-- One row per (team, scope, season). seasonId=NULL means "all-time" — Phase 4 only
-- writes all-time rows; Phase 8 adds season-bound ELOs as separate rows.
--
-- ELO is the visible number; MMR is the hidden true-skill estimate. Both are integers
-- (deltas from the math module are rounded at the storage boundary).

CREATE TABLE IF NOT EXISTS "teamElos" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "teamId" UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  "gameId" UUID NOT NULL REFERENCES games(id),
  "formatId" UUID NOT NULL REFERENCES "gameFormats"(id),
  "divisionId" UUID REFERENCES divisions(id),
  "seasonId" UUID REFERENCES seasons(id),
  elo INTEGER NOT NULL,
  mmr INTEGER NOT NULL,
  "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
  "matchesWon" INTEGER NOT NULL DEFAULT 0,
  "matchesLost" INTEGER NOT NULL DEFAULT 0,
  "matchesDrawn" INTEGER NOT NULL DEFAULT 0,
  "calibrationCompleteAt" TIMESTAMP,
  "lastMatchAt" TIMESTAMP,
  form JSONB NOT NULL DEFAULT '[]'::jsonb,
  "highestElo" INTEGER NOT NULL,
  "highestMmr" INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_team_elos_updated_at ON "teamElos";
CREATE TRIGGER update_team_elos_updated_at BEFORE UPDATE ON "teamElos"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_team_elos_team_id ON "teamElos"("teamId");
-- Leaderboard workhorse: ordered by visible ELO descending within scope.
CREATE INDEX IF NOT EXISTS idx_team_elos_leaderboard
  ON "teamElos"("gameId", "formatId", "divisionId", elo DESC);
-- Matchmaking workhorse: range-scan by hidden MMR within scope.
CREATE INDEX IF NOT EXISTS idx_team_elos_matchmaking
  ON "teamElos"("gameId", "formatId", "divisionId", mmr);
-- Postgres 15+: NULLS NOT DISTINCT treats seasonId=NULL as a single value, so
-- we never get two "all-time" rows for the same (team, scope) accidentally.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_elos_unique_scope
  ON "teamElos"("teamId", "gameId", "formatId", "divisionId", "seasonId")
  NULLS NOT DISTINCT;
