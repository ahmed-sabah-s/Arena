-- Migration 026: Referee profiles.
-- One profile per user with the `referee` role. Holds the data side of being a
-- referee: reliability score, base city, accept-assignments toggle, bio, and
-- cumulative officiating counters used by analytics + the Phase 8
-- auto-assignment algorithm. The role itself is granted via the existing
-- userRole / role / permission tables; this profile is the data layer on top.

CREATE TABLE IF NOT EXISTS "refereeProfiles" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL UNIQUE REFERENCES "user"(id),
  "reliabilityScore" DECIMAL(3, 2) NOT NULL DEFAULT 5.00
    CHECK ("reliabilityScore" >= 0 AND "reliabilityScore" <= 5),
  "totalMatchesOfficiated" INTEGER NOT NULL DEFAULT 0,
  "totalNoShows" INTEGER NOT NULL DEFAULT 0,
  "totalCaptainFlags" INTEGER NOT NULL DEFAULT 0,
  "baseCity" VARCHAR(100),
  "isAcceptingAssignments" BOOLEAN NOT NULL DEFAULT true,
  "lastOfficiatedAt" TIMESTAMP,
  bio TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_referee_profiles_updated_at ON "refereeProfiles";
CREATE TRIGGER update_referee_profiles_updated_at BEFORE UPDATE ON "refereeProfiles"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_referee_profiles_accepting
  ON "refereeProfiles"("isAcceptingAssignments")
  WHERE "isAcceptingAssignments" = true;

CREATE INDEX IF NOT EXISTS idx_referee_profiles_city
  ON "refereeProfiles"("baseCity")
  WHERE "baseCity" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referee_profiles_reliability
  ON "refereeProfiles"("reliabilityScore" DESC)
  WHERE "isAcceptingAssignments" = true;
