import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefereeProfileService } from './referee.profile.service.js';
import type {
  IRefereeCertificationRepository,
  IRefereeProfileRepository,
} from './referee.interface.js';

// Module mocks — we hand-stub `query` to control the assertAdmin / referee-role
// SQL calls that live inline in the service.
vi.mock('../../db.js', () => ({
  query: vi.fn(async () => []),
  transaction: vi.fn(),
}));

import { query } from '../../db.js';

const ADMIN_ID = 'u-admin';
const NON_ADMIN_ID = 'u-someone';
const REFEREE_ID = 'u-ref';
const GAME_ID = 'g-football';

function mockRoleQueryAs(adminUsers: Set<string>, refereeUsers: Set<string>): void {
  vi.mocked(query).mockImplementation(((...args: unknown[]) => {
    const sql = (args[0] ?? '') as string;
    const params = (args[1] ?? {}) as Record<string, unknown>;
    const userId = params.userId as string | undefined;
    if (sql.includes("r.name = 'admin'")) {
      return Promise.resolve([{ exists: adminUsers.has(userId ?? '') }] as never);
    }
    if (sql.includes("r.name = 'referee'")) {
      return Promise.resolve([{ exists: refereeUsers.has(userId ?? '') }] as never);
    }
    return Promise.resolve([] as never);
  }) as unknown as typeof query);
}

function makeProfileRepo(): IRefereeProfileRepository {
  return {
    create: vi.fn(async (userId) => ({
      id: 'rp-1', userId, reliabilityScore: 5, totalMatchesOfficiated: 0,
      totalNoShows: 0, totalCaptainFlags: 0, baseCity: null,
      isAcceptingAssignments: true, lastOfficiatedAt: null, bio: null,
      createdAt: new Date(), updatedAt: new Date(),
    })),
    findByUserId: vi.fn(async () => null),
    findByUserIdForUpdate: vi.fn(async () => null),
    update: vi.fn(),
    incrementCounter: vi.fn(),
    applyReliabilityDelta: vi.fn(),
    setLastOfficiatedAt: vi.fn(),
  } as unknown as IRefereeProfileRepository;
}

function makeCertRepo(existing = false): IRefereeCertificationRepository {
  return {
    create: vi.fn(async (input) => ({
      id: 'cert-1',
      userId: input.userId,
      gameId: input.gameId,
      certifiedAt: new Date(),
      certifiedByUserId: input.certifiedByUserId,
      revokedAt: null,
      revokedByUserId: null,
      revocationReason: null,
      notes: input.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    findActiveByUser: vi.fn(),
    findActiveByGame: vi.fn(),
    findActiveByUserAndGame: vi.fn(async () => existing
      ? {
          id: 'cert-existing', userId: REFEREE_ID, gameId: GAME_ID,
          certifiedAt: new Date(), certifiedByUserId: ADMIN_ID,
          revokedAt: null, revokedByUserId: null, revocationReason: null,
          notes: null, createdAt: new Date(), updatedAt: new Date(),
        }
      : null,
    ),
    revoke: vi.fn(async (id) => ({
      id, userId: REFEREE_ID, gameId: GAME_ID, certifiedAt: new Date(),
      certifiedByUserId: ADMIN_ID, revokedAt: new Date(), revokedByUserId: ADMIN_ID,
      revocationReason: 'reason', notes: null, createdAt: new Date(), updatedAt: new Date(),
    })),
    userIsCertifiedFor: vi.fn(async () => false),
  } as unknown as IRefereeCertificationRepository;
}

describe('RefereeProfileService.certifyForGame', () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it('happy path: admin certifies a referee for a game', async () => {
    mockRoleQueryAs(new Set([ADMIN_ID]), new Set([REFEREE_ID]));
    const profileRepo = makeProfileRepo();
    vi.mocked(profileRepo.findByUserId).mockResolvedValue({
      id: 'rp-1', userId: REFEREE_ID, reliabilityScore: 5, totalMatchesOfficiated: 0,
      totalNoShows: 0, totalCaptainFlags: 0, baseCity: null,
      isAcceptingAssignments: true, lastOfficiatedAt: null, bio: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const certRepo = makeCertRepo(false);
    const svc = new RefereeProfileService(profileRepo, certRepo);
    const cert = await svc.certifyForGame(REFEREE_ID, GAME_ID, ADMIN_ID, 'good ref');
    expect(cert.userId).toBe(REFEREE_ID);
    expect(certRepo.create).toHaveBeenCalledWith({
      userId: REFEREE_ID, gameId: GAME_ID, certifiedByUserId: ADMIN_ID, notes: 'good ref',
    });
  });

  it('rejects when caller is not an admin', async () => {
    mockRoleQueryAs(new Set(), new Set([REFEREE_ID]));
    const svc = new RefereeProfileService(makeProfileRepo(), makeCertRepo(false));
    await expect(
      svc.certifyForGame(REFEREE_ID, GAME_ID, NON_ADMIN_ID),
    ).rejects.toMatchObject({ message: expect.stringContaining('NOT_ADMIN') });
  });

  it('rejects when the referee is already certified for this game', async () => {
    mockRoleQueryAs(new Set([ADMIN_ID]), new Set([REFEREE_ID]));
    const profileRepo = makeProfileRepo();
    vi.mocked(profileRepo.findByUserId).mockResolvedValue({
      id: 'rp-1', userId: REFEREE_ID, reliabilityScore: 5, totalMatchesOfficiated: 0,
      totalNoShows: 0, totalCaptainFlags: 0, baseCity: null,
      isAcceptingAssignments: true, lastOfficiatedAt: null, bio: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const svc = new RefereeProfileService(profileRepo, makeCertRepo(true));
    await expect(
      svc.certifyForGame(REFEREE_ID, GAME_ID, ADMIN_ID),
    ).rejects.toMatchObject({ message: expect.stringContaining('ALREADY_CERTIFIED') });
  });
});

describe('RefereeProfileService.revokeCertification', () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it('happy path: admin revokes an active certification', async () => {
    mockRoleQueryAs(new Set([ADMIN_ID]), new Set([REFEREE_ID]));
    const certRepo = makeCertRepo(true);
    const svc = new RefereeProfileService(makeProfileRepo(), certRepo);
    const revoked = await svc.revokeCertification(REFEREE_ID, GAME_ID, ADMIN_ID, 'biased');
    expect(revoked.revokedAt).not.toBeNull();
    expect(certRepo.revoke).toHaveBeenCalledWith('cert-existing', ADMIN_ID, 'biased');
  });

  it('throws NotFoundError when no active certification exists', async () => {
    mockRoleQueryAs(new Set([ADMIN_ID]), new Set());
    const svc = new RefereeProfileService(makeProfileRepo(), makeCertRepo(false));
    await expect(
      svc.revokeCertification(REFEREE_ID, GAME_ID, ADMIN_ID, 'reason'),
    ).rejects.toThrow();
  });
});

describe('RefereeProfileService.createOrGetProfile', () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it('returns existing profile if present', async () => {
    const profileRepo = makeProfileRepo();
    vi.mocked(profileRepo.findByUserId).mockResolvedValue({
      id: 'rp-existing', userId: REFEREE_ID, reliabilityScore: 4.2, totalMatchesOfficiated: 12,
      totalNoShows: 1, totalCaptainFlags: 0, baseCity: 'Baghdad',
      isAcceptingAssignments: true, lastOfficiatedAt: null, bio: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const svc = new RefereeProfileService(profileRepo, makeCertRepo(false));
    const profile = await svc.createOrGetProfile(REFEREE_ID);
    expect(profile.id).toBe('rp-existing');
    expect(profileRepo.create).not.toHaveBeenCalled();
  });

  it('creates a new profile when none exists', async () => {
    const profileRepo = makeProfileRepo();
    const svc = new RefereeProfileService(profileRepo, makeCertRepo(false));
    const profile = await svc.createOrGetProfile(REFEREE_ID);
    expect(profile.userId).toBe(REFEREE_ID);
    expect(profileRepo.create).toHaveBeenCalledWith(REFEREE_ID);
  });
});
