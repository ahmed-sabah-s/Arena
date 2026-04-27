-- Migration 007: Divisions table.
-- Partitions the player base by gender or other criteria for competitive fairness.
-- Football has male, female, and mixed divisions. Non-gender games get a single 'open' division.

CREATE TABLE IF NOT EXISTS divisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "gameId" UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  slug VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  "nameAr" VARCHAR(100) NOT NULL,
  "genderRestriction" VARCHAR(20)
    CHECK ("genderRestriction" IN ('male', 'female', 'mixed')),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("gameId", slug)
);

DROP TRIGGER IF EXISTS update_divisions_updated_at ON divisions;
CREATE TRIGGER update_divisions_updated_at BEFORE UPDATE ON divisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_divisions_game_id ON divisions("gameId");
CREATE INDEX IF NOT EXISTS idx_divisions_active ON divisions("gameId", "isActive") WHERE "isActive" = true;

-- Football divisions
INSERT INTO divisions ("gameId", slug, name, "nameAr", "genderRestriction")
SELECT g.id, 'male', 'Men''s', 'رجال', 'male'
FROM games g WHERE g.slug = 'football'
ON CONFLICT ("gameId", slug) DO NOTHING;

INSERT INTO divisions ("gameId", slug, name, "nameAr", "genderRestriction")
SELECT g.id, 'female', 'Women''s', 'نساء', 'female'
FROM games g WHERE g.slug = 'football'
ON CONFLICT ("gameId", slug) DO NOTHING;

INSERT INTO divisions ("gameId", slug, name, "nameAr", "genderRestriction")
SELECT g.id, 'mixed', 'Mixed', 'مختلط', 'mixed'
FROM games g WHERE g.slug = 'football'
ON CONFLICT ("gameId", slug) DO NOTHING;

-- Dominoes — single open division (no gender restriction)
INSERT INTO divisions ("gameId", slug, name, "nameAr", "genderRestriction")
SELECT g.id, 'open', 'Open', 'عام', NULL
FROM games g WHERE g.slug = 'dominoes'
ON CONFLICT ("gameId", slug) DO NOTHING;

-- Chess — single open division (no gender restriction)
INSERT INTO divisions ("gameId", slug, name, "nameAr", "genderRestriction")
SELECT g.id, 'open', 'Open', 'عام', NULL
FROM games g WHERE g.slug = 'chess'
ON CONFLICT ("gameId", slug) DO NOTHING;
