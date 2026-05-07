# Phase 4 — ELO Engine

Builds Arena's rating system: pure ELO math, the `teamElos` and `playerElos` tables, and the domain layer that seeds team ELO at team-creation time. Phase 4 does **not** update ELO from match results — that's Phase 5.

## Branch

`phase/4-elo-engine` — 6 commits before this summary.

## Migrations Created

- `017_team_elos.sql` — `teamElos` with `elo` (visible) + `mmr` (hidden) integers, calibration state, JSONB form (capped at 5), highest-ever values. Partial unique index on `(teamId, gameId, formatId, divisionId, seasonId)` with `NULLS NOT DISTINCT` (Postgres 15+) so the all-time row (`seasonId=NULL`) is unique. Leaderboard index on `elo DESC` and matchmaking index on `mmr` within scope.
- `018_player_elos.sql` — same shape with `userId`. For individual games (chess) only. Phase 4 doesn't seed playerElos; Phase 5 lazy-seeds on first queue.

## Pure Math Module

`backend/src/shared/elo/`:
- `types.ts` — `MatchResult`, `FormResult`, `Tier`, `ExperienceLevel`, `EloInput`, `OpponentInput`, threshold interfaces, `EloDelta`
- `kFactor.ts` — `getKFactorMultiplier(matchesPlayed, thresholds)` with three windows (×2.0 / ×1.4 / ×1.0)
- `skewProtection.ts` — `applySkewProtection({ rawDelta, sideMmr, opponentMmr, result, thresholds })`. 0 / halved / full visible-ELO shaping; MMR always raw. Upsets always pay full reward.
- `calculate.ts` — `calculateMatchOutcome` does the full pipeline: standard ELO formula on MMR, K-factor multiplier, skew protection on visible delta, `Math.round` at storage boundary.
- `tier.ts` — `calculateTier(elo, thresholds)` returns one of bronze/silver/gold/platinum/elite.
- `form.ts` — `appendForm`, `resultToForm`, `calculateRecentWinRate`.
- `seed.ts` — `seedFromExperience(level, thresholds)` returns `{ elo, mmr }` at the same starting value.
- `index.ts` — barrel.

**46 unit tests** across the module covering: K-factor windows, all skew-protection branches (favorite huge-gap → 0, favorite reduced-zone → halved, balanced → full, upsets → full, draws → unchanged), boundary tier values, form cap behavior, calibration K vs post-calibration K, seed null/expert/beginner/intermediate/advanced.

## Domain Layer

`backend/src/domain/elo/`:
- `elo.entity.ts` — `TeamElo`, `PlayerElo` interfaces (extend a shared `EloBase`).
- `elo.interface.ts` — `ITeamEloRepository`, `IPlayerEloRepository` + `CreateTeamEloData` / `CreatePlayerEloData`.
- `elo.repository.ts` — `TeamEloRepository`, `PlayerEloRepository`. Scope queries use `IS NOT DISTINCT FROM` on `divisionId` and `seasonId` so NULL matches NULL — same semantics as the partial unique index.
- `elo.service.ts` — `EloService.seedTeamElo`, `seedPlayerElo`, `recalculateTier`. Reads thresholds from `platformConfig` via `getConfigInteger`. Throws `TEAM_ELO_ALREADY_EXISTS` / `PLAYER_ELO_ALREADY_EXISTS` on duplicate scope. Phase 4 does not update ELO from matches; Phase 5 owns that.
- `fetchUserExperienceLevel` helper exported alongside the service for callers needing the captain's level without coupling to user SQL.
- `index.ts` — barrel.

**6 service unit tests** + **4 integration tests** covering: seed value per experience level, null fallback, duplicate-scope guard, tier recalc, end-to-end team creation seeding the ELO row.

## Schemas Added in `@arena/shared`

- `elo.schemas.ts` — `MatchResultSchema`, `FormResultSchema`, `TierSchema`, `TeamEloSchema`, `PlayerEloSchema`. Mirrors the migrations and entity interfaces. Form is `z.array(FormResultSchema).max(5)`.

## Existing Files Modified

- `backend/src/domain/team/team.service.ts` — `TeamService` constructor takes `EloService` as fifth dep; `createTeam` extends its transaction with `eloService.seedTeamElo` after the team/member/log inserts. `fetchUser` now selects `experienceLevel` so the captain's level can be passed to the seeder.
- `backend/src/domain/team/team.router.ts` — instantiates `EloService` and passes it to `TeamService`.
- `backend/src/domain/team/team.service.test.ts` — adds `makeEloServiceStub()` and threads it through every `new TeamService(...)` call site.
- `backend/src/domain/team/team.invariants.integration.test.ts` — wires real `EloService`; truncate list now includes `teamElos`.
- `backend/src/test/setup.ts` — detect "already migrated" by querying for the `teamElos` table instead of relying on a per-file-evaluated module flag (vitest re-evaluates setupFiles per test file even with singleFork). Drop the `uuid-ossp` extension before the schema reset to avoid orphaned `pg_extension` rows.
- `backend/vitest.config.integration.ts` — `fileParallelism: false` so the two integration test files run sequentially (they share the test DB).
- `backend/database/seeds/dev.ts` — appends a teamElos INSERT step after the team seeds. Hardcoded thresholds (mirror seeded `platformConfig` defaults) — acceptable in dev seed because no production impact and drift would surface in the next integration test run.

## Tests Added

- **Unit:** 46 ELO math tests + 6 ELO service tests = **52 new** (total 108 unit tests pass).
- **Integration:** 4 ELO tests (3 seed-by-experience scenarios + idempotency) — total **11 integration tests pass**.

## Dev Seed Update

After `db:reset`:
- 6 users (1 admin + 5 players)
- 5 active teams (Phase 3)
- 6 active memberships (Phase 3)
- **5 team ELO rows**, seed value derived from each captain's experience:
  - Asad Baghdad / Furat Najaf — captain `intermediate` → 1000
  - Najmat Karrada — captain `beginner` → 800
  - Pair Karbala — captain `expert` → 1400
  - Tigris Mosul — captain `null` (admin) → 1000 (intermediate fallback)
- 0 player ELOs (Phase 5 lazy-seeds individual-game players).

## Verification Results

| # | Check | Result |
|---|-------|--------|
| 1 | `pnpm install` | ✅ |
| 2 | `pnpm -r typecheck` | ✅ all four packages |
| 3 | `pnpm --filter ./backend test` | ✅ 108/108 |
| 4 | `pnpm --filter ./backend test:integration` | ✅ 11/11 |
| 5 | `pnpm --filter ./backend db:reset` runs through migration 018 | ✅ |
| 6 | Second `pnpm db:migrate` is a no-op | ✅ "No pending migrations" |
| 7 | teamElos populated correctly per captain experience | ✅ |
| 8 | Skew protection: huge-gap favorite gain=0, upset gets full reward | ✅ tests confirm |
| 9 | Calibration K-factor steps across three windows | ✅ tests confirm |
| 10 | Branch clean and ready to merge | ✅ |

## Commits on `phase/4-elo-engine`

```
feat: add teamElos and playerElos tables (017, 018)
feat: add pure ELO math module
feat: add ELO schemas to @arena/shared
feat: add ELO domain (entity, repos, service)
feat: wire ELO seeding into team creation lifecycle
chore: seed teamElos rows in dev seed
docs: add phase-4 summary  ← this commit
```

## Future-Phase Items Noticed

- `seedPlayerElo` exists but is uncalled. Phase 5's match queue will invoke it lazily on first queue for an individual-game player.
- ELO update on match resolution is Phase 5's primary work. The pure math module is ready: `calculateMatchOutcome`, `appendForm`, `resultToForm` are the building blocks. Phase 5 wires them into match-finalization.
- `seasonId = NULL` is the only mode for now. Phase 8 introduces seasons properly — at which point ELOs become `(team, scope, season)` rows alongside the all-time row, and the leaderboard indexes will need a season-aware variant or a partial filter.
- Tier is derived, not stored. If we later need historical "tier at time T" queries, we'd need to materialize tier on each ELO update — but for now derived-via-config is the right call.
- Captain-derived team seed is a simplification. After 1–2 seasons of data we could revisit averaging across founding members or weighting by self-reported levels.
- Form is JSONB array. Phase 1 flagged this as refactor-debt-eligible; deferred to a future cleanup phase.

**Ready for Phase 5: YES**
