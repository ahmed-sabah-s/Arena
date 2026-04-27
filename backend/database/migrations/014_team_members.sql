-- Migration 014: Team members.
-- Denormalized scope columns (gameId, formatId, divisionId) duplicate the parent team's
-- scope so the partial unique index "one active team per scope per user" is enforced
-- by SQL alone, with no triggers.
--
-- NOTE: The partial unique index treats NULL divisionId values as distinct (Postgres
-- default). For all current games (football, dominoes), divisionId is never NULL, so
-- this is fine. If a future game has no division concept, revisit this constraint.

CREATE TABLE IF NOT EXISTS "teamMembers" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "teamId" UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "user"(id),
  "gameId" UUID NOT NULL REFERENCES games(id),
  "formatId" UUID NOT NULL REFERENCES "gameFormats"(id),
  "divisionId" UUID REFERENCES divisions(id),
  "isCaptain" BOOLEAN NOT NULL DEFAULT false,
  position VARCHAR(50),
  "shirtNumber" INT,
  "joinedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP,
  "releaseReason" VARCHAR(50)
    CHECK ("releaseReason" IS NULL
      OR "releaseReason" IN ('left', 'released_by_captain', 'team_disbanded', 'admin_action')),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_team_members_updated_at ON "teamMembers";
CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON "teamMembers"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- One active team per (user, game, format, division)
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_one_active
  ON "teamMembers" ("userId", "gameId", "formatId", "divisionId")
  WHERE "releasedAt" IS NULL;

-- One captain per active team
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_one_captain
  ON "teamMembers" ("teamId")
  WHERE "isCaptain" = true AND "releasedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_team_id
  ON "teamMembers" ("teamId");
CREATE INDEX IF NOT EXISTS idx_team_members_user_id
  ON "teamMembers" ("userId");
CREATE INDEX IF NOT EXISTS idx_team_members_active
  ON "teamMembers" ("userId", "gameId", "formatId")
  WHERE "releasedAt" IS NULL;
