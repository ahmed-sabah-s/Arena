-- Migration 032: Venue availability — recurring weekly schedule + blackouts.
--
-- Two tables:
--  - venueAvailabilityRules: weekly recurring open/close windows per day-of-week.
--    Multiple rows can exist for the same (venue, day) to support split shifts
--    (e.g., open 9-13 and 16-22 = two rows on the same dayOfWeek).
--  - venueAvailabilityBlackouts: one-off exception ranges (holidays, private
--    events, maintenance). Blackouts ALWAYS override rules: a timestamp inside
--    a blackout is closed even if a rule says open.
--
-- dayOfWeek follows Postgres EXTRACT(DOW FROM ...) convention: 0=Sunday … 6=Saturday.
-- Overnight bookings (close-time on the next day) aren't supported in Phase 7;
-- the open<close CHECK enforces this. If the platform later needs all-night
-- venues, a follow-up migration adds a "spans midnight" boolean.

CREATE TABLE IF NOT EXISTS "venueAvailabilityRules" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "venueId" UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  "dayOfWeek" INT NOT NULL CHECK ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6),
  "openTime" TIME NOT NULL,
  "closeTime" TIME NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT venue_avail_open_before_close CHECK ("closeTime" > "openTime")
);

DROP TRIGGER IF EXISTS update_venue_availability_rules_updated_at ON "venueAvailabilityRules";
CREATE TRIGGER update_venue_availability_rules_updated_at BEFORE UPDATE ON "venueAvailabilityRules"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_venue_avail_venue_day
  ON "venueAvailabilityRules"("venueId", "dayOfWeek")
  WHERE "isActive" = true;

CREATE TABLE IF NOT EXISTS "venueAvailabilityBlackouts" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "venueId" UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  "startsAt" TIMESTAMP NOT NULL,
  "endsAt" TIMESTAMP NOT NULL,
  reason VARCHAR(200),
  "createdByUserId" UUID NOT NULL REFERENCES "user"(id),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT venue_blackout_starts_before_ends CHECK ("endsAt" > "startsAt")
);

CREATE INDEX IF NOT EXISTS idx_venue_blackouts_venue_range
  ON "venueAvailabilityBlackouts"("venueId", "startsAt", "endsAt");
