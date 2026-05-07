-- Migration 022: Disputes.
-- Phase 5 opens disputes when conditions warrant (score disagreement, manual
-- dispute filing). Phase 8 builds the admin resolution flow that closes them.
-- A match can have at most one open dispute at a time (partial unique index below).

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "matchId" UUID NOT NULL REFERENCES matches(id),
  "openedByUserId" UUID NOT NULL REFERENCES "user"(id),
  "openedBySide" VARCHAR(1) NOT NULL CHECK ("openedBySide" IN ('A', 'B')),
  reason TEXT NOT NULL,
  "claimedScoreA" INTEGER,
  "claimedScoreB" INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution VARCHAR(50),
  "resolvedByUserId" UUID REFERENCES "user"(id),
  "resolvedAt" TIMESTAMP,
  "resolutionNotes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_disputes_updated_at ON disputes;
CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_disputes_match ON disputes("matchId");
-- Admin queue: oldest open disputes first.
CREATE INDEX IF NOT EXISTS idx_disputes_open
  ON disputes("createdAt")
  WHERE status = 'open';
-- A match has at most one open dispute at a time. Partial unique index enforces.
CREATE UNIQUE INDEX IF NOT EXISTS idx_disputes_one_open_per_match
  ON disputes("matchId")
  WHERE status = 'open';
