-- Migration 028: Referee conflict-of-interest declarations.
-- A referee can self-declare a conflict against a specific team OR a specific
-- user. The XOR CHECK enforces exactly one of the two FKs is set per row.
-- Conflicts soft-delete via `removedAt` so historical declarations stay
-- auditable; the partial unique indexes prevent declaring the same active
-- conflict twice but allow re-declaration after removal.
--
-- This table only stores *explicit* conflicts. The implicit conflict —
-- "a referee can't officiate a match where they are an active member of
-- either participating team" — is enforced in code at assignment time.

CREATE TABLE IF NOT EXISTS "refereeConflicts" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "refereeUserId" UUID NOT NULL REFERENCES "user"(id),
  "conflictedTeamId" UUID REFERENCES teams(id),
  "conflictedUserId" UUID REFERENCES "user"(id),
  reason TEXT,
  "declaredAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP,
  CONSTRAINT referee_conflicts_team_xor_user
    CHECK (("conflictedTeamId" IS NOT NULL AND "conflictedUserId" IS NULL)
        OR ("conflictedTeamId" IS NULL AND "conflictedUserId" IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_referee_conflicts_active_referee
  ON "refereeConflicts"("refereeUserId")
  WHERE "removedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_referee_conflicts_unique_team
  ON "refereeConflicts"("refereeUserId", "conflictedTeamId")
  WHERE "removedAt" IS NULL AND "conflictedTeamId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_referee_conflicts_unique_user
  ON "refereeConflicts"("refereeUserId", "conflictedUserId")
  WHERE "removedAt" IS NULL AND "conflictedUserId" IS NOT NULL;
