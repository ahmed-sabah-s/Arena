-- Migration 018: Player ELOs.
-- Applies to games where eloOwner='individual' (currently only chess).
-- Same column shape as teamElos. Kept as a separate table rather than a polymorphic
-- elos table for cleaner queries and different lifecycle (users persist; teams disband).

CREATE TABLE IF NOT EXISTS "playerElos" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES "user"(id),
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

DROP TRIGGER IF EXISTS update_player_elos_updated_at ON "playerElos";
CREATE TRIGGER update_player_elos_updated_at BEFORE UPDATE ON "playerElos"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_player_elos_user_id ON "playerElos"("userId");
CREATE INDEX IF NOT EXISTS idx_player_elos_leaderboard
  ON "playerElos"("gameId", "formatId", "divisionId", elo DESC);
CREATE INDEX IF NOT EXISTS idx_player_elos_matchmaking
  ON "playerElos"("gameId", "formatId", "divisionId", mmr);
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_elos_unique_scope
  ON "playerElos"("userId", "gameId", "formatId", "divisionId", "seasonId")
  NULLS NOT DISTINCT;
