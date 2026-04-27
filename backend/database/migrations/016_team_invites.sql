-- Migration 016: Team invites.
-- Captain-initiated invites that the invitee accepts or declines.

CREATE TABLE IF NOT EXISTS "teamInvites" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "teamId" UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  "invitedUserId" UUID NOT NULL REFERENCES "user"(id),
  "invitedByUserId" UUID NOT NULL REFERENCES "user"(id),
  position VARCHAR(50),
  "shirtNumber" INT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  message TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP,
  "expiresAt" TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_invites_invited_user
  ON "teamInvites" ("invitedUserId", status)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_team_invites_team_id
  ON "teamInvites" ("teamId");

-- Prevents duplicate pending invites from the same team to the same user.
-- After decline/expire/cancel, a new invite can be sent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invites_unique_pending
  ON "teamInvites" ("teamId", "invitedUserId")
  WHERE status = 'pending';

-- New tunable for invite expiry. Inline so this migration is self-contained.
INSERT INTO "platformConfig" (key, value, "valueType", category, description)
VALUES
  ('team_invite_expiry_days', '7'::jsonb, 'integer', 'anti_abuse',
   'Number of days a team invite stays pending before expiring.')
ON CONFLICT (key) DO NOTHING;
