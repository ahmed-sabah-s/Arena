# Phase 5.5 — Cleanup

A small, focused phase that closed five issues left by Phase 5. No new domain, no new feature surface — just behavior fixes, one config knob, and two doc/comment improvements that capture conventions Phase 5 established but didn't write down.

## Branch

`phase/5.5-cleanup` — **5 commits** before this summary, branched from `phase/5-matches-queue` (Phase 5 hasn't merged to `main` yet).

## Migrations Created

- `025_stat_reconciliation_config.sql` — inserts the `stat_reconciliation_tolerance_minutes` `platformConfig` row (category `matches`, default `2`, integer). `ON CONFLICT (key) DO NOTHING` so re-runs are no-ops.

## Behavior Fixes

**Friendly QR invites lock the match immediately on claim** (`backend/src/domain/match-invite/match-invite.service.ts`):
Phase 5's `claimInvite` left both ranked and friendly invites in `awaiting_creator_confirmation` and required a follow-up `confirmClaim` to mint the match. That extra round-trip was correct for ranked (the creator might want to back out) but wrong for friendly — the creator already opted in by generating the friendly QR. Now `claimInvite` detects `stakes === 'friendly'` after the eligibility check and inline-creates the match in the same transaction (notifications enqueued for both users with `match_locked`). `confirmClaim` is also now idempotent: if the invite is already creator-confirmed and has a `matchId`, it returns the existing match instead of throwing — clients can call it unconditionally without branching on stakes. `MatchService.createMatchFromInvite` was extended to accept an optional `client?: CustomClient` so the friendly path can join the invite's transaction.

**`acceptFriendly` pairs immediately when an opponent is available** (`backend/src/domain/matchmaking/matchmaking.service.ts`):
Phase 5's `acceptFriendly` flipped status to `friendly_offered` and waited for the next `runMatchmakingPass` tick to pair. The intent was always "find me anyone right now", not "queue me for a future pass". Replaced with a non-locking validation read followed by a direct `MatchService.createMatchFromQueueEntries` call (`stakes='friendly'`, `matchMode='score_only'`) when an opponent is found. MMR gap is intentionally ignored — the user accepted the looser pairing by tapping accept-friendly. Both `'waiting'` and `'friendly_offered'` entries are eligible opponents, so two opted-in friendlies can pair with each other; `createMatchFromQueueEntries` was relaxed to accept `'friendly_offered'` as a pairable status.

**Stat reconciliation tolerance is now tunable via `platformConfig`** (`backend/src/domain/match/match.reconciliation.ts`, `backend/src/domain/match/match.service.ts`):
The ±2-minute tolerance window for merging two stat keepers' logs into one event was a hardcoded `MINUTE_TOLERANCE = 2` constant. Moved to `platformConfig` key `stat_reconciliation_tolerance_minutes` (default 2). `reconcileStatLogs` and `persistReconciledStats` now take `toleranceMinutes` as a parameter so they stay free of config IO; `MatchService.resolveAgreedMatch` reads `getConfigInteger('stat_reconciliation_tolerance_minutes')` and threads it through.

## Documentation / Comments

**JSONB parameter binding convention** (`backend/CLAUDE.md`):
Every domain repository that touches a JSONB column (`match.statValue`, `notification.payload`, `audit.details`, `elo.form`) follows the same dance: `JSON.stringify(value ?? null)` on the way in, no `JSON.parse` on the way out (pg returns JSONB pre-parsed). It was tribal knowledge — new repositories kept rediscovering that the pg driver writes `[object Object]` if you hand it a raw JS object for a JSONB column. Added a "JSONB Parameter Binding" section to the backend guide with both correct and incorrect examples and pointers to the four existing repos.

**FIFO pairing rationale in matchmaking service** (`backend/src/domain/matchmaking/matchmaking.service.ts`):
Audited `runMatchmakingPass` after a question came up about whether the inner partner search picked the closest-MMR opponent. It does not — it `break`s on the first MMR-compatible opponent in `queuedAt ASC` order, which is the right behavior (closest-MMR would let mid-pool entries jump ahead of long-waiting ones and starve them). No code change was needed; expanded the inline comment to a top-of-method docstring covering the strict-FIFO contract at both loop levels, the sparse-vs-mature decision, the friendly-offer fallback, and the concurrent-pass conflict handling.

## Tests Added

- **Unit (9 new)**: 4 friendly-claim/auto-lock + confirmClaim-idempotency tests in `match-invite.service.test.ts`, 5 `acceptFriendly` cases (immediate pair, lonely entry, status mismatch, ownership mismatch, missing entry) in `matchmaking.service.test.ts`. Reconciliation suite gained one tolerance-is-configurable test (`±5` merges what `±2` splits) and the existing 8 were updated to pass the new tolerance argument.
- **Integration (5 new)**: 3 in `match-invite.invariants.integration.test.ts` (friendly full-flow with team participants and notifications, confirmClaim idempotency on a confirmed friendly, ranked still requires confirmClaim), 2 in `matchmaking.invariants.integration.test.ts` (`acceptFriendly` pairs `friendly_offered + waiting` into a friendly match; lonely `friendly_offered` stays put when no opponent exists).

Totals after this phase: **148 unit tests** (was 137), **23 integration tests** (was 18). All green.

## Verification

- `pnpm -r typecheck` — clean across all four workspaces.
- `pnpm --filter ./backend test` — 148 / 148.
- `pnpm --filter ./backend test:integration` — 23 / 23.
- `pnpm --filter ./backend db:reset` — full migration chain through `025` applies cleanly; subsequent `db:migrate:dry` reports "No pending migrations".
- `SELECT key, value, "valueType", category FROM "platformConfig" WHERE key = 'stat_reconciliation_tolerance_minutes'` — present with `value=2`, `valueType=integer`, `category=matches`.

## What Did Not Change

- No new domain modules, no new shared schemas, no new tRPC routes.
- No changes to ELO math, queue scoring, dispute flow, or notification delivery.
- The ranked-invite confirmation flow is untouched — only the friendly path auto-locks.
- `runMatchmakingPass` is byte-identical at runtime; only its docstring changed.

## Ready For

Phase 6 (referee-recorded stats) — the `refereed` mode shells in `MatchService` still throw `NOT_IMPLEMENTED_UNTIL_PHASE_6`, and the reconciliation pipeline is now ready to add a third `verificationStatus='referee_recorded'` path alongside `verified` / `unverified` without further refactoring.
