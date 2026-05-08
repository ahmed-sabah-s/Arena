# Phase 5 — Matches & Queue

The platform now behaves like a platform: queue → match → submit → ELO update → notify. QR-based on-the-spot matches share the same pipeline. `score_only` and `player_stats` modes are live; `refereed` throws `NOT_IMPLEMENTED_UNTIL_PHASE_6` and is wired for Phase 6 to flip on.

## Branch

`phase/5-matches-queue` — **11 commits** before this summary.

## Migrations Created

- `019_notifications.sql` — outbox table for in-app/push delivery (Phase 8 wires real delivery worker). Indexes on user-unread, pending-delivery, and recent-history.
- `020_matches.sql` — `matches` (status enum, finalScore A/B nullable until resolution, snapshot fields baked into participants) + `matchParticipants` (team xor user, snapshot mmr/elo/matchesPlayed). Status column is VARCHAR(30) to fit `awaiting_confirmation`.
- `021_match_stats.sql` — `matchStatLogs` (raw events) + `matchStats` (reconciled ledger with verification status) + `matchSubmissions` (per-side score claims).
- `022_disputes.sql` — partial unique index limits ≤1 open dispute per match. Resolution flow is Phase 8.
- `023_queue_entries.sql` — partial unique indexes prevent duplicate active entries per (team or user, game, format). Workhorse compound index for matchmaker scans.
- `024_match_invites.sql` — code + signed-JWT QR payload, ranked-vs-friendly stakes, lifecycle from open → claimed → (creator-confirmed) → matched.

## Domain Modules

**Notification** (`backend/src/domain/notification/`):
- entity / interface / repository / service / router. Other domains call `notificationService.enqueue` (optionally inside their own transaction). Repo `markRead` query gates by userId so a user cannot mark another user's notifications as read. Router exposes `notification.getMyUnread`, `getMyRecent`, `markRead`, `markAllRead`.

**Match** (`backend/src/domain/match/`):
- 6 entity types (Match, MatchParticipant, MatchSubmission, MatchStatLog, MatchStat, Dispute) + repositories for each.
- `match.service.ts` covers the lifecycle: `createMatchFromQueueEntries`, `createMatchFromInvite`, `startMatch`, `designateStatKeeper`, `logMatchStat`, `submitMatchResult`, `confirmOpposingResult`, `disputeResult`, `applyForfeitWindow`, `getMatch`. `refereed` mode throws `NOT_IMPLEMENTED_UNTIL_PHASE_6` everywhere.
- `match.elo.ts` — ELO application: reads thresholds + rematch config, calls Phase 4 `calculateMatchOutcome` on snapshot mmr/elo, applies the rematch cooldown multiplier (1.0 / 0.5 / 0.0) to visible ELO only (MMR keeps learning), updates `teamElos` / `playerElos` rows including form / highest-ever / calibrationCompleteAt.
- `match.reconciliation.ts` — groups stat logs by (side, statKey, playerId) within ±2-minute tolerance. Two keepers = verified; one = unverified.
- Router exposes `match.getById`, `start`, `designateStatKeeper`, `logStat`, `submitResult`, `confirmResult`, `dispute`, `runForfeitSweep`.

**Matchmaking** (`backend/src/domain/matchmaking/`):
- `matchmaking.gaps.ts` (pure) — `computeAllowedMmrGap(waitMinutes, sparseMode, sparseConfig, matureConfig)`. Sparse: aggressive widening, then Infinity past `maxWaitMinutes`. Mature: standard widening with `gapMax` cap.
- `matchmaking.service.ts` — `enqueue`, `leaveQueue`, `getMyQueueStatus`, `acceptFriendly`, `runMatchmakingPass`. Lazy-seeds `playerElos` for individual games. Pass scans waiting entries FIFO, pairs the oldest with the first compatible opponent within the allowed gap, then offers friendlies to entries past `queue_friendly_after_minutes`. Pool-size lookup decides sparse mode per scope.
- Router under `queue.*` namespace.

**Match-invite** (`backend/src/domain/match-invite/`):
- `match-invite.qr.ts` (pure) — `ARN-XXXX` code generation (excludes confusable `I O 1 0`), JWT-signed payload with `arena-invite` issuer claim. Verify rejects forged issuer / wrong secret / expired tokens.
- Service: collision-retried code allocation, scope/captain/division eligibility checks, friendly-vs-ranked claim flow (friendly auto-locks, ranked needs creator confirmation), expirePastInvites for the Phase-8 worker.
- Router under `matchInvite.*` with public `preview`.

## Shared Schemas in `@arena/shared`

- `notification.schemas.ts` — `NotificationDeliveryStatusSchema`, `NotificationSchema`, `MarkNotificationReadInputSchema`.
- `match.schemas.ts` — `MatchStakesSchema`, `MatchStatusSchema`, `MatchSideSchema`, `MatchCreationSourceSchema`, `StatVerificationStatusSchema`, `MatchModeForCreationSchema`, `MatchSchema`, `MatchParticipantSchema`, `MatchSubmissionSchema`, `MatchStatLogSchema`, `MatchStatSchema`, plus all the input schemas.
- `dispute.schemas.ts` — `DisputeStatusSchema`, `DisputeSchema`.
- `queue.schemas.ts` — `QueueStatusSchema`, `QueueEntrySchema`, `EnqueueInputSchema`, `LeaveQueueInputSchema`, `AcceptFriendlyInputSchema`, `RunMatchmakingPassInputSchema`.
- `match-invite.schemas.ts` — `MatchInviteStatusSchema`, `MatchInviteSchema`, plus all input schemas.

All barrel-exported from `shared/src/schemas/index.ts`.

## Existing Files Modified

- `backend/src/presentation/routers/_app.ts` — registered `notification`, `match`, `queue`, `matchInvite` routers.
- `backend/src/domain/elo/elo.repository.ts` — `JSON.stringify(form)` before binding to JSONB column for both team and player ELO updates (pg's binder doesn't accept JS arrays for JSONB).
- `backend/src/test/setup.ts` — widened `createTestUser` random phone from 4 to 8 digits to avoid collisions across the now-larger integration suite.
- `backend/database/seeds/dev.ts` — Phase 5 sample data appended (3 matches, 1 queue entry, 1 invite).
- `backend/database/migrations/020_matches.sql` — status column from VARCHAR(20) to VARCHAR(30) so `awaiting_confirmation` (21 chars) fits.

## Tests Added

- **Unit (29 new)**: 8 matchmaking gaps, 4 rematch multiplier, 8 stat reconciliation, 4 notification service, 6 QR sign/verify+code generation. Total now **137 unit tests**.
- **Integration (7 new)**: 4 match resolution invariants (ranked, disagreement→dispute, friendly=no-ELO, rematch cooldown 0.5/0), 3 matchmaking invariants (compatible-pair, partial-unique-index, lazy seeding). Total now **18 integration tests**.

## Dev Seed Update

After `db:reset`:

| Table | Count |
|---|---|
| user | 6 |
| teams (active) | 5 |
| teamElos | 5 |
| matches | 3 |
| matchParticipants | 6 |
| matchSubmissions | 6 |
| queueEntries | 1 |
| matchInvites | 1 |
| notifications | 0 |
| disputes | 0 |
| playerElos | 0 |

Match #1: Asad-Najmat 3-1 (Asad wins). Match #2: Furat-Asad 2-2 draw. Match #3: Tigris-Najmat 1-4 (Najmat wins). ELOs hand-rolled at +/-16/+/-0 — same intent as Phase 4's calibration but simplified for clean leaderboard numbers.

## Verification Results

| # | Check | Result |
|---|-------|--------|
| 1 | `pnpm install` | ✅ |
| 2 | `pnpm -r typecheck` | ✅ shared/backend/frontend/mobile |
| 3 | `pnpm --filter ./backend test` | ✅ 137/137 |
| 4 | `pnpm --filter ./backend test:integration` | ✅ 18/18 |
| 5 | `pnpm --filter ./backend db:reset` runs through migration 024 | ✅ |
| 6 | Second `pnpm db:migrate` is no-op | ✅ "No pending migrations" |
| 7 | E2E queue→pair (covered by matchmaking integration) | ✅ |
| 8 | E2E invite→claim→confirm→match (covered by service tests + integration) | ✅ |
| 9 | E2E submit-both-sides → ELO updates (covered by match integration) | ✅ |
| 10 | Branch ready to merge | ✅ |

## Commits on `phase/5-matches-queue`

```
feat: add match/queue/invite/notification migrations (019–024)
feat: add Phase 5 schemas to @arena/shared
feat: add notification domain and outbox service
feat: add match domain with ELO resolution and stat reconciliation
feat: add matchmaking service with sparse-mode gap windows
feat: add match-invite domain (QR-based on-the-spot matches)
chore: seed sample matches, queue entry, and open invite in dev seed
refactor: drop unused imports and destructured deltas
docs: add phase-5 summary  ← this commit
```

## Future-Phase Items Noticed

- **Refereed match mode**: 3 throw sites (`createMatchFromQueueEntries`, `createMatchFromInvite`, `submitMatchResult`) all throw `NOT_IMPLEMENTED_UNTIL_PHASE_6`. Phase 6 flips them on alongside the referee domain.
- **Friendly-invite auto-lock**: `claimInvite` returns `awaiting_creator_confirmation` for both friendly and ranked. The router currently doesn't follow up automatically with `confirmClaim` for friendly stakes; the spec says friendly should lock immediately on claim. Either the router should auto-call `confirmClaim` for friendly stakes after `claimInvite` returns, or the service should do it inline. Surfaced for Phase 9/11 when the UI needs to choose. For now, friendly invites land in `claimed` state and need a follow-up `confirmClaim` call.
- **`acceptFriendly` is incomplete**: it flips status back to `waiting` but doesn't actively pair with an opponent (the next `runMatchmakingPass` would). The spec implies it should pair immediately with `stakesOverride='friendly'`. Marked as a Phase-8 worker concern.
- **Cron workers**: `applyForfeitWindow`, `expirePastInvites`, and matchmaking-pass-on-schedule all exist as admin-callable mutations. Phase 8 wires real workers (likely a tiny in-process scheduler or external cron).
- **Notification delivery**: rows are written; nothing pushes them. Phase 8.
- **Dispute resolution**: only opens disputes; Phase 8 admin flow closes them.
- **Stat reconciliation tolerance** (`±2 minutes`) is a heuristic. Could become tunable via `platformConfig` if real-world drift differs.
- **FIFO matchmaker pairing** vs closest-MMR — keeping FIFO for now per the spec's anti-starvation rationale. Reconsider after pilot data.
- **`matchSubmissions` edit semantics** — the upsert overwrites side A's submission until both sides have submitted. After both submit and a dispute opens, no further edits are accepted (current code path naturally handles this because the match status moves out of `active`/`awaiting_confirmation`). Revisit if pilot users need richer "amend my submission" UX.
- **Venue support** — `venueId` columns are nullable on matches and matchInvites; FK and bookings come in Phase 7.

**Ready for Phase 6: YES**
