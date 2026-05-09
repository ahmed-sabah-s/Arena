-- Migration 031: Per-(venue, game) pricing configs.
-- A venue can support multiple games at different prices; one row per
-- (venue, game) pair via the UNIQUE constraint. Pricing model captures the
-- three real-world shapes we see in Iraq: hourly (football pitches),
-- per-game (boxing matches), per-session (dominoes halls billing per evening).

CREATE TABLE IF NOT EXISTS "venueGameConfigs" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "venueId" UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  "gameId" UUID NOT NULL REFERENCES games(id),
  "pricingModel" VARCHAR(20) NOT NULL
    CHECK ("pricingModel" IN ('hourly', 'per_game', 'per_session')),
  "priceAmount" BIGINT NOT NULL CHECK ("priceAmount" >= 0),
  "priceCurrency" VARCHAR(3) NOT NULL REFERENCES currencies(code),
  "minBookingMinutes" INT,
  "maxBookingMinutes" INT,
  capacity INT NOT NULL DEFAULT 1
    CHECK (capacity >= 1),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("venueId", "gameId")
);

DROP TRIGGER IF EXISTS update_venue_game_configs_updated_at ON "venueGameConfigs";
CREATE TRIGGER update_venue_game_configs_updated_at BEFORE UPDATE ON "venueGameConfigs"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_venue_game_configs_venue
  ON "venueGameConfigs"("venueId");

CREATE INDEX IF NOT EXISTS idx_venue_game_configs_game_active
  ON "venueGameConfigs"("gameId", "isActive")
  WHERE "isActive" = true;
