-- Migration 023: Queue entries.
-- One entry per (team or user) actively waiting for a match in a (game, format).
-- The two partial unique indexes prevent the same team / user being in queue
-- for the same game+format twice. Queueing for different formats simultaneously
-- (e.g., football 5v5 + 7v7) is supported.
--
-- Note: divisionId is intentionally NOT in the unique-index key. A team cannot
-- have two queue entries for the same (game, format) regardless of division —
-- a team is scoped to a specific division at creation time.

CREATE TABLE IF NOT EXISTS "queueEntries" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "teamId" UUID REFERENCES teams(id),
  "userId" UUID REFERENCES "user"(id),
  "gameId" UUID NOT NULL REFERENCES games(id),
  "formatId" UUID NOT NULL REFERENCES "gameFormats"(id),
  "divisionId" UUID REFERENCES divisions(id),
  "mmrAtQueue" INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'matched', 'cancelled', 'expired', 'friendly_offered')),
  "matchedWithEntryId" UUID REFERENCES "queueEntries"(id),
  "matchId" UUID REFERENCES matches(id),
  "preferredCity" VARCHAR(100),
  "preferredVenueId" UUID,
  "queuedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP,
  "matchedAt" TIMESTAMP,
  CONSTRAINT queue_entries_team_xor_user
    CHECK (("teamId" IS NOT NULL AND "userId" IS NULL)
        OR ("teamId" IS NULL AND "userId" IS NOT NULL))
);

-- Workhorse: find waiting entries in a scope, ordered by MMR (matchmaker scan).
CREATE INDEX IF NOT EXISTS idx_queue_active_lookup
  ON "queueEntries"("gameId", "formatId", "divisionId", status, "mmrAtQueue")
  WHERE status = 'waiting';

-- One active queue entry per team per game+format.
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_one_active_per_team
  ON "queueEntries"("teamId", "gameId", "formatId")
  WHERE status = 'waiting' AND "teamId" IS NOT NULL;

-- One active queue entry per user per game+format.
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_one_active_per_user
  ON "queueEntries"("userId", "gameId", "formatId")
  WHERE status = 'waiting' AND "userId" IS NOT NULL;

-- Cleanup query support (scan oldest waiting entries for friendly-offer / expiry).
CREATE INDEX IF NOT EXISTS idx_queue_expiry
  ON "queueEntries"("queuedAt")
  WHERE status = 'waiting';
