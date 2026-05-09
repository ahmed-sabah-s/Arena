import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db.js', () => ({
  transaction: vi.fn(async (cb: (client: unknown) => Promise<unknown>) =>
    cb({ query: vi.fn(async () => ({ rows: [] })) }),
  ),
  query: vi.fn(async () => []),
}));

import { transaction, query } from '../../db.js';
import { VenueService } from './venue.service.js';
import type {
  IVenueAvailabilityRepository,
  IVenueGameConfigRepository,
  IVenueRepository,
} from './venue.interface.js';
import type { Venue } from './venue.entity.js';

const ADMIN = 'u-admin';
const OWNER = 'u-owner';
const STRANGER = 'u-stranger';
const VENUE_ID = 'v-1';

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: VENUE_ID, ownerUserId: OWNER, name: 'Test Venue', nameAr: null,
    description: null, city: 'Baghdad', district: null, address: null,
    latitude: null, longitude: null, country: 'IQ', defaultCurrency: 'IQD',
    contactPhone: null, contactEmail: null,
    status: 'pending_approval', approvedAt: null, approvedByUserId: null,
    rejectionReason: null, primaryPhotoFileId: null,
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    ...overrides,
  };
}

function makeRepos() {
  const repo: IVenueRepository = {
    create: vi.fn(async (input) => makeVenue({ ownerUserId: input.ownerUserId, name: input.name })),
    findById: vi.fn(async () => makeVenue()),
    findActiveById: vi.fn(async () => makeVenue({ status: 'active' })),
    findManyByOwner: vi.fn(async () => [makeVenue()]),
    findActiveInCity: vi.fn(async () => []),
    update: vi.fn(async (id) => makeVenue({ id })),
    setStatus: vi.fn(async (id, status) => makeVenue({ id, status })),
    softDelete: vi.fn(),
  };
  const gameConfigRepo: IVenueGameConfigRepository = {
    upsert: vi.fn(),
    findByVenue: vi.fn(),
    findActiveByVenueAndGame: vi.fn(),
  };
  const availabilityRepo: IVenueAvailabilityRepository = {
    addRule: vi.fn(),
    deleteRule: vi.fn(),
    findRulesByVenue: vi.fn(),
    findRulesByVenueAndDay: vi.fn(),
    addBlackout: vi.fn(),
    deleteBlackout: vi.fn(),
    findBlackoutsByVenueInRange: vi.fn(),
  };
  const notificationService = {
    enqueue: vi.fn(async () => ({ id: 'n-1' })),
  } as unknown as import('../notification/notification.service.js').NotificationService;
  return { repo, gameConfigRepo, availabilityRepo, notificationService };
}

function setRoleQuery(adminUsers: Set<string>, currencyActive = true): void {
  vi.mocked(query).mockImplementation(((...args: unknown[]) => {
    const sql = (args[0] ?? '') as string;
    const params = (args[1] ?? {}) as Record<string, unknown>;
    const userId = params.userId as string | undefined;
    if (sql.includes("r.name = 'admin'")) {
      return Promise.resolve([{ exists: adminUsers.has(userId ?? '') }] as never);
    }
    if (sql.includes('FROM currencies')) {
      return Promise.resolve([{ isActive: currencyActive }] as never);
    }
    return Promise.resolve([] as never);
  }) as unknown as typeof query);
}

beforeEach(() => {
  vi.mocked(query).mockReset();
  vi.mocked(transaction).mockClear();
});

describe('VenueService.createVenue', () => {
  it('creates the venue and grants venue_owner role to the caller', async () => {
    setRoleQuery(new Set());
    const txCallSpy = vi.fn(async () => ({ rows: [] }));
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb({ query: txCallSpy } as unknown as Parameters<typeof cb>[0]));
    const { repo, gameConfigRepo, availabilityRepo, notificationService } = makeRepos();
    const svc = new VenueService(repo, gameConfigRepo, availabilityRepo, notificationService);
    const venue = await svc.createVenue({ name: 'Stadium', city: 'Baghdad' }, OWNER);
    expect(venue.ownerUserId).toBe(OWNER);
    expect(repo.create).toHaveBeenCalled();
    expect(txCallSpy).toHaveBeenCalledWith(
      expect.stringContaining(`INSERT INTO "userRole"`),
      expect.objectContaining({ byUserId: OWNER }),
    );
  });

  it('rejects when defaultCurrency is inactive', async () => {
    setRoleQuery(new Set(), /* currencyActive */ false);
    const { repo, gameConfigRepo, availabilityRepo, notificationService } = makeRepos();
    const svc = new VenueService(repo, gameConfigRepo, availabilityRepo, notificationService);
    await expect(
      svc.createVenue({ name: 'Stadium', city: 'Baghdad', defaultCurrency: 'USD' }, OWNER),
    ).rejects.toMatchObject({ message: expect.stringContaining('CURRENCY_INACTIVE') });
  });
});

describe('VenueService.updateVenue', () => {
  it('rejects updates by a non-owner', async () => {
    setRoleQuery(new Set());
    const { repo, gameConfigRepo, availabilityRepo, notificationService } = makeRepos();
    const svc = new VenueService(repo, gameConfigRepo, availabilityRepo, notificationService);
    await expect(svc.updateVenue(VENUE_ID, { name: 'Hijack' }, STRANGER))
      .rejects.toMatchObject({ message: expect.stringContaining('NOT_VENUE_OWNER') });
  });

  it('rejects updates on archived venues', async () => {
    setRoleQuery(new Set());
    const { repo, gameConfigRepo, availabilityRepo, notificationService } = makeRepos();
    vi.mocked(repo.findById).mockResolvedValue(makeVenue({ status: 'archived' }));
    const svc = new VenueService(repo, gameConfigRepo, availabilityRepo, notificationService);
    await expect(svc.updateVenue(VENUE_ID, { name: 'New' }, OWNER))
      .rejects.toMatchObject({ message: expect.stringContaining('VENUE_ARCHIVED') });
  });
});

describe('VenueService.approveVenue', () => {
  it('admin approving moves status to active and sets approvedAt + approvedByUserId', async () => {
    setRoleQuery(new Set([ADMIN]));
    const { repo, gameConfigRepo, availabilityRepo, notificationService } = makeRepos();
    const svc = new VenueService(repo, gameConfigRepo, availabilityRepo, notificationService);
    await svc.approveVenue(VENUE_ID, ADMIN);
    expect(repo.setStatus).toHaveBeenCalledWith(
      VENUE_ID, 'active', ADMIN, expect.objectContaining({ approvedAt: expect.any(Date) }),
    );
    expect(notificationService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      userId: OWNER, type: 'venue_approved',
    }));
  });

  it('rejects when caller is not admin', async () => {
    setRoleQuery(new Set());
    const { repo, gameConfigRepo, availabilityRepo, notificationService } = makeRepos();
    const svc = new VenueService(repo, gameConfigRepo, availabilityRepo, notificationService);
    await expect(svc.approveVenue(VENUE_ID, STRANGER))
      .rejects.toMatchObject({ message: expect.stringContaining('NOT_ADMIN') });
  });

  it('rejects when status is not pending_approval or paused', async () => {
    setRoleQuery(new Set([ADMIN]));
    const { repo, gameConfigRepo, availabilityRepo, notificationService } = makeRepos();
    vi.mocked(repo.findById).mockResolvedValue(makeVenue({ status: 'active' }));
    const svc = new VenueService(repo, gameConfigRepo, availabilityRepo, notificationService);
    await expect(svc.approveVenue(VENUE_ID, ADMIN))
      .rejects.toMatchObject({ message: expect.stringContaining('NOT_APPROVABLE') });
  });
});

describe('VenueService.pause / resume', () => {
  it('owner can pause an active venue', async () => {
    setRoleQuery(new Set());
    const { repo, gameConfigRepo, availabilityRepo, notificationService } = makeRepos();
    vi.mocked(repo.findById).mockResolvedValue(makeVenue({ status: 'active' }));
    const svc = new VenueService(repo, gameConfigRepo, availabilityRepo, notificationService);
    await svc.pauseVenue(VENUE_ID, OWNER);
    expect(repo.setStatus).toHaveBeenCalledWith(VENUE_ID, 'paused', OWNER, expect.anything());
  });

  it('resume requires a previous approval', async () => {
    setRoleQuery(new Set());
    const { repo, gameConfigRepo, availabilityRepo, notificationService } = makeRepos();
    vi.mocked(repo.findById).mockResolvedValue(makeVenue({ status: 'paused', approvedAt: null }));
    const svc = new VenueService(repo, gameConfigRepo, availabilityRepo, notificationService);
    await expect(svc.resumeVenue(VENUE_ID, OWNER))
      .rejects.toMatchObject({ message: expect.stringContaining('NEVER_APPROVED') });
  });
});
