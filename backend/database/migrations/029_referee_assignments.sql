-- Migration 029: Referee assignments + captain flags + tunable platformConfig keys.
--
-- This migration covers the full Phase 6 referee-assignment lifecycle:
--   - `refereeAssignments` rows track main + assistant officiating slots per
--     match, with one active main per match enforced by a partial unique index.
--   - `refereeCaptainFlags` rows accumulate post-match captain complaints
--     about officiating quality. Different from disputes (which contest the
--     score); a match can have either, both, or neither.
--   - The `platformConfig` inserts at the bottom expose every Phase-6
--     tunable: same-team frequency limits, no-show penalties, reclaim grace,
--     flag thresholds, and the master payments-enabled feature flag (off).

CREATE TABLE IF NOT EXISTS "refereeAssignments" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "matchId" UUID NOT NULL REFERENCES matches(id),
  "refereeUserId" UUID NOT NULL REFERENCES "user"(id),
  role VARCHAR(20) NOT NULL
    CHECK (role IN ('main', 'assistant')),
  status VARCHAR(20) NOT NULL DEFAULT 'assigned'
    CHECK (status IN (
      'assigned', 'accepted', 'declined',
      'checked_in', 'no_show', 'promoted',
      'completed', 'cancelled'
    )),
  "assignedByUserId" UUID NOT NULL REFERENCES "user"(id),
  "assignedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP,
  "checkedInAt" TIMESTAMP,
  "promotedAt" TIMESTAMP,
  "promotedFromAssignmentId" UUID REFERENCES "refereeAssignments"(id),
  "declineReason" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_referee_assignments_updated_at ON "refereeAssignments";
CREATE TRIGGER update_referee_assignments_updated_at BEFORE UPDATE ON "refereeAssignments"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_referee_assignments_match
  ON "refereeAssignments"("matchId");

CREATE INDEX IF NOT EXISTS idx_referee_assignments_referee
  ON "refereeAssignments"("refereeUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_referee_assignments_pending_response
  ON "refereeAssignments"("matchId", status)
  WHERE status = 'assigned';

-- One active main per match. Auto-promotion must flip the old main to
-- 'no_show' BEFORE the assistant gets 'main' status to avoid violating this
-- index — same dance as Phase 3's captain transfer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_referee_assignments_one_active_main
  ON "refereeAssignments"("matchId")
  WHERE role = 'main' AND status IN ('assigned', 'accepted', 'checked_in');

-- ─── Captain flags ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "refereeCaptainFlags" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "matchId" UUID NOT NULL REFERENCES matches(id),
  "refereeUserId" UUID NOT NULL REFERENCES "user"(id),
  "flaggedByUserId" UUID NOT NULL REFERENCES "user"(id),
  "flaggedBySide" VARCHAR(1) NOT NULL CHECK ("flaggedBySide" IN ('A', 'B')),
  reason VARCHAR(50) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewed', 'upheld', 'dismissed')),
  "reviewedByUserId" UUID REFERENCES "user"(id),
  "reviewedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referee_captain_flags_referee
  ON "refereeCaptainFlags"("refereeUserId", "createdAt" DESC);

-- One flag per (match, referee, captain). A captain can't pile multiple
-- flags onto the same ref for the same match.
CREATE UNIQUE INDEX IF NOT EXISTS idx_referee_captain_flags_unique
  ON "refereeCaptainFlags"("matchId", "refereeUserId", "flaggedByUserId");

-- ─── Phase-6-specific platformConfig keys ──────────────────────────────────
-- Most referee tunables (same-team limit, conflict window, offense window,
-- offense penalties, check-in / promote minutes-before, payments-enabled flag,
-- match fee) were already seeded by migration 004's platformConfig baseline.
-- Phase 6 only adds the captain-flag review threshold + window, which the
-- assignment service uses to decide when to notify admins about a piling-up
-- referee. Existing keys are preserved as-is — no value drift across phases.

INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  (
    'referee_flag_review_threshold',
    '3'::jsonb,
    'integer',
    'referees',
    'Number of captain flags within referee_flag_window_days that triggers an admin-attention notification on the affected referee.'
  ),
  (
    'referee_flag_window_days',
    '30'::jsonb,
    'integer',
    'referees',
    'Sliding-window length (days) for the captain-flag accumulation count used by the admin-attention threshold.'
  )
ON CONFLICT (key) DO NOTHING;
