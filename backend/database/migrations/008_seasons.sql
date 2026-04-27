-- Migration 008: Seasons table.
-- Time-bounded periods over which ELO movement and leaderboards reset.
-- Each game has its own season cycle. Seasons are created by admins via the dashboard (Phase 8).

CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "gameId" UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  slug VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  "nameAr" VARCHAR(100) NOT NULL,
  "startsAt" TIMESTAMP NOT NULL,
  "endsAt" TIMESTAMP NOT NULL,
  "prizePoolAmount" BIGINT NOT NULL DEFAULT 0,
  "prizePoolCurrency" VARCHAR(3) NOT NULL DEFAULT 'IQD' REFERENCES currencies(code),
  status VARCHAR(20) NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled')),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("gameId", slug),
  CONSTRAINT seasons_dates_check CHECK ("endsAt" > "startsAt")
);

DROP TRIGGER IF EXISTS update_seasons_updated_at ON seasons;
CREATE TRIGGER update_seasons_updated_at BEFORE UPDATE ON seasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_seasons_game_id ON seasons("gameId");
CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status);
CREATE INDEX IF NOT EXISTS idx_seasons_active ON seasons("gameId", status) WHERE status = 'active';

-- No seed data. Seasons are created by admins; the first season is configured
-- manually via the Phase 8 admin dashboard once the real launch date is known.
