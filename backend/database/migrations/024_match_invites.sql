-- Migration 024: QR-based match invites.
-- A user (or team captain) creates an invite with a short human-readable code
-- and a signed JWT payload encoded into a QR. The opposing side claims by
-- presenting the QR or typing the code. For ranked invites the creator confirms
-- before the match locks; friendly invites lock immediately on claim.

CREATE TABLE IF NOT EXISTS "matchInvites" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL UNIQUE,
  "qrPayload" TEXT NOT NULL,
  "createdByUserId" UUID NOT NULL REFERENCES "user"(id),
  "creatorTeamId" UUID REFERENCES teams(id),
  "gameId" UUID NOT NULL REFERENCES games(id),
  "formatId" UUID NOT NULL REFERENCES "gameFormats"(id),
  "divisionId" UUID REFERENCES divisions(id),
  stakes VARCHAR(20) NOT NULL DEFAULT 'friendly'
    CHECK (stakes IN ('ranked', 'friendly')),
  "matchMode" VARCHAR(20) NOT NULL
    CHECK ("matchMode" IN ('refereed', 'player_stats', 'score_only')),
  "venueId" UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'claimed', 'expired', 'cancelled')),
  "claimedByUserId" UUID REFERENCES "user"(id),
  "claimedByTeamId" UUID REFERENCES teams(id),
  "claimedAt" TIMESTAMP,
  "matchId" UUID REFERENCES matches(id),
  "creatorConfirmedAt" TIMESTAMP,
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_match_invites_updated_at ON "matchInvites";
CREATE TRIGGER update_match_invites_updated_at BEFORE UPDATE ON "matchInvites"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Recently-open invites (admin / display feeds).
CREATE INDEX IF NOT EXISTS idx_match_invites_open_recent
  ON "matchInvites"("createdAt" DESC)
  WHERE status = 'open';
-- A user's own invites (creator dashboard).
CREATE INDEX IF NOT EXISTS idx_match_invites_creator
  ON "matchInvites"("createdByUserId", "createdAt" DESC);
-- Code lookups (manual entry path).
CREATE INDEX IF NOT EXISTS idx_match_invites_code
  ON "matchInvites"(code);
