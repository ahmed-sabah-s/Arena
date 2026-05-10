-- Migration 035: User reports.
-- Players file reports against other players for cheating, abuse, no-shows,
-- fake-identity, inappropriate behaviour, collusion, or other. Admin reviews
-- and either upholds (with an action recorded against the reported user) or
-- dismisses (insufficient evidence, false report, out-of-scope).
--
-- The CHECK prevents reporting yourself; the unique partial index prevents
-- one user piling up multiple open reports against the same person while
-- earlier ones are still being reviewed (anti-spam).

CREATE TABLE IF NOT EXISTS "userReports" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "reporterUserId" UUID NOT NULL REFERENCES "user"(id),
  "reportedUserId" UUID NOT NULL REFERENCES "user"(id),
  "matchId" UUID REFERENCES matches(id),
  "reasonCode" VARCHAR(50) NOT NULL
    CHECK ("reasonCode" IN (
      'cheating', 'abuse', 'no_show', 'fake_identity',
      'inappropriate_behavior', 'collusion', 'other'
    )),
  description TEXT,
  "evidenceUrls" JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_review', 'upheld', 'dismissed', 'auto_dismissed')),
  resolution VARCHAR(50),
  "resolutionNotes" TEXT,
  "resolvedByUserId" UUID REFERENCES "user"(id),
  "resolvedAt" TIMESTAMP,
  "actionTakenOnReported" VARCHAR(50),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_reports_no_self CHECK ("reporterUserId" != "reportedUserId")
);

DROP TRIGGER IF EXISTS update_user_reports_updated_at ON "userReports";
CREATE TRIGGER update_user_reports_updated_at BEFORE UPDATE ON "userReports"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_user_reports_open
  ON "userReports"("createdAt" DESC)
  WHERE status IN ('open', 'under_review');

CREATE INDEX IF NOT EXISTS idx_user_reports_reported
  ON "userReports"("reportedUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter
  ON "userReports"("reporterUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_user_reports_match
  ON "userReports"("matchId")
  WHERE "matchId" IS NOT NULL;

-- Anti-spam: same reporter against same reported user must not pile up while
-- prior reports are still being reviewed. Resolved (upheld / dismissed /
-- auto_dismissed) reports don't block re-filing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_reports_unique_open_pair
  ON "userReports"("reporterUserId", "reportedUserId")
  WHERE status IN ('open', 'under_review');
