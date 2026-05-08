import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MatchInviteService } from './match-invite.service.js';
import type { IMatchInviteRepository } from './match-invite.interface.js';
import type { MatchInvite } from './match-invite.entity.js';
import type { Match } from '../match/match.entity.js';
import type { MatchService } from '../match/match.service.js';
import type { NotificationService } from '../notification/notification.service.js';

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../shared/config/platformConfig/index.js', () => ({
  getConfigInteger: vi.fn(async () => 15),
}));

// transaction(cb) just invokes cb with a fake client. Same pattern as other service tests.
vi.mock('../../db.js', () => ({
  transaction: vi.fn(async (cb: (client: unknown) => Promise<unknown>) =>
    cb({ query: vi.fn(async () => ({ rows: [] })) }),
  ),
  query: vi.fn(async () => []),
}));

import { query } from '../../db.js';

// ─── fixtures ─────────────────────────────────────────────────────────────────

const CREATOR = 'u-creator';
const CLAIMER = 'u-claimer';
const GAME = 'g-football';
const FORMAT = 'f-5v5';
const DIVISION = 'd-mixed';

function makeInvite(overrides: Partial<MatchInvite> = {}): MatchInvite {
  return {
    id: 'inv-1',
    code: 'ARN-AB23',
    qrPayload: 'jwt-stub',
    createdByUserId: CREATOR,
    creatorTeamId: null,
    gameId: GAME,
    formatId: FORMAT,
    divisionId: DIVISION,
    stakes: 'friendly',
    matchMode: 'score_only',
    venueId: null,
    status: 'open',
    claimedByUserId: null,
    claimedByTeamId: null,
    claimedAt: null,
    matchId: null,
    creatorConfirmedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm-new',
    gameId: GAME,
    formatId: FORMAT,
    divisionId: DIVISION,
    seasonId: null,
    matchMode: 'score_only',
    stakes: 'friendly',
    status: 'scheduled',
    venueId: null,
    scheduledAt: new Date(),
    startedAt: null,
    completedAt: null,
    finalScoreA: null,
    finalScoreB: null,
    creationSource: 'qr_invite',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(initial: MatchInvite): IMatchInviteRepository {
  let current = { ...initial };
  return {
    create: vi.fn(),
    findById: vi.fn(async () => current),
    findByCode: vi.fn(async () => current),
    findByIdForUpdate: vi.fn(async () => current),
    setStatus: vi.fn(async (_id, status) => {
      current = { ...current, status };
      return current;
    }),
    setClaimed: vi.fn(async (_id, claimedByUserId, claimedByTeamId) => {
      current = {
        ...current,
        status: 'claimed',
        claimedByUserId,
        claimedByTeamId,
        claimedAt: new Date(),
      };
      return current;
    }),
    setCreatorConfirmed: vi.fn(async (_id, matchId) => {
      current = {
        ...current,
        creatorConfirmedAt: new Date(),
        matchId,
      };
      return current;
    }),
    findExpiringPast: vi.fn(async () => []),
  };
}

function makeMatchServiceStub(createdMatch: Match = makeMatch()) {
  return {
    createMatchFromInvite: vi.fn(async () => ({ match: createdMatch })),
    getMatch: vi.fn(async () => ({ match: createdMatch, participants: [] })),
  } as unknown as MatchService;
}

function makeNotificationServiceStub() {
  return {
    enqueue: vi.fn(async () => undefined),
  } as unknown as NotificationService;
}

// Pretend the game is individual (so we don't need teams) for these unit tests.
function mockIndividualGame(): void {
  vi.mocked(query).mockReset();
  vi.mocked(query).mockImplementation(async (sql: string, _params: unknown) => {
    if (sql.includes('FROM games WHERE id')) {
      return [{ id: GAME, participantType: 'individual', isActive: true }] as never;
    }
    return [] as never;
  });
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('MatchInviteService.claimInvite — friendly stakes', () => {
  let repo: IMatchInviteRepository;
  let matchSvc: MatchService;
  let notif: NotificationService;
  let svc: MatchInviteService;

  beforeEach(() => {
    repo = makeRepo(makeInvite({ stakes: 'friendly' }));
    matchSvc = makeMatchServiceStub();
    notif = makeNotificationServiceStub();
    svc = new MatchInviteService(repo, matchSvc, notif, 'secret');
    mockIndividualGame();
  });

  it('locks a match and returns status=completed in one transaction', async () => {
    const out = await svc.claimInvite({ code: 'ARN-AB23' }, CLAIMER);
    expect(out.status).toBe('completed');
    expect(out.match).toBeDefined();
    expect(out.match!.id).toBe('m-new');
    expect(matchSvc.createMatchFromInvite).toHaveBeenCalledTimes(1);
    expect(repo.setCreatorConfirmed).toHaveBeenCalledWith('inv-1', 'm-new', expect.anything());
    expect(notif.enqueue).toHaveBeenCalled();
  });

  it('notifies both creator and claimer', async () => {
    await svc.claimInvite({ code: 'ARN-AB23' }, CLAIMER);
    const calls = vi.mocked(notif.enqueue).mock.calls;
    const userIds = calls.map((c) => (c[0] as { userId: string }).userId);
    expect(userIds).toContain(CREATOR);
    expect(userIds).toContain(CLAIMER);
  });
});

describe('MatchInviteService.claimInvite — ranked stakes', () => {
  let repo: IMatchInviteRepository;
  let matchSvc: MatchService;
  let notif: NotificationService;
  let svc: MatchInviteService;

  beforeEach(() => {
    repo = makeRepo(makeInvite({ stakes: 'ranked' }));
    matchSvc = makeMatchServiceStub();
    notif = makeNotificationServiceStub();
    svc = new MatchInviteService(repo, matchSvc, notif, 'secret');
    mockIndividualGame();
  });

  it('does NOT create a match; returns status=awaiting_creator_confirmation', async () => {
    const out = await svc.claimInvite({ code: 'ARN-AB23' }, CLAIMER);
    expect(out.status).toBe('awaiting_creator_confirmation');
    expect(out.match).toBeUndefined();
    expect(matchSvc.createMatchFromInvite).not.toHaveBeenCalled();
    expect(repo.setCreatorConfirmed).not.toHaveBeenCalled();
    expect(notif.enqueue).not.toHaveBeenCalled();
  });

  it('marks the invite claimed', async () => {
    await svc.claimInvite({ code: 'ARN-AB23' }, CLAIMER);
    expect(repo.setClaimed).toHaveBeenCalledWith('inv-1', CLAIMER, null, expect.anything());
  });
});

describe('MatchInviteService.confirmClaim — idempotency for friendly', () => {
  it('returns the existing match when invite is already creator-confirmed', async () => {
    const friendlyConfirmed = makeInvite({
      stakes: 'friendly',
      status: 'claimed',
      claimedByUserId: CLAIMER,
      matchId: 'm-existing',
      creatorConfirmedAt: new Date(),
    });
    const repo = makeRepo(friendlyConfirmed);
    const existing = makeMatch({ id: 'm-existing' });
    const matchSvc = makeMatchServiceStub(existing);
    const svc = new MatchInviteService(repo, matchSvc, makeNotificationServiceStub(), 'secret');

    const out = await svc.confirmClaim('inv-1', CLAIMER);
    expect(out.match.id).toBe('m-existing');
    expect(matchSvc.createMatchFromInvite).not.toHaveBeenCalled();
    expect(matchSvc.getMatch).toHaveBeenCalledWith('m-existing');
  });
});
