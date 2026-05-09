-- Migration 034: Activate venue FK constraints on the three nullable columns
-- that were declared without references in earlier phases.
--
-- matches.venueId, queueEntries.preferredVenueId, and matchInvites.venueId
-- have all existed since Phase 5 (Phase 5.5 didn't touch them) but couldn't
-- carry FK constraints because the venues table didn't exist yet. Now that
-- migration 030 has created venues, we activate the references.
--
-- The columns remain nullable — pickup matches in a park have no venue, and
-- a QR invite can be created without a preset venue. The FK only enforces
-- that *if* a venueId is set, it must point to a real venue row.

ALTER TABLE matches
  ADD CONSTRAINT matches_venue_fk
  FOREIGN KEY ("venueId") REFERENCES venues(id);

ALTER TABLE "queueEntries"
  ADD CONSTRAINT queue_entries_preferred_venue_fk
  FOREIGN KEY ("preferredVenueId") REFERENCES venues(id);

ALTER TABLE "matchInvites"
  ADD CONSTRAINT match_invites_venue_fk
  FOREIGN KEY ("venueId") REFERENCES venues(id);
