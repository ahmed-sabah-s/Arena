-- Migration 037: Add post-resolution snapshot columns on matchParticipants.
--
-- Phase 5 captured the *before* state via mmrAtMatch / eloAtMatch /
-- matchesPlayedAtMatch. Phase 8 needs the *after* state too so admin can
-- safely override a completed match's result even after subsequent matches
-- have run: subtracting (after - before) from the participant's current ELO
-- walks back THIS match's contribution while leaving subsequent matches'
-- contributions intact.
--
-- Existing rows have NULL after-states (matches resolved before this
-- migration). Phase 8's match override path checks for null and refuses to
-- override matches that predate the column — admin must use dispute
-- resolution for those instead. New resolutions populate the columns via
-- the updated match.elo.ts path.
--
-- All three columns are nullable (no DEFAULT) — set-once-on-resolve,
-- never updated again except via the same override flow.

ALTER TABLE "matchParticipants"
  ADD COLUMN IF NOT EXISTS "mmrAfterMatch" INTEGER,
  ADD COLUMN IF NOT EXISTS "eloAfterMatch" INTEGER,
  ADD COLUMN IF NOT EXISTS "matchesPlayedAfterMatch" INTEGER;
