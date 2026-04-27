-- Migration 013: Teams table.
-- A team belongs to one game + format + division. Captains and members live in teamMembers.
-- Disbanded teams are kept for historical match records (status='disbanded' + disbandedAt).

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "gameId" UUID NOT NULL REFERENCES games(id),
  "formatId" UUID NOT NULL REFERENCES "gameFormats"(id),
  "divisionId" UUID REFERENCES divisions(id),
  "captainId" UUID NOT NULL REFERENCES "user"(id),
  name VARCHAR(100) NOT NULL,
  "nameAr" VARCHAR(100),
  slug VARCHAR(100) NOT NULL,
  city VARCHAR(100),
  "badgeFileId" UUID REFERENCES file(id),
  "primaryColor" VARCHAR(7),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disbanded')),
  "foundedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disbandedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("gameId", slug)
);

DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_teams_game_id ON teams("gameId");
CREATE INDEX IF NOT EXISTS idx_teams_captain_id ON teams("captainId");
-- Workhorse for matchmaking and active-team lookups.
CREATE INDEX IF NOT EXISTS idx_teams_active
  ON teams("gameId", "formatId", "divisionId", status)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_teams_city ON teams(city) WHERE city IS NOT NULL;
