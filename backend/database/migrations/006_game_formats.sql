-- Migration 006: Game formats table.
-- Variants of a game with different player counts (5v5, 7v7, 2v2, 1v1).
-- A game can have multiple formats; the same format slug can appear across different games.

CREATE TABLE IF NOT EXISTS "gameFormats" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "gameId" UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  slug VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  "nameAr" VARCHAR(100) NOT NULL,
  "minPlayersPerSide" INT NOT NULL,
  "maxPlayersPerSide" INT NOT NULL,
  "minRosterSize" INT NOT NULL,
  "maxRosterSize" INT NOT NULL,
  "matchDurationMinutes" INT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("gameId", slug)
);

DROP TRIGGER IF EXISTS update_game_formats_updated_at ON "gameFormats";
CREATE TRIGGER update_game_formats_updated_at BEFORE UPDATE ON "gameFormats"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_game_formats_game_id ON "gameFormats"("gameId");
CREATE INDEX IF NOT EXISTS idx_game_formats_active ON "gameFormats"("gameId", "isActive") WHERE "isActive" = true;

-- Football formats
INSERT INTO "gameFormats" ("gameId", slug, name, "nameAr", "minPlayersPerSide", "maxPlayersPerSide", "minRosterSize", "maxRosterSize", "matchDurationMinutes")
SELECT g.id, '5v5', '5-a-side', 'خماسي', 5, 5, 5, 8, 60
FROM games g WHERE g.slug = 'football'
ON CONFLICT ("gameId", slug) DO NOTHING;

INSERT INTO "gameFormats" ("gameId", slug, name, "nameAr", "minPlayersPerSide", "maxPlayersPerSide", "minRosterSize", "maxRosterSize", "matchDurationMinutes")
SELECT g.id, '7v7', '7-a-side', 'سباعي', 7, 7, 7, 11, 70
FROM games g WHERE g.slug = 'football'
ON CONFLICT ("gameId", slug) DO NOTHING;

-- Dominoes formats (2v2 — pair game modeled as a 2-person team)
INSERT INTO "gameFormats" ("gameId", slug, name, "nameAr", "minPlayersPerSide", "maxPlayersPerSide", "minRosterSize", "maxRosterSize", "matchDurationMinutes")
SELECT g.id, '2v2', 'Pairs', 'ثنائي', 2, 2, 2, 2, NULL
FROM games g WHERE g.slug = 'dominoes'
ON CONFLICT ("gameId", slug) DO NOTHING;

-- Chess formats
INSERT INTO "gameFormats" ("gameId", slug, name, "nameAr", "minPlayersPerSide", "maxPlayersPerSide", "minRosterSize", "maxRosterSize", "matchDurationMinutes")
SELECT g.id, '1v1', 'Standard', 'قياسي', 1, 1, 1, 1, NULL
FROM games g WHERE g.slug = 'chess'
ON CONFLICT ("gameId", slug) DO NOTHING;
