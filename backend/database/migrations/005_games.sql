-- Migration 005: Games table.
-- Defines every game the platform supports. Adding a new game is a row insert, never code.

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  "nameAr" VARCHAR(100) NOT NULL,
  "iconKey" VARCHAR(100),
  "participantType" VARCHAR(20) NOT NULL
    CHECK ("participantType" IN ('team', 'individual')),
  "eloOwner" VARCHAR(20) NOT NULL
    CHECK ("eloOwner" IN ('team', 'individual')),
  "allowedMatchModes" JSONB NOT NULL DEFAULT '["score_only"]'::jsonb,
  "hasStats" BOOLEAN NOT NULL DEFAULT false,
  "statSchema" JSONB,
  "supportsDivisions" BOOLEAN NOT NULL DEFAULT false,
  "supportsGenderDivisions" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_games_updated_at ON games;
CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_games_slug ON games(slug);
CREATE INDEX IF NOT EXISTS idx_games_active ON games("isActive") WHERE "isActive" = true;

-- Launch games seed.
-- Note: duo is NOT a participant type. Pair games like dominoes use team with a fixed 2-person roster.
INSERT INTO games (slug, name, "nameAr", "participantType", "eloOwner", "allowedMatchModes", "hasStats", "statSchema", "supportsDivisions", "supportsGenderDivisions") VALUES
  (
    'football',
    'Football',
    'كرة القدم',
    'team',
    'team',
    '["refereed","player_stats","score_only"]'::jsonb,
    true,
    '{"goals":"integer","assists":"integer","yellow_cards":"integer","red_cards":"integer","saves":"integer"}'::jsonb,
    true,
    true
  ),
  (
    'dominoes',
    'Dominoes',
    'الدومينو',
    'team',
    'team',
    '["score_only"]'::jsonb,
    false,
    NULL,
    false,
    false
  ),
  (
    'chess',
    'Chess',
    'الشطرنج',
    'individual',
    'individual',
    '["score_only"]'::jsonb,
    false,
    NULL,
    false,
    false
  )
ON CONFLICT (slug) DO NOTHING;
