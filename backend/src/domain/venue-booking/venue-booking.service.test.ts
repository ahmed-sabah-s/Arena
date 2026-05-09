import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../shared/config/platformConfig/index.js', () => ({
  getConfigNumber: vi.fn(async (key: string) => {
    if (key === 'venue_commission_percent') return 8.0;
    return 0;
  }),
  getConfigBoolean: vi.fn(async () => true),
  getConfigInteger: vi.fn(async () => 0),
}));

vi.mock('../../db.js', () => ({
  transaction: vi.fn(async (cb: (client: unknown) => Promise<unknown>) =>
    cb({ query: vi.fn(async () => ({ rows: [] })) }),
  ),
  query: vi.fn(async () => []),
}));

import { transaction, query } from '../../db.js';
import { VenueBookingService } from './venue-booking.service.js';
import type { VenueBooking } from './venue-booking.entity.js';
import type { Venue, VenueGameConfig } from '../venue/venue.entity.js';
import type {
  IVenueAvailabilityRepository,
  IVenueGameConfigRepository,
  IVenueRepository,
} from '../venue/venue.interface.js';
import type { IVenueBookingRepository } from './venue-booking.interface.js';
import type { PaymentProvider } from '../../infrastructure/payment/index.js';

const OWNER = 'u-owner';
const RENTER = 'u-renter';
const ADMIN = 'u-admin';
const VENUE_ID = 'v-1';
const GAME_ID = 'g-1';

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: VENUE_ID, ownerUserId: OWNER, name: 'V', nameAr: null,
    description: null, city: 'Baghdad', district: null, address: null,
    latitude: null, longitude: null, country: 'IQ', defaultCurrency: 'IQD',
    contactPhone: null, contactEmail: null,
    status: 'active', approvedAt: new Date(), approvedByUserId: ADMIN,
    rejectionReason: null, primaryPhotoFileId: null,
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<VenueGameConfig> = {}): VenueGameConfig {
  return {
    id: 'vgc-1', venueId: VENUE_ID, gameId: GAME_ID,
    pricingModel: 'hourly', priceAmount: 30000, priceCurrency: 'IQD',
    minBookingMinutes: null, maxBookingMinutes: null,
    capacity: 1, isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeBooking(overrides: Partial<VenueBooking> = {}): VenueBooking {
  return {
    id: 'b-1', venueId: VENUE_ID, matchId: null, gameId: GAME_ID,
    requestedByUserId: RENTER,
    startsAt: new Date(Date.UTC(2026, 4, 10, 18, 0, 0)),
    endsAt: new Date(Date.UTC(2026, 4, 10, 19, 0, 0)),
    priceAmount: 30000, priceCurrency: 'IQD',
    commissionAmount: 2500, commissionCurrency: 'IQD',
    commissionPercentSnapshot: 8.0,
    status: 'requested', paymentStatus: 'unpaid',
    paymentProvider: null, paymentProviderReference: null,
    confirmedAt: null, declinedAt: null, declineReason: null,
    cancelledAt: null, cancelledByUserId: null, cancelReason: null,
    completedAt: null, notes: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepos() {
  const bookingRepo: IVenueBookingRepository = {
    create: vi.fn(async (input) => makeBooking({
      venueId: input.venueId, matchId: input.matchId,
      requestedByUserId: input.requestedByUserId,
      startsAt: input.startsAt, endsAt: input.endsAt,
      priceAmount: input.priceAmount, commissionAmount: input.commissionAmount,
      commissionPercentSnapshot: input.commissionPercentSnapshot,
    })),
    findById: vi.fn(),
    findByIdForUpdate: vi.fn(),
    findManyByVenue: vi.fn(),
    findManyByRequester: vi.fn(),
    findOverlappingActive: vi.fn(async () => []),
    setStatus: vi.fn(async (id, status) => makeBooking({ id, status })),
    attachPaymentReference: vi.fn(async (id) => makeBooking({ id, paymentProvider: 'manual' })),
    setPaymentStatus: vi.fn(async (id, paymentStatus) => makeBooking({ id, paymentStatus })),
  };
  const venueRepo: IVenueRepository = {
    create: vi.fn(),
    findById: vi.fn(async () => makeVenue()),
    findActiveById: vi.fn(async () => makeVenue()),
    findManyByOwner: vi.fn(),
    findActiveInCity: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    softDelete: vi.fn(),
  };
  const gameConfigRepo: IVenueGameConfigRepository = {
    upsert: vi.fn(),
    findByVenue: vi.fn(),
    findActiveByVenueAndGame: vi.fn(async () => makeConfig()),
  };
  const availabilityRepo: IVenueAvailabilityRepository = {
    addRule: vi.fn(),
    deleteRule: vi.fn(),
    findRulesByVenue: vi.fn(),
    findRulesByVenueAndDay: vi.fn(async () => [{
      id: 'r-1', venueId: VENUE_ID, dayOfWeek: 0,
      openTime: '00:00:00', closeTime: '23:59:59',
      isActive: true, createdAt: new Date(), updatedAt: new Date(),
    }]),
    addBlackout: vi.fn(),
    deleteBlackout: vi.fn(),
    findBlackoutsByVenueInRange: vi.fn(async () => []),
  };
  const notificationService = {
    enqueue: vi.fn(async () => ({ id: 'n-1' })),
  } as unknown as import('../notification/notification.service.js').NotificationService;
  const paymentProvider: PaymentProvider = {
    name: 'manual',
    initiate: vi.fn(async () => ({ success: true, providerReference: 'manual-abc', status: 'pending' })),
    checkStatus: vi.fn(async () => ({ success: true, status: 'pending' })),
    markPaid: vi.fn(async () => ({ success: true, status: 'paid', providerReference: 'manual-abc' })),
  };
  return { bookingRepo, venueRepo, gameConfigRepo, availabilityRepo, notificationService, paymentProvider };
}

function setQueryMock(opts: { admin?: Set<string>; currencyActive?: boolean } = {}): void {
  vi.mocked(query).mockImplementation(((...args: unknown[]) => {
    const sql = (args[0] ?? '') as string;
    const params = (args[1] ?? {}) as Record<string, unknown>;
    const userId = params.userId as string | undefined;
    if (sql.includes("r.name = 'admin'")) {
      return Promise.resolve([{ exists: opts.admin?.has(userId ?? '') ?? false }] as never);
    }
    if (sql.includes('FROM currencies')) {
      return Promise.resolve([{
        code: 'IQD', name: 'Iraqi Dinar', nameAr: 'دينار', symbol: 'ع.د',
        subunitFactor: 1, displayRoundingStep: 250, displayRoundingMode: 'ceil',
        isActive: opts.currencyActive ?? true,
      }] as never);
    }
    return Promise.resolve([] as never);
  }) as unknown as typeof query);
}

beforeEach(() => {
  vi.mocked(query).mockReset();
  vi.mocked(transaction).mockClear();
});

describe('VenueBookingService.requestBooking', () => {
  it('hourly pricing: 1 hour at 30000 IQD/hr → priceAmount 30000', async () => {
    setQueryMock();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await svc.requestBooking({
      venueId: VENUE_ID, gameId: GAME_ID,
      startsAt: new Date(Date.UTC(2026, 4, 10, 18, 0, 0)),
      endsAt: new Date(Date.UTC(2026, 4, 10, 19, 0, 0)),
    }, RENTER);
    expect(repos.bookingRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        priceAmount: 30000,
        commissionAmount: 2500, // 8% of 30000 = 2400, rounded up to 250 step = 2500
        commissionPercentSnapshot: 8.0,
        priceCurrency: 'IQD',
      }),
      expect.anything(),
    );
  });

  it('per_game pricing: flat priceAmount regardless of duration', async () => {
    setQueryMock();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    vi.mocked(repos.gameConfigRepo.findActiveByVenueAndGame).mockResolvedValue(
      makeConfig({ pricingModel: 'per_game', priceAmount: 5000 }),
    );
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await svc.requestBooking({
      venueId: VENUE_ID, gameId: GAME_ID,
      startsAt: new Date(Date.UTC(2026, 4, 10, 18, 0, 0)),
      endsAt: new Date(Date.UTC(2026, 4, 10, 21, 0, 0)),
    }, RENTER);
    expect(repos.bookingRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ priceAmount: 5000 }),
      expect.anything(),
    );
  });

  it('rejects when venue is not active', async () => {
    setQueryMock();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    vi.mocked(repos.venueRepo.findActiveById).mockResolvedValue(null);
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await expect(svc.requestBooking({
      venueId: VENUE_ID, gameId: GAME_ID,
      startsAt: new Date(Date.UTC(2026, 4, 10, 18, 0, 0)),
      endsAt: new Date(Date.UTC(2026, 4, 10, 19, 0, 0)),
    }, RENTER)).rejects.toMatchObject({ message: expect.stringContaining('Venue') });
  });

  it('rejects when no game config exists for the (venue, game) pair', async () => {
    setQueryMock();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    vi.mocked(repos.gameConfigRepo.findActiveByVenueAndGame).mockResolvedValue(null);
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await expect(svc.requestBooking({
      venueId: VENUE_ID, gameId: GAME_ID,
      startsAt: new Date(Date.UTC(2026, 4, 10, 18, 0, 0)),
      endsAt: new Date(Date.UTC(2026, 4, 10, 19, 0, 0)),
    }, RENTER)).rejects.toThrow();
  });

  it('rejects when booking falls outside open hours (no rule for day)', async () => {
    setQueryMock();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    vi.mocked(repos.availabilityRepo.findRulesByVenueAndDay).mockResolvedValue([]);
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await expect(svc.requestBooking({
      venueId: VENUE_ID, gameId: GAME_ID,
      startsAt: new Date(Date.UTC(2026, 4, 10, 18, 0, 0)),
      endsAt: new Date(Date.UTC(2026, 4, 10, 19, 0, 0)),
    }, RENTER)).rejects.toMatchObject({ message: expect.stringContaining('VENUE_NOT_OPEN') });
  });

  it('translates pg exclusion-violation (23P01) to VENUE_TIME_SLOT_UNAVAILABLE', async () => {
    setQueryMock();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    vi.mocked(repos.bookingRepo.create).mockRejectedValueOnce(Object.assign(new Error('exclusion'), { code: '23P01' }));
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await expect(svc.requestBooking({
      venueId: VENUE_ID, gameId: GAME_ID,
      startsAt: new Date(Date.UTC(2026, 4, 10, 18, 0, 0)),
      endsAt: new Date(Date.UTC(2026, 4, 10, 19, 0, 0)),
    }, RENTER)).rejects.toMatchObject({ message: expect.stringContaining('VENUE_TIME_SLOT_UNAVAILABLE') });
  });

  it('rejects bookings shorter than minBookingMinutes', async () => {
    setQueryMock();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    vi.mocked(repos.gameConfigRepo.findActiveByVenueAndGame).mockResolvedValue(
      makeConfig({ minBookingMinutes: 90 }),
    );
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await expect(svc.requestBooking({
      venueId: VENUE_ID, gameId: GAME_ID,
      startsAt: new Date(Date.UTC(2026, 4, 10, 18, 0, 0)),
      endsAt: new Date(Date.UTC(2026, 4, 10, 19, 0, 0)),
    }, RENTER)).rejects.toMatchObject({ message: expect.stringContaining('BELOW_MIN_DURATION') });
  });
});

describe('VenueBookingService.confirmBooking', () => {
  it('owner confirms; payment provider initiates and reference is attached', async () => {
    setQueryMock();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    vi.mocked(repos.bookingRepo.findByIdForUpdate).mockResolvedValue(makeBooking({ status: 'requested' }));
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await svc.confirmBooking('b-1', OWNER);
    expect(repos.paymentProvider.initiate).toHaveBeenCalled();
    expect(repos.bookingRepo.setStatus).toHaveBeenCalledWith('b-1', 'confirmed', expect.anything());
    expect(repos.bookingRepo.attachPaymentReference).toHaveBeenCalledWith(
      'b-1', 'manual', 'manual-abc', 'pending', expect.anything(),
    );
    expect(repos.notificationService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ userId: RENTER, type: 'venue_booking_confirmed' }),
      expect.anything(),
    );
  });

  it('rejects when caller is not the venue owner', async () => {
    setQueryMock();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    vi.mocked(repos.bookingRepo.findByIdForUpdate).mockResolvedValue(makeBooking({ status: 'requested' }));
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await expect(svc.confirmBooking('b-1', 'u-stranger'))
      .rejects.toMatchObject({ message: expect.stringContaining('NOT_VENUE_OWNER') });
  });
});

describe('VenueBookingService.cancelBooking', () => {
  it('renter cancels their own booking; both parties get a cancel notification', async () => {
    setQueryMock();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    vi.mocked(repos.bookingRepo.findByIdForUpdate).mockResolvedValue(makeBooking({ status: 'confirmed' }));
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await svc.cancelBooking('b-1', RENTER, 'change of plans');
    expect(repos.bookingRepo.setStatus).toHaveBeenCalledWith(
      'b-1', 'cancelled', expect.anything(),
      expect.objectContaining({ cancelledByUserId: RENTER }),
    );
    // Owner gets notified (other party).
    expect(repos.notificationService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER, type: 'venue_booking_cancelled' }),
      expect.anything(),
    );
  });

  it('marks paid bookings for refund on cancel', async () => {
    setQueryMock();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    vi.mocked(repos.bookingRepo.findByIdForUpdate).mockResolvedValue(makeBooking({ status: 'confirmed', paymentStatus: 'paid' }));
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await svc.cancelBooking('b-1', OWNER, 'closing early');
    expect(repos.bookingRepo.setPaymentStatus).toHaveBeenCalledWith(
      'b-1', 'refunded', expect.anything(),
    );
  });

  it('rejects when caller is neither requester nor owner', async () => {
    setQueryMock();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    vi.mocked(repos.bookingRepo.findByIdForUpdate).mockResolvedValue(makeBooking({ status: 'confirmed' }));
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await expect(svc.cancelBooking('b-1', 'u-stranger'))
      .rejects.toMatchObject({ message: expect.stringContaining('NOT_BOOKING_PARTY') });
  });
});

describe('VenueBookingService.markBookingPaid', () => {
  it('admin marks booking paid; provider markPaid called', async () => {
    setQueryMock({ admin: new Set([ADMIN]) });
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    vi.mocked(repos.bookingRepo.findByIdForUpdate).mockResolvedValue(
      makeBooking({ paymentStatus: 'pending', paymentProviderReference: 'manual-abc' }),
    );
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await svc.markBookingPaid('b-1', null, ADMIN);
    expect(repos.paymentProvider.markPaid).toHaveBeenCalledWith('manual-abc', ADMIN);
    expect(repos.bookingRepo.setPaymentStatus).toHaveBeenCalledWith(
      'b-1', 'paid', expect.anything(), 'manual-abc',
    );
  });

  it('rejects when caller is not admin', async () => {
    setQueryMock({ admin: new Set() });
    const repos = makeRepos();
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await expect(svc.markBookingPaid('b-1', null, 'u-stranger'))
      .rejects.toMatchObject({ message: expect.stringContaining('NOT_ADMIN') });
  });

  it('idempotent: re-marking an already-paid booking is a no-op', async () => {
    setQueryMock({ admin: new Set([ADMIN]) });
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient as unknown as Parameters<typeof cb>[0]));
    const repos = makeRepos();
    vi.mocked(repos.bookingRepo.findByIdForUpdate).mockResolvedValue(
      makeBooking({ paymentStatus: 'paid' }),
    );
    const svc = new VenueBookingService(
      repos.bookingRepo, repos.venueRepo, repos.gameConfigRepo, repos.availabilityRepo,
      repos.notificationService, repos.paymentProvider,
    );
    await svc.markBookingPaid('b-1', null, ADMIN);
    expect(repos.bookingRepo.setPaymentStatus).not.toHaveBeenCalled();
  });
});
