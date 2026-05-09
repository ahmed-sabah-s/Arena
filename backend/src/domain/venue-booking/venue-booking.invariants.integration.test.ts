import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  closeTestPool,
  createTestUser,
  getTestPool,
  truncateTables,
} from '../../test/setup.js';
import {
  VenueAvailabilityRepository,
  VenueGameConfigRepository,
  VenueRepository,
} from '../venue/venue.repository.js';
import { VenueService } from '../venue/venue.service.js';
import { VenueBookingRepository } from './venue-booking.repository.js';
import { VenueBookingService } from './venue-booking.service.js';
import { NotificationRepository } from '../notification/notification.repository.js';
import { NotificationService } from '../notification/notification.service.js';
import { ManualPaymentProvider } from '../../infrastructure/payment/index.js';

const venueRepo = new VenueRepository();
const gameConfigRepo = new VenueGameConfigRepository();
const availabilityRepo = new VenueAvailabilityRepository();
const notificationService = new NotificationService(new NotificationRepository());
const venueService = new VenueService(venueRepo, gameConfigRepo, availabilityRepo, notificationService);
const bookingService = new VenueBookingService(
  new VenueBookingRepository(),
  venueRepo, gameConfigRepo, availabilityRepo,
  notificationService,
  new ManualPaymentProvider(),
);

afterAll(async () => {
  await closeTestPool();
});

beforeEach(async () => {
  await truncateTables(
    'venueBookings',
    'venueAvailabilityBlackouts',
    'venueAvailabilityRules',
    'venueGameConfigs',
    'venues',
    'matches',
    'userRole',
  );
});

async function getGameId(slug: string): Promise<string> {
  const r = await getTestPool().query<{ id: string }>(`SELECT id FROM games WHERE slug = $1`, [slug]);
  return r.rows[0].id;
}

async function getFormatId(gameSlug: string, fmt: string): Promise<string> {
  const r = await getTestPool().query<{ id: string }>(
    `SELECT gf.id FROM "gameFormats" gf JOIN games g ON g.id = gf."gameId"
     WHERE g.slug = $1 AND gf.slug = $2`,
    [gameSlug, fmt],
  );
  return r.rows[0].id;
}

async function ensureRoles(): Promise<{ adminRoleId: string }> {
  await getTestPool().query(
    `INSERT INTO role (name, description) VALUES ('admin', 'admin')
     ON CONFLICT (name) DO NOTHING`,
  );
  const r = await getTestPool().query<{ id: string }>(`SELECT id FROM role WHERE name = 'admin'`);
  return { adminRoleId: r.rows[0].id };
}

async function makeAdmin(): Promise<{ id: string }> {
  const u = await createTestUser({ gender: 'male' });
  const { adminRoleId } = await ensureRoles();
  await getTestPool().query(
    `INSERT INTO "userRole" ("userId", "roleId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [u.id, adminRoleId],
  );
  return u;
}

async function makeApprovedVenue(opts: { admin: string; owner: string }): Promise<string> {
  const venue = await venueService.createVenue(
    { name: 'Stadium', city: 'Baghdad' },
    opts.owner,
  );
  await venueService.approveVenue(venue.id, opts.admin);
  return venue.id;
}

async function addAvailabilityForAllDays(venueId: string, owner: string): Promise<void> {
  for (let dow = 0; dow < 7; dow += 1) {
    await venueService.addAvailabilityRule(venueId, dow, '00:00:00', '23:59:59', owner);
  }
}

async function addFootballConfig(venueId: string, gameId: string, owner: string): Promise<void> {
  await venueService.upsertGameConfig(venueId, gameId, {
    pricingModel: 'hourly', priceAmount: 30000, priceCurrency: 'IQD',
  }, owner);
}

async function insertScheduledMatch(opts: {
  gameId: string; formatId: string;
}): Promise<string> {
  const r = await getTestPool().query<{ id: string }>(
    `INSERT INTO matches (
       "gameId", "formatId", "matchMode", stakes, status,
       "scheduledAt", "creationSource"
     )
     VALUES ($1, $2, 'score_only', 'friendly', 'scheduled',
             CURRENT_TIMESTAMP + INTERVAL '2 hours', 'admin_created')
     RETURNING id`,
    [opts.gameId, opts.formatId],
  );
  return r.rows[0].id;
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('Booking lifecycle: request → confirm → mark paid → complete', () => {
  it('runs the full happy-path end-to-end with all timestamps populated', async () => {
    const admin = await makeAdmin();
    const owner = (await createTestUser({ gender: 'male' })).id;
    const renter = (await createTestUser({ gender: 'male' })).id;
    const gameId = await getGameId('football');

    const venueId = await makeApprovedVenue({ admin: admin.id, owner });
    await addFootballConfig(venueId, gameId, owner);
    await addAvailabilityForAllDays(venueId, owner);

    const start = new Date('2026-06-10T18:00:00Z');
    const end = new Date('2026-06-10T19:00:00Z');
    const booking = await bookingService.requestBooking(
      { venueId, gameId, startsAt: start, endsAt: end },
      renter,
    );
    expect(booking.status).toBe('requested');
    expect(booking.priceAmount).toBe(30000);
    expect(booking.commissionAmount).toBe(2500);
    expect(booking.paymentStatus).toBe('unpaid');

    const confirmed = await bookingService.confirmBooking(booking.id, owner);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.confirmedAt).toBeInstanceOf(Date);
    expect(confirmed.paymentProvider).toBe('manual');
    expect(confirmed.paymentProviderReference).toMatch(/^manual-/);
    expect(confirmed.paymentStatus).toBe('pending');

    const paid = await bookingService.markBookingPaid(booking.id, null, admin.id);
    expect(paid.paymentStatus).toBe('paid');

    const completed = await bookingService.completeBooking(booking.id, owner);
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeInstanceOf(Date);
  });
});

describe('Commission stored matches calculation', () => {
  it('snapshotted commissionAmount equals roundMoney(priceAmount * percent / 100)', async () => {
    const admin = await makeAdmin();
    const owner = (await createTestUser({ gender: 'male' })).id;
    const renter = (await createTestUser({ gender: 'male' })).id;
    const gameId = await getGameId('football');
    const venueId = await makeApprovedVenue({ admin: admin.id, owner });

    // Use a price that makes commission rounding visible:
    // 47390 IQD * 8% = 3791.20 → ceil to 250 step → 4000.
    await venueService.upsertGameConfig(venueId, gameId, {
      pricingModel: 'per_game', priceAmount: 47390, priceCurrency: 'IQD',
    }, owner);
    await addAvailabilityForAllDays(venueId, owner);

    const booking = await bookingService.requestBooking({
      venueId, gameId,
      startsAt: new Date('2026-06-11T18:00:00Z'),
      endsAt: new Date('2026-06-11T20:00:00Z'),
    }, renter);

    expect(booking.priceAmount).toBe(47390);
    expect(booking.commissionAmount).toBe(4000);
    expect(booking.commissionPercentSnapshot).toBeCloseTo(8.0);
  });
});

describe('commissionPercentSnapshot does not drift', () => {
  it('changing platformConfig.venue_commission_percent post-booking leaves the snapshot intact', async () => {
    const admin = await makeAdmin();
    const owner = (await createTestUser({ gender: 'male' })).id;
    const renter = (await createTestUser({ gender: 'male' })).id;
    const gameId = await getGameId('football');
    const venueId = await makeApprovedVenue({ admin: admin.id, owner });
    await addFootballConfig(venueId, gameId, owner);
    await addAvailabilityForAllDays(venueId, owner);

    const booking = await bookingService.requestBooking({
      venueId, gameId,
      startsAt: new Date('2026-06-12T18:00:00Z'),
      endsAt: new Date('2026-06-12T19:00:00Z'),
    }, renter);
    const snapshotAtCreation = booking.commissionPercentSnapshot;

    // Bump the global commission rate.
    await getTestPool().query(
      `UPDATE "platformConfig" SET value = '12.5'::jsonb WHERE key = 'venue_commission_percent'`,
    );

    const fresh = await getTestPool().query<{ commissionPercentSnapshot: string }>(
      `SELECT "commissionPercentSnapshot" FROM "venueBookings" WHERE id = $1`,
      [booking.id],
    );
    expect(Number.parseFloat(fresh.rows[0].commissionPercentSnapshot)).toBeCloseTo(snapshotAtCreation);

    // Restore so other tests aren't affected.
    await getTestPool().query(
      `UPDATE "platformConfig" SET value = '8.0'::jsonb WHERE key = 'venue_commission_percent'`,
    );
  });
});

describe('Match association lifecycle', () => {
  it('binds matches.venueId on request; resets it on cancel', async () => {
    const admin = await makeAdmin();
    const owner = (await createTestUser({ gender: 'male' })).id;
    const renter = (await createTestUser({ gender: 'male' })).id;
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const venueId = await makeApprovedVenue({ admin: admin.id, owner });
    await addFootballConfig(venueId, gameId, owner);
    await addAvailabilityForAllDays(venueId, owner);

    const matchId = await insertScheduledMatch({ gameId, formatId });

    const booking = await bookingService.requestBooking({
      venueId, gameId, matchId,
      startsAt: new Date('2026-06-13T18:00:00Z'),
      endsAt: new Date('2026-06-13T19:00:00Z'),
    }, renter);

    const beforeCancel = await getTestPool().query<{ venueId: string | null }>(
      `SELECT "venueId" FROM matches WHERE id = $1`, [matchId],
    );
    expect(beforeCancel.rows[0].venueId).toBe(venueId);

    await bookingService.cancelBooking(booking.id, renter, 'changed plans');

    const afterCancel = await getTestPool().query<{ venueId: string | null }>(
      `SELECT "venueId" FROM matches WHERE id = $1`, [matchId],
    );
    expect(afterCancel.rows[0].venueId).toBeNull();
  });
});
