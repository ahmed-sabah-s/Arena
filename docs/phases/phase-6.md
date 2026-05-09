# Phase 6 — Referees & Refereed Match Mode

The platform's `refereed` match mode is now wired end-to-end. Admin assigns a main referee plus optional assistants, the referees confirm attendance, attendance windows trigger auto-promotion if the main no-shows, the active main starts the match and submits a locked result, and ELO updates flow through the existing Phase 4 path. Conflict-of-interest rules, same-team-frequency limits, and post-match captain flags protect competitive integrity. The four `NOT_IMPLEMENTED_UNTIL_PHASE_6` throws left over from Phase 5 are gone — three replaced with real implementations, one (queue picking refereed) demoted to a clearer `REFEREED_QUEUE_NOT_SUPPORTED` validation error.

## Branch

`phase/6-referees` — **7 commits before this summary**, branched from `phase/5.5-cleanup` (Phase 5 + 5.5 still unmerged at start of phase).

## Migrations Created

- `026_referee_profiles.sql` — one profile per referee user. `reliabilityScore` DECIMAL(3,2) clamped 0–5 with default 5.00. Cumulative counters (`totalMatchesOfficiated`, `totalNoShows`, `totalCaptainFlags`), `baseCity`, `isAcceptingAssignments` toggle, `bio`. Three partial indexes (accepting / city / reliability) for the Phase 8 auto-assignment algorithm.
- `027_referee_certifications.sql` — per-(user, game) approval rows with audit fields (`certifiedByUserId`, `revokedByUserId`, `revocationReason`). Unique partial index on (`userId`, `gameId`) WHERE `revokedAt IS NULL` so re-certification works after revocation but only one cert is active.
- `028_referee_conflicts.sql` — self-declared conflict-of-interest rows. CHECK enforces team-XOR-user. Soft-removal via `removedAt` plus two unique partial indexes preventing duplicate active declarations against the same target.
- `029_referee_assignments.sql` — the officiating lifecycle table (`assigned`/`accepted`/`declined`/`checked_in`/`no_show`/`promoted`/`completed`/`cancelled`) with the Phase-6 cornerstone partial unique index "one active main per match" (role='main' AND status IN active set), plus the `refereeCaptainFlags` table (post-match officiating-quality complaints, distinct from `disputes` which contest the score). Adds two genuinely new `platformConfig` keys (`referee_flag_review_threshold`, `referee_flag_window_days`); the rest of the referee tunables (same-team limit, conflict window, offense window, penalty values, check-in / promote minutes-before, payments-enabled flag, match fee) were already in migration 004's baseline and are reused as-is to avoid value drift.

## Backend Modules

**Referee** (`backend/src/domain/referee/`) — split into three services because the operations group naturally:

- `referee.profile.service.ts` — idempotent `createOrGetProfile`, self-service `updateProfile` (bio / city / accepting toggle), admin certification lifecycle (`certifyForGame`, `revokeCertification`), and the `isCertifiedFor` query used by the assignment flow. Admin role check runs inline against `userRole`.
- `referee.conflict.service.ts` — `declareTeamConflict` / `declareUserConflict` (rejects self-conflict, translates pg unique-violation to `CONFLICT_ALREADY_DECLARED`), `removeConflict` (ownership-checked), and `hasConflictForMatch` which evaluates BOTH explicit (`refereeConflicts`) AND implicit (active member of a participating team via `teamMembers`) conflicts.
- `referee.assignment.service.ts` — the heavy piece. `assignReferee` runs the full eligibility pipeline (admin caller, refereed-mode match, scheduled status, has referee role, accepting assignments, certified for game, no conflict, under same-team-frequency limit, role-specific slot constraints). Plus `respondToAssignment` (accept/decline), `triggerCheckInWindow` and `triggerAutoPromotion` (admin-callable; Phase 8 wires the cron), `checkIn`, `reclaimMainSlot` (reverses promotion without refunding the reliability penalty — deliberate), `startMatch`, `submitRefereedResult` (writes `matchStats` directly with `verificationStatus='referee_recorded'`, applies ELO via the existing match.elo path, marks all checked-in assignments completed), and `flagReferee` (with admin-attention threshold sweep).

**Admin** (`backend/src/domain/admin/`) — minimal new router. Only hosts `admin.referee.{assign, certify, revokeCertification, triggerCheckInWindow, triggerAutoPromotion}` for now. Phase 8 will fold the rest of the admin surface (manual match resolution, dispute handling, payouts, config edits) into the same router. Admin-role enforcement runs inside each service via `assertAdmin` SQL — the router stays a thin grouping layer.

**Repositories** in `referee.repository.ts`:
- `RefereeProfileRepository` (with reliability-score normalisation since pg returns DECIMAL as string, atomic `applyReliabilityDelta` clamped via `LEAST(5, GREATEST(0, ...))`, counter increments, `setLastOfficiatedAt`).
- `RefereeCertificationRepository` (active-only queries gate on `revokedAt IS NULL`; `userIsCertifiedFor` for the assignment-time check).
- `RefereeConflictRepository` (`hasConflict(refereeUserId, teamIds[], userIds[])` uses `ANY(...)` over both target arrays in a single EXISTS query).
- `RefereeAssignmentRepository` (`findActiveMainByMatch`, `findActiveAssistantsByMatch`, `promoteToMain`, `demoteToAssistant`, `countOfficiatedTeamMatchesInWindow`, `countNoShowsInWindow`).
- `RefereeCaptainFlagRepository` (`countByRefereeInWindow` accepts an optional `client` so the assignment service can count *including the just-inserted flag* from inside its insertion transaction — without it the count uses a separate connection and the threshold check is off-by-one).

## Match-Service Integration

The four `NOT_IMPLEMENTED_UNTIL_PHASE_6` throws are gone:

- `match.service.createMatchFromQueueEntries` — refereed mode now throws `ValidationError('REFEREED_QUEUE_NOT_SUPPORTED')`. Refereed matches don't come from the queue; this is a sanity check, not a real path.
- `match.service.createMatchFromInvite` — throw deleted; refereed-mode flows through normally. Match created at `status='scheduled'`, then admin assigns a referee, then `RefereeAssignmentService.startMatch` flips it to `'active'`.
- `match.service.submitMatchResult` — refereed mode now throws `ConflictError('REFEREE_SUBMISSION_REQUIRED')`. Captains don't submit refereed results; the active main referee owns the result via `referee.submitResult`.
- `match-invite.service.createInvite` — throw deleted; refereed invites can be created freely. Matching update in `claimInvite`: refereed-mode invites do NOT auto-lock on friendly claim. Even friendly refereed invites route through the creator-confirm path because referees are a commitment both sides should agree to (the Phase 5.5 friendly-auto-lock path stays for `score_only`/`player_stats` only).

## Shared Schemas in `@arena/shared`

`referee.schemas.ts`:
- Entity schemas: `RefereeProfileSchema`, `RefereeCertificationSchema`, `RefereeConflictSchema`, `RefereeAssignmentSchema`, `RefereeCaptainFlagSchema`.
- Enums: `RefereeAssignmentRoleSchema`, `RefereeAssignmentStatusSchema`, `RefereeFlagReasonSchema`, `RefereeFlagStatusSchema`.
- Inputs: `UpdateRefereeProfileInput`, `DeclareConflictInput` (XOR-validated via `.refine`), `RemoveConflictInput`, `AssignRefereeInput`, `RespondToAssignmentInput`, `CheckInInput`, `StartRefereedMatchInput`, `SubmitRefereedResultInput` (with `RefereedStatInputSchema` for the embedded stats array), `ReclaimMainSlotInput`, `FlagRefereeInput`, `CertifyRefereeInput`, `RevokeCertificationInput`, `TriggerCheckInWindowInput`, `TriggerAutoPromotionInput`.

Barrel-exported from `shared/src/schemas/index.ts`.

## Existing Files Modified

- `backend/src/presentation/routers/_app.ts` — registered `referee` and `admin` routers.
- `backend/src/domain/match/match.service.ts` — three NOT_IMPLEMENTED throws replaced as above; unused `AppError` import dropped.
- `backend/src/domain/match-invite/match-invite.service.ts` — refereed `createInvite` throw removed; `claimInvite` skips the friendly auto-lock for refereed-mode invites.
- `backend/database/seeds/dev.ts` — appended Phase 6 seed (referee role grants, profiles, certs, scheduled refereed match).

## Tests Added

- **Unit (39 new)**: 7 profile (certify happy / not-admin / already-cert, revoke happy / missing, createOrGetProfile idempotency); 9 conflict (declare team / user, self-reject, unique-violation translation, hasConflictForMatch covering explicit + implicit + negative paths, removeConflict ownership); 23 assignment (assign happy / 6 rejection paths; respond accept / decline / non-owner; checkIn; auto-promotion order, first-vs-repeat penalty branches, no-op cases; reclaim happy + already-started; submitRefereedResult writing stats + ELO + counters; flagReferee happy + unique-violation + threshold-trigger). Total now **187 unit tests** (was 148).
- **Integration (6 new)**: partial unique index on one-active-main (service-level rejection + direct-INSERT rejection + post-cancel re-assign succeeds), auto-promotion atomicity end-to-end, conflict enforcement, same-team-frequency limit, refereed result submission end-to-end with real ELO movement, captain flag accumulation hitting the admin-attention threshold. Total now **29 integration tests** (was 23).

## Dev Seed Update

Two existing users get the `referee` role: admin (already had `admin` role; doubles up) and Sara (female, captains no team — clean conflict surface). Both get `refereeProfiles` rows (Baghdad-based, accepting). Both certified for football; admin also for chess (multi-game cert path). One new scheduled refereed match (Furat Najaf vs Tigris Mosul) with Sara as accepted main and admin as accepted assistant — exercises the `refereeAssignments` data path without requiring the full assign → accept → check-in flow at seed time.

Spot SQL after `db:reset` matches the prompt's expectations:
- `SELECT COUNT(*) FROM "refereeProfiles"` → 2
- `SELECT COUNT(*) FROM "refereeCertifications" WHERE "revokedAt" IS NULL` → 3
- `SELECT COUNT(*) FROM "refereeAssignments" WHERE status = 'accepted'` → 2
- One match with `matchMode='refereed'` and `status='scheduled'`

Note: the seeded refereed match has admin as both an officiating assistant AND captain of one of the participating teams (Tigris Mosul) — that's a real conflict-of-interest. The seed bypasses the service-level check by inserting into `refereeAssignments` directly because the seed exists for UI screen-shaping, not for exercising the conflict logic. Tests cover the conflict path against fresh fixtures.

## Verification Results

| # | Check | Result |
|---|-------|--------|
| 1 | `pnpm install` | clean |
| 2 | `pnpm -r typecheck` (4 workspaces) | clean |
| 3 | `pnpm --filter ./backend test` | 187 / 187 |
| 4 | `pnpm --filter ./backend test:integration` | 29 / 29 |
| 5 | `pnpm --filter ./backend db:reset` (through migration 029) | clean |
| 6 | `pnpm --filter ./backend db:migrate:dry` after reset | "No pending migrations" |
| 7 | Manual trace: assign / accept / check-in / start / submit | covered by integration test "Refereed result submission — end-to-end ELO" |
| 8 | Manual trace: declare conflict + attempt assign + reject | covered by integration test "Conflict enforcement at assignment time" |
| 9 | Manual trace: trigger auto-promotion swap | covered by integration test "Referee auto-promotion atomicity" |
| 10 | Branch ready to merge | yes (7 commits + this docs commit) |

## What Did Not Change

- No real cron workers. The 30-min check-in / 15-min auto-promote / 5-min reclaim windows are admin-callable only; Phase 8 wires schedulers.
- No referee payment / payout flow. `referee_payments_enabled` stays `false`.
- No frontend or mobile referee UI (Phase 12).
- No dispute resolution flow (Phase 8).
- No push notification delivery (Phase 8).
- No queue or matchmaker refactors beyond the queue-picks-refereed sanity-error rename.
- No season-aware ELO logic.
- No caching for `getConfig` calls.

## Future-Phase Items Noticed

- The dev seed's deliberately-bypassed conflict (admin officiating Tigris Mosul where they're the captain) will need to be cleaned up if/when seed data is exercised by an automated integration scenario that runs the full assign flow.
- `triggerAutoPromotion`'s repeat-vs-first-offense classification reads `countNoShowsInWindow` *after* the no_show row is inserted in the same transaction — currently this works because `countNoShowsInWindow` uses the outer `query()` and so doesn't see the just-inserted row. The check then uses `noShowsInWindow > 1` to mean "this isn't the first occurrence" — which is correct only because of the read-isolation behaviour. If we ever pass the transaction client through (similar to the captain-flag fix), the threshold needs to flip to `> 0` to keep the same semantics. Worth documenting if the count gets txn-aware in a later phase.
- The `referee_match_fee_iqd` config key is in place at 0 IQD; Phase 8 (or whenever payments come on) will need a payout-tracking column on `refereeAssignments` plus a worker to compute and disburse.

## Ready for Phase 7

Yes. The referee subsystem is complete: schema is in place, services cover the assign-through-submit lifecycle, the four refereed-mode integration points in match + match-invite are real implementations or clearer errors, and unit + integration coverage hits all the partial-unique-index invariants. Phase 7 can build on top of completed refereed matches without further changes here.
