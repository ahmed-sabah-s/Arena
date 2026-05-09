# Phase 7 — Venues & Bookings

The platform now models physical locations. Venue owners can be onboarded (data layer; the portal UI is Phase 10), a venue carries per-game pricing and weekly availability with one-off blackouts, and the booking lifecycle connects matches to venues through a request → confirm → mark-paid → complete flow. The cornerstone is migration 033's GiST exclusion constraint that makes double-booking a venue at overlapping times mathematically impossible. The Phase-1 `roundMoney()` utility finally has a real production caller (commission calculation), the three nullable `venueId` columns sitting un-FK'd since Phase 5 get real references, and the PaymentProvider abstraction lands as a stub mirroring Phase 2's SmsProvider.

## Branch

`phase/7-venues-bookings` — **9 commits before this summary**, branched from `phase/6-referees` (phases 5, 5.5, 6, and 7 are now stacked unmerged on top of each other).

## Migrations Created

- `030_venues.sql` — per-owner venue rows with admin-approval lifecycle (`pending_approval` / `active` / `paused` / `rejected` / `archived`), lat/lon in DECIMAL(10,7) (PostGIS deferred), soft-delete via `deletedAt`. Inserts the `venue_owner` role + 11 venue/booking permissions and grants the owner-side subset to the role.
- `031_venue_game_configs.sql` — per-(venue, game) pricing rows with three pricing models (`hourly` / `per_game` / `per_session`), capacity default 1, currency FK, `UNIQUE(venueId, gameId)` so updates upsert.
- `032_venue_availability.sql` — weekly recurring schedule (multiple rows per (venue, day) for split shifts) plus immutable blackout exceptions. Blackouts always override rules.
- `033_venue_bookings.sql` — full booking lifecycle (`requested` / `confirmed` / `declined` / `cancelled` / `completed` / `no_show`) with `paymentStatus` decoupled from `status`, `commissionPercentSnapshot` materialised at booking time, and the GiST exclusion constraint preventing double-booking via `tsrange` + `btree_gist` scoped to active states. Capacity > 1 venues are out-of-scope for Phase 7 — the constraint enforces capacity = 1.
- `034_venue_fk_activation.sql` — FK references on the previously-declared-nullable `matches.venueId`, `queueEntries.preferredVenueId`, and `matchInvites.venueId` now that the venues table exists.

## Backend Modules

**Payment infrastructure** (`backend/src/infrastructure/payment/`) — interface + `ManualPaymentProvider` (stateless: generates `manual-<uuid>` references and `pending` status; `markPaid` exposed for the admin "I confirmed payment out-of-band" flow) + `LivePaymentProvider` (throws on every method) + factory keyed off `PAYMENT_MODE`. Same shape as Phase 2's SmsProvider. New env var documented in `.env.example`.

**Venue** (`backend/src/domain/venue/`) — vertical slice for venues + per-(venue, game) pricing + availability rules + blackouts. Pure `venue.availability.ts` checks open/closed at a given timestamp following the order: blackout > no-rule-for-day > inside-rule-window. Service handles the lifecycle: `createVenue` auto-grants the `venue_owner` role to the caller via a `userRole` insert; `updateVenue` is owner-only; `pauseVenue` / `resumeVenue` / `archiveVenue` are owner-toggleable (archive cascade-cancels future requested/confirmed bookings); `approveVenue` / `rejectVenue` are admin-only. `upsertGameConfig` validates currency-active. Public endpoints (`getById` / `searchInCity` / `checkAvailabilityAt`) gate unauthenticated callers behind `public_venues_enabled`.

**Venue-booking** (`backend/src/domain/venue-booking/`) — separate domain because the lifecycle is substantial. Pure `venue-booking.commission.ts` combines `roundMoney` with a percent calc (rawCommission → roundedCommission → ownerPayout). Service threads a single transaction through `requestBooking`: validate venue active + config exists + duration bounds + open hours; compute price from the pricing model (hourly multiplies duration, per_game / per_session are flat); read `venue_commission_percent` and snapshot it; insert; catch SQLSTATE 23P01 from the GiST constraint and re-throw `VENUE_TIME_SLOT_UNAVAILABLE`; bind matchId; enqueue notification. `confirmBooking` initiates the payment provider and attaches the reference. `cancelBooking` is callable by either the requester or the owner; if the booking was paid, `paymentStatus` flips to `refunded` (admin processes the actual refund). `markBookingPaid` is admin-only and idempotent.

**Admin router** extended from Phase 6 with `admin.venue.{approve, reject, listPendingApproval}` and `admin.venueBooking.markPaid`.

## Shared Schemas in `@arena/shared`

- `venue.schemas.ts` — `VenueStatusSchema` / `VenuePricingModelSchema` enums; entities `VenueSchema`, `VenueGameConfigSchema`, `VenueAvailabilityRuleSchema`, `VenueAvailabilityBlackoutSchema`; the input set for create / update / pause / resume / archive / pricing upsert / availability rules + blackouts plus admin-side approve / reject. `TimeStringSchema` accepts `HH:mm` or `HH:mm:ss`.
- `venue-booking.schemas.ts` — `VenueBookingStatusSchema` / `VenuePaymentStatusSchema` enums; `VenueBookingSchema` entity; inputs for request / confirm / decline / cancel / complete / markPaid plus the read-side filters.

Barrel-exported from `shared/src/schemas/index.ts`.

## Existing Files Modified

- `backend/src/presentation/routers/_app.ts` — registered `venue` and `venueBooking` routers.
- `backend/src/domain/admin/admin.router.ts` — added `venue` and `venueBooking` admin sub-routers.
- `backend/.env.example` — added `PAYMENT_MODE=manual` with explanatory comment.
- `backend/database/seeds/dev.ts` — appended Phase 7 seed (Karim Owner + 2 venues + 3 configs + 15 availability rules + 1 requested + 1 confirmed booking).

## Tests Added

- **Unit (43 new)**: 10 availability (all branches + boundary edge cases + split-shift days + blackout overrides), 10 commission (IQD ceil math, zero-price + zero-percent zero-out, very large amount, USD cents step, floor-mode currency), 8 venue.service (create grants role + currency-active guard, update non-owner / archived rejections, approve happy + not-admin + wrong-status, pause/resume), 12 venue-booking.service (hourly + per_game pricing math, venue-inactive + missing-config + outside-hours rejections, exclusion-violation translation, min-duration guard, confirm initiates payment + attaches reference, cancel notifies the other party + marks paid bookings refunded + rejects non-party callers, markPaid admin-only + idempotent), 6 PaymentProvider (factory mode-selection + caching + unknown-mode error, ManualPaymentProvider three methods, LivePaymentProvider throws on every method), and the 5 already-counted manual provider lifecycle tests overlap.
- **Integration (8 new)**: 4 venue (overlapping rejection + touching success + cancelled-doesn't-block + different-venues-don't-block) and 4 venue-booking (full request → confirm → markPaid → complete lifecycle, commission math sanity, snapshot doesn't drift after global rate change, match association + reset on cancel).

Totals after this phase: **241 unit tests** (was 198), **37 integration tests** (was 29). All green.

## Dev Seed Update

A new dedicated user `+9647500000006` named "Karim Owner" is granted the `venue_owner` role only. He owns two active venues:
- "Stadium Asad" (Baghdad), football pitch, hourly 30000 IQD/hr.
- "Hall Ali" (Karbala), multi-game hall, dominoes per_session 5000 IQD + chess per_session 2000 IQD.

15 availability rules total (7 daily for Stadium Asad 16:00–22:00 + 7 daily for Hall Ali 18:00–23:00 + 1 extra Saturday 14:00–17:00 for Hall Ali). One requested booking (Stadium Asad / football / tomorrow 18:00 for one hour, by Asad Baghdad's captain) and one confirmed booking (Hall Ali / dominoes / day after tomorrow 19:00, by Lina) — both match-linked. The confirmed booking carries `paymentStatus='pending'` with a deterministic `manual-seed-confirmed-1` provider reference.

Spot SQL after `db:reset`:
- `SELECT COUNT(*) FROM venues WHERE status = 'active'` → 2
- `SELECT COUNT(*) FROM "venueGameConfigs"` → 3
- `SELECT COUNT(*) FROM "venueAvailabilityRules"` → 15
- `SELECT COUNT(*) FROM "venueBookings" WHERE status = 'requested'` → 1
- `SELECT COUNT(*) FROM "venueBookings" WHERE status = 'confirmed'` → 1

(The phase prompt's expected count of "8" availability rules summed the breakdown wrong: 7 + 7 + 1 = 15. The rule count matches the breakdown in the spec, not the misadded total.)

## Verification Results

| # | Check | Result |
|---|-------|--------|
| 1 | `pnpm install` | clean |
| 2 | `pnpm -r typecheck` (4 workspaces) | clean |
| 3 | `pnpm --filter ./backend test` | 241 / 241 |
| 4 | `pnpm --filter ./backend test:integration` | 37 / 37 |
| 5 | `pnpm --filter ./backend db:reset` (through migration 034) | clean |
| 6 | `pnpm --filter ./backend db:migrate:dry` after reset | "No pending migrations" |
| 7 | Manual trace: create / approve / config / rule / request / confirm / markPaid | covered by integration test "Booking lifecycle: request → confirm → mark paid → complete" |
| 8 | Manual trace: double-book attempt → SQL-level rejection | covered by integration test "venueBookings exclusion constraint > rejects an overlapping confirmed booking" |
| 9 | Manual trace: cancel a confirmed booking → `matches.venueId` resets | covered by integration test "Match association lifecycle" |
| 10 | Branch ready to merge | yes (9 commits + this docs commit) |

## What Did Not Change

- No real payment provider integration. `LivePaymentProvider` throws on every method; only `ManualPaymentProvider` works in Phase 7.
- No frontend or mobile UI for venues, bookings, or the venue owner portal (Phase 10 / Phase 11).
- No automatic payouts to venue owners. Commission is calculated and stored; admin-marked bookings are sufficient.
- No capacity > 1 venue logic. The exclusion constraint enforces capacity = 1; the seeded venues are all single-resource.
- No PostGIS or proximity search beyond the lat/lon columns.
- No caching for `getConfig`. Still deferred.
- No cron-scheduled booking-side transitions (e.g., auto-mark `no_show` after match start). Phase 8.
- No venue subscriptions (`venue_subscriptions_enabled` stays `false`).

## Future-Phase Items Noticed

- **Time literals in named-parameter SQL** are an ongoing trap: the backend's `:paramName` regex matched `:00` inside `'16:00:00'` as a missing parameter. The seed routes time strings through parameters; future migrations / seeds writing TIME / TIMESTAMP literals should do the same or escape with `(?<!:):` adjustments. Worth a one-line note in `backend/CLAUDE.md` when we next pass through that file.
- **BIGINT and DECIMAL columns** come back from pg as JS strings. The venue-booking + venue-game-config repositories now coerce on read; any new domain that reads BIGINT money columns needs the same `Number.parseFloat` step. Consider extracting a tiny shared `coerceNumeric` helper if/when a third repo needs it.
- **Capacity > 1 venues** will need a per-court / per-table sub-resource and a re-keyed exclusion constraint (`venueId, courtId WITH =, tsrange WITH &&`). The exclusion constraint design holds; the data model is what changes.
- **`LivePaymentProvider` wiring** is deferred but the platform now has the full request → confirm → reference path. Wiring QiCard / Tabadul / Areeba is a drop-in: implement `initiate` / `checkStatus` / `markPaid` on a new class and flip `PAYMENT_MODE`.
- **Refunds**: cancel-after-paid sets `paymentStatus='refunded'` but doesn't trigger a real refund. Phase 8 (admin) will likely add a refund-approval flow with a payout side-effect.
- **The seeded refereed-match conflict** noted in Phase 6 (admin officiating Tigris Mosul where they're the captain) is unchanged. Still a seed-only oddity that doesn't run through the service.

## Ready for Phase 8

Yes. The full venue stack is in place: schema, services, router, seed, real production caller for `roundMoney`, and the FK references on the three nullable columns from Phase 5. Phase 8 (admin operational surface, dispute resolution, push notification delivery, scheduling cron) can build on the existing booking lifecycle without further changes here.
