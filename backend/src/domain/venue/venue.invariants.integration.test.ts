import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  closeTestPool,
  createTestUser,
  getTestPool,
  truncateTables,
} from '../../test/setup.js';

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

async function makeOwner(): Promise<string> {
  const u = await createTestUser({ gender: 'male' });
  return u.id;
}

async function makeVenueRow(ownerUserId: string): Promise<string> {
  const r = await getTestPool().query<{ id: string }>(
    `INSERT INTO venues ("ownerUserId", name, city, status, "approvedAt")
     VALUES ($1, 'Test Venue', 'Baghdad', 'active', CURRENT_TIMESTAMP)
     RETURNING id`,
    [ownerUserId],
  );
  return r.rows[0].id;
}

async function insertBooking(opts: {
  venueId: string;
  gameId: string;
  requestedBy: string;
  startsAt: Date;
  endsAt: Date;
  status: 'requested' | 'confirmed' | 'declined' | 'cancelled' | 'completed' | 'no_show';
}): Promise<string> {
  const r = await getTestPool().query<{ id: string }>(
    `INSERT INTO "venueBookings" (
       "venueId", "gameId", "requestedByUserId",
       "startsAt", "endsAt",
       "priceAmount", "priceCurrency",
       "commissionAmount", "commissionCurrency",
       "commissionPercentSnapshot", status
     )
     VALUES ($1, $2, $3, $4, $5,
             30000, 'IQD',
             2500, 'IQD',
             8.0, $6)
     RETURNING id`,
    [opts.venueId, opts.gameId, opts.requestedBy, opts.startsAt, opts.endsAt, opts.status],
  );
  return r.rows[0].id;
}

describe('venueBookings exclusion constraint', () => {
  it('rejects an overlapping confirmed booking on the same venue', async () => {
    const ownerId = await makeOwner();
    const renterId = (await createTestUser({ gender: 'male' })).id;
    const venueId = await makeVenueRow(ownerId);
    const gameId = await getGameId('football');

    const start = new Date('2026-06-01T14:00:00Z');
    const end = new Date('2026-06-01T15:00:00Z');
    await insertBooking({ venueId, gameId, requestedBy: renterId, startsAt: start, endsAt: end, status: 'confirmed' });

    // Overlapping window: 14:30–15:30.
    const overlapStart = new Date('2026-06-01T14:30:00Z');
    const overlapEnd = new Date('2026-06-01T15:30:00Z');
    await expect(
      insertBooking({ venueId, gameId, requestedBy: renterId, startsAt: overlapStart, endsAt: overlapEnd, status: 'confirmed' }),
    ).rejects.toThrow(/exclusion|conflicting/i);
  });

  it('allows touching bookings (14:00–15:00 + 15:00–16:00)', async () => {
    const ownerId = await makeOwner();
    const renterId = (await createTestUser({ gender: 'male' })).id;
    const venueId = await makeVenueRow(ownerId);
    const gameId = await getGameId('football');

    const a1 = new Date('2026-06-02T14:00:00Z');
    const a2 = new Date('2026-06-02T15:00:00Z');
    const b2 = new Date('2026-06-02T16:00:00Z');

    const id1 = await insertBooking({ venueId, gameId, requestedBy: renterId, startsAt: a1, endsAt: a2, status: 'confirmed' });
    const id2 = await insertBooking({ venueId, gameId, requestedBy: renterId, startsAt: a2, endsAt: b2, status: 'confirmed' });
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
  });

  it('cancelled bookings do not block new ones for the same window', async () => {
    const ownerId = await makeOwner();
    const renterId = (await createTestUser({ gender: 'male' })).id;
    const venueId = await makeVenueRow(ownerId);
    const gameId = await getGameId('football');

    const start = new Date('2026-06-03T14:00:00Z');
    const end = new Date('2026-06-03T15:00:00Z');
    const id1 = await insertBooking({ venueId, gameId, requestedBy: renterId, startsAt: start, endsAt: end, status: 'confirmed' });
    await getTestPool().query(`UPDATE "venueBookings" SET status = 'cancelled' WHERE id = $1`, [id1]);

    // Now a fresh booking for the same window should succeed.
    const id2 = await insertBooking({ venueId, gameId, requestedBy: renterId, startsAt: start, endsAt: end, status: 'confirmed' });
    expect(id2).toBeTruthy();
  });

  it('different venues do not block each other', async () => {
    const ownerId = await makeOwner();
    const renterId = (await createTestUser({ gender: 'male' })).id;
    const v1 = await makeVenueRow(ownerId);
    const v2 = await makeVenueRow(ownerId);
    const gameId = await getGameId('football');

    const start = new Date('2026-06-04T14:00:00Z');
    const end = new Date('2026-06-04T15:00:00Z');
    const id1 = await insertBooking({ venueId: v1, gameId, requestedBy: renterId, startsAt: start, endsAt: end, status: 'confirmed' });
    const id2 = await insertBooking({ venueId: v2, gameId, requestedBy: renterId, startsAt: start, endsAt: end, status: 'confirmed' });
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });
});
