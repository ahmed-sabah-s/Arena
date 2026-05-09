-- Migration 033: Venue bookings — the load-bearing one.
-- Connects matches to physical venues, tracks the booking lifecycle, and
-- carries a snapshot of the platform commission so historical reporting is
-- accurate even after the global rate is changed.
--
-- The cornerstone is the GiST exclusion constraint at the bottom: it
-- mathematically prevents double-booking a venue at overlapping times,
-- BUT only when both bookings are in active states (requested or
-- confirmed). Declined / cancelled / completed / no_show rows don't block
-- new bookings, so the constraint scopes via a partial WHERE.
--
-- Capacity > 1 venues (e.g., a sports hall with 3 ping-pong tables) are NOT
-- modeled in Phase 7 — the exclusion constraint enforces single-resource
-- capacity. Phase 7's seeded venues are all capacity = 1. When capacity > 1
-- becomes real, a follow-up migration introduces a per-court / per-table
-- sub-resource and the exclusion key changes accordingly.
--
-- paymentStatus is INDEPENDENT of status. A booking can be confirmed-but-
-- unpaid, or completed-but-paid. Decoupling them avoids forcing payment to
-- happen at any specific lifecycle stage.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS "venueBookings" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "venueId" UUID NOT NULL REFERENCES venues(id),
  "matchId" UUID REFERENCES matches(id),
  "gameId" UUID NOT NULL REFERENCES games(id),
  "requestedByUserId" UUID NOT NULL REFERENCES "user"(id),
  "startsAt" TIMESTAMP NOT NULL,
  "endsAt" TIMESTAMP NOT NULL,
  "priceAmount" BIGINT NOT NULL CHECK ("priceAmount" >= 0),
  "priceCurrency" VARCHAR(3) NOT NULL REFERENCES currencies(code),
  "commissionAmount" BIGINT NOT NULL CHECK ("commissionAmount" >= 0),
  "commissionCurrency" VARCHAR(3) NOT NULL REFERENCES currencies(code),
  "commissionPercentSnapshot" DECIMAL(5, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show')),
  "paymentStatus" VARCHAR(20) NOT NULL DEFAULT 'unpaid'
    CHECK ("paymentStatus" IN ('unpaid', 'pending', 'paid', 'refunded', 'failed')),
  "paymentProvider" VARCHAR(50),
  "paymentProviderReference" VARCHAR(255),
  "confirmedAt" TIMESTAMP,
  "declinedAt" TIMESTAMP,
  "declineReason" TEXT,
  "cancelledAt" TIMESTAMP,
  "cancelledByUserId" UUID REFERENCES "user"(id),
  "cancelReason" TEXT,
  "completedAt" TIMESTAMP,
  notes TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT venue_booking_starts_before_ends CHECK ("endsAt" > "startsAt"),
  CONSTRAINT venue_booking_currencies_match CHECK ("priceCurrency" = "commissionCurrency")
);

DROP TRIGGER IF EXISTS update_venue_bookings_updated_at ON "venueBookings";
CREATE TRIGGER update_venue_bookings_updated_at BEFORE UPDATE ON "venueBookings"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Exclusion constraint: no double-booking a venue at overlapping times ───
-- Reads as: forbid any pair of rows where venueId is the same AND the time
-- ranges overlap, but only when both rows are in active states. Touching
-- intervals don't conflict because of the [) form (start inclusive, end
-- exclusive) — booking 14:00–15:00 + booking 15:00–16:00 is fine.
ALTER TABLE "venueBookings"
  ADD CONSTRAINT venue_bookings_no_double_booking
  EXCLUDE USING gist (
    "venueId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE (status IN ('requested', 'confirmed'));

CREATE INDEX IF NOT EXISTS idx_venue_bookings_venue_starts
  ON "venueBookings"("venueId", "startsAt" DESC);

CREATE INDEX IF NOT EXISTS idx_venue_bookings_match
  ON "venueBookings"("matchId")
  WHERE "matchId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venue_bookings_owner_pending
  ON "venueBookings"("venueId", "createdAt")
  WHERE status = 'requested';

CREATE INDEX IF NOT EXISTS idx_venue_bookings_active
  ON "venueBookings"(status, "startsAt")
  WHERE status IN ('requested', 'confirmed');
