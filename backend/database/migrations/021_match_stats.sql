-- Migration 021: Match stat logs, reconciled match stats, and match submissions.
--
-- Three tables:
--  - matchStatLogs:    raw per-stat-keeper events. One row per logged event.
--  - matchStats:       reconciled ledger after match resolution. One row per
--                      verified-or-unverified stat. Read by leaderboards / profiles.
--  - matchSubmissions: each side's final-score claim. Both sides agreeing locks
--                      the match; disagreement opens a dispute.

CREATE TABLE IF NOT EXISTS "matchStatLogs" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "matchId" UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  "loggedByUserId" UUID NOT NULL REFERENCES "user"(id),
  side VARCHAR(1) NOT NULL CHECK (side IN ('A', 'B')),
  "statKey" VARCHAR(50) NOT NULL,
  "statValue" JSONB NOT NULL,
  minute INT,
  "playerId" UUID REFERENCES "user"(id),
  "recordedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_match_stat_logs_match
  ON "matchStatLogs"("matchId");
CREATE INDEX IF NOT EXISTS idx_match_stat_logs_match_side
  ON "matchStatLogs"("matchId", side);

-- ─── matchStats ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "matchStats" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "matchId" UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  side VARCHAR(1) NOT NULL CHECK (side IN ('A', 'B')),
  "statKey" VARCHAR(50) NOT NULL,
  "statValue" JSONB NOT NULL,
  minute INT,
  "playerId" UUID REFERENCES "user"(id),
  "verificationStatus" VARCHAR(20) NOT NULL DEFAULT 'unverified'
    CHECK ("verificationStatus" IN ('verified', 'unverified', 'referee_recorded')),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_match_stats_match
  ON "matchStats"("matchId");
CREATE INDEX IF NOT EXISTS idx_match_stats_player
  ON "matchStats"("playerId")
  WHERE "playerId" IS NOT NULL;

-- ─── matchSubmissions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "matchSubmissions" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "matchId" UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  side VARCHAR(1) NOT NULL CHECK (side IN ('A', 'B')),
  "submittedByUserId" UUID NOT NULL REFERENCES "user"(id),
  "scoreA" INTEGER NOT NULL,
  "scoreB" INTEGER NOT NULL,
  "submittedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

-- One submission per (match, side). Service layer handles upsert/edit semantics.
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_submissions_match_side
  ON "matchSubmissions"("matchId", side);
CREATE INDEX IF NOT EXISTS idx_match_submissions_match
  ON "matchSubmissions"("matchId");
