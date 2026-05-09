-- Migration 027: Referee certifications.
-- One row per (referee, game) pair the referee is approved to officiate.
-- Replaces the JSONB `gamesCertified` field flagged in earlier phases with a
-- proper relational shape so admins can audit who certified whom and revoke
-- granularly. Revoked rows stay in the table for history; the partial unique
-- index on (userId, gameId) WHERE revokedAt IS NULL ensures only one *active*
-- certification per pair while allowing re-certification after revocation.

CREATE TABLE IF NOT EXISTS "refereeCertifications" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES "user"(id),
  "gameId" UUID NOT NULL REFERENCES games(id),
  "certifiedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "certifiedByUserId" UUID NOT NULL REFERENCES "user"(id),
  "revokedAt" TIMESTAMP,
  "revokedByUserId" UUID REFERENCES "user"(id),
  "revocationReason" TEXT,
  notes TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_referee_certifications_updated_at ON "refereeCertifications";
CREATE TRIGGER update_referee_certifications_updated_at BEFORE UPDATE ON "refereeCertifications"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS idx_referee_certifications_active
  ON "refereeCertifications"("userId", "gameId")
  WHERE "revokedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_referee_certifications_user
  ON "refereeCertifications"("userId");

CREATE INDEX IF NOT EXISTS idx_referee_certifications_game
  ON "refereeCertifications"("gameId")
  WHERE "revokedAt" IS NULL;
