import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db.js', () => ({
  transaction: vi.fn(async (cb: (client: unknown) => Promise<unknown>) =>
    cb({ query: vi.fn(async () => ({ rows: [] })) }),
  ),
  query: vi.fn(async () => []),
}));

vi.mock('../match/match.elo.js', () => ({
  applyMatchEloAndStats: vi.fn(async () => ({
    matchId: 'm-1', finalScoreA: 2, finalScoreB: 1, isRanked: true,
    sides: [
      { side: 'A', result: 'win', eloChange: 16, mmrChange: 16, newElo: 1016, newMmr: 1016, cooldownMultiplier: 1 },
      { side: 'B', result: 'loss', eloChange: -16, mmrChange: -16, newElo: 984, newMmr: 984, cooldownMultiplier: 1 },
    ],
  })),
}));

import { transaction, query } from '../../db.js';
import { DisputeService, type DisputeServiceDeps } from './dispute.service.js';
import type { Dispute, Match, MatchSubmission } from '../match/match.entity.js';

const ADMIN = 'u-admin';

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm-1', gameId: 'g-1', formatId: 'f-1', divisionId: null, seasonId: null,
    matchMode: 'score_only', stakes: 'ranked', status: 'disputed',
    venueId: null, scheduledAt: new Date(),
    startedAt: new Date(), completedAt: null,
    finalScoreA: null, finalScoreB: null, creationSource: 'admin_created',
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeDispute(overrides: Partial<Dispute> = {}): Dispute {
  return {
    id: 'd-1', matchId: 'm-1', openedByUserId: 'u-1', openedBySide: 'A',
    reason: 'score_disagreement', claimedScoreA: 3, claimedScoreB: 1,
    status: 'open', resolution: null, resolvedByUserId: null, resolvedAt: null,
    resolutionNotes: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeSubmission(side: 'A' | 'B', a: number, b: number): MatchSubmission {
  return {
    id: `s-${side}`, matchId: 'm-1', side,
    submittedByUserId: 'u-1', scoreA: a, scoreB: b,
    submittedAt: new Date(), notes: null,
  };
}

function makeDeps(): DisputeServiceDeps {
  return {
    disputeRepo: {
      create: vi.fn(),
      findOpenForMatch: vi.fn(),
      findById: vi.fn(async () => makeDispute()),
      findByIdForUpdate: vi.fn(async () => makeDispute()),
      listOpen: vi.fn(async () => [makeDispute()]),
      setResolved: vi.fn(async (id, resolution) => makeDispute({ id, status: 'resolved', resolution })),
      setDismissed: vi.fn(async (id) => makeDispute({ id, status: 'dismissed' })),
    },
    matchRepo: {
      findById: vi.fn(async () => makeMatch()),
      findByIdForUpdate: vi.fn(async () => makeMatch()),
      create: vi.fn(),
      updateStatus: vi.fn(async (id, status) => makeMatch({ id, status })),
      setStarted: vi.fn(),
      setCompleted: vi.fn(async (id, a, b) => makeMatch({ id, status: 'completed', finalScoreA: a, finalScoreB: b })),
      findAwaitingConfirmationOlderThan: vi.fn(),
    } as unknown as DisputeServiceDeps['matchRepo'],
    participantRepo: {
      findByMatchId: vi.fn(async () => []),
      findByMatchAndSide: vi.fn(),
      create: vi.fn(),
      setStatKeeper: vi.fn(),
    } as unknown as DisputeServiceDeps['participantRepo'],
    submissionRepo: {
      findByMatch: vi.fn(async () => [makeSubmission('A', 3, 1), makeSubmission('B', 1, 3)]),
      upsert: vi.fn(),
    } as unknown as DisputeServiceDeps['submissionRepo'],
    statRepo: {
      create: vi.fn(),
      findByMatch: vi.fn(async () => []),
    } as unknown as DisputeServiceDeps['statRepo'],
    teamEloRepo: { findByTeam: vi.fn() } as unknown as DisputeServiceDeps['teamEloRepo'],
    playerEloRepo: { findByUser: vi.fn() } as unknown as DisputeServiceDeps['playerEloRepo'],
    notificationService: {
      enqueue: vi.fn(async () => ({ id: 'n-1' })),
    } as unknown as DisputeServiceDeps['notificationService'],
    auditLogService: {
      recordAdminAction: vi.fn(async () => undefined),
    } as unknown as DisputeServiceDeps['auditLogService'],
  };
}

function setAdmin(yes: boolean): void {
  vi.mocked(query).mockImplementation(((...args: unknown[]) => {
    const sql = (args[0] ?? '') as string;
    if (sql.includes("r.name = 'admin'")) {
      return Promise.resolve([{ exists: yes }] as never);
    }
    return Promise.resolve([] as never);
  }) as unknown as typeof query);
}

beforeEach(() => {
  vi.mocked(query).mockReset();
  vi.mocked(transaction).mockClear();
});

describe('DisputeService.resolveDispute', () => {
  it('side_a_result_stands applies side A submission and completes the match', async () => {
    setAdmin(true);
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) =>
      cb(txClient as unknown as Parameters<typeof cb>[0]),
    );
    const svc = new DisputeService(deps);
    const out = await svc.resolveDispute('d-1', { resolution: 'side_a_result_stands' }, ADMIN);
    expect(out.match.status).toBe('completed');
    expect(out.match.finalScoreA).toBe(3);
    expect(out.match.finalScoreB).toBe(1);
    expect(deps.disputeRepo.setResolved).toHaveBeenCalledWith(
      'd-1', 'side_a_result_stands', null, ADMIN, expect.anything(),
    );
    expect(deps.auditLogService.recordAdminAction).toHaveBeenCalled();
  });

  it('match_voided sets match status to voided and skips ELO', async () => {
    setAdmin(true);
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) =>
      cb(txClient as unknown as Parameters<typeof cb>[0]),
    );
    const svc = new DisputeService(deps);
    const out = await svc.resolveDispute('d-1', { resolution: 'match_voided' }, ADMIN);
    expect(out.match.status).toBe('voided');
    expect(deps.matchRepo.setCompleted).not.toHaveBeenCalled();
  });

  it('match_replay_required sets match status to cancelled', async () => {
    setAdmin(true);
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) =>
      cb(txClient as unknown as Parameters<typeof cb>[0]),
    );
    const svc = new DisputeService(deps);
    const out = await svc.resolveDispute('d-1', { resolution: 'match_replay_required' }, ADMIN);
    expect(out.match.status).toBe('cancelled');
  });

  it('admin_decided_score uses provided scores', async () => {
    setAdmin(true);
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) =>
      cb(txClient as unknown as Parameters<typeof cb>[0]),
    );
    const svc = new DisputeService(deps);
    const out = await svc.resolveDispute('d-1', {
      resolution: 'admin_decided_score', scoreA: 2, scoreB: 2,
    }, ADMIN);
    expect(out.match.finalScoreA).toBe(2);
    expect(out.match.finalScoreB).toBe(2);
  });

  it('rejects admin_decided_score without explicit scores', async () => {
    setAdmin(true);
    const deps = makeDeps();
    const svc = new DisputeService(deps);
    await expect(svc.resolveDispute('d-1', { resolution: 'admin_decided_score' }, ADMIN))
      .rejects.toMatchObject({ message: expect.stringContaining('REQUIRES_SCORES') });
  });

  it('rejects when dispute is not in open status', async () => {
    setAdmin(true);
    const deps = makeDeps();
    vi.mocked(deps.disputeRepo.findByIdForUpdate).mockResolvedValue(makeDispute({ status: 'resolved' }));
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) =>
      cb(txClient as unknown as Parameters<typeof cb>[0]),
    );
    const svc = new DisputeService(deps);
    await expect(svc.resolveDispute('d-1', { resolution: 'side_a_result_stands' }, ADMIN))
      .rejects.toMatchObject({ message: expect.stringContaining('DISPUTE_NOT_OPEN') });
  });

  it('rejects when caller is not admin', async () => {
    setAdmin(false);
    const deps = makeDeps();
    const svc = new DisputeService(deps);
    await expect(svc.resolveDispute('d-1', { resolution: 'side_a_result_stands' }, 'u-rando'))
      .rejects.toMatchObject({ message: expect.stringContaining('NOT_ADMIN') });
  });
});

describe('DisputeService.dismissDispute', () => {
  it('sets dispute to dismissed without changing match state', async () => {
    setAdmin(true);
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) =>
      cb(txClient as unknown as Parameters<typeof cb>[0]),
    );
    const svc = new DisputeService(deps);
    const out = await svc.dismissDispute('d-1', 'insufficient information', ADMIN);
    expect(out.status).toBe('dismissed');
    expect(deps.matchRepo.updateStatus).not.toHaveBeenCalled();
    expect(deps.auditLogService.recordAdminAction).toHaveBeenCalled();
  });
});
