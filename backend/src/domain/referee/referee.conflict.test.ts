import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefereeConflictService } from './referee.conflict.service.js';
import type { IRefereeConflictRepository } from './referee.interface.js';
import type { MatchParticipant } from '../match/match.entity.js';

vi.mock('../../db.js', () => ({
  query: vi.fn(async () => []),
  transaction: vi.fn(),
}));

import { query } from '../../db.js';

const REFEREE_ID = 'u-ref';
const TEAM_A = 't-A';
const TEAM_B = 't-B';
const PLAYER_A = 'u-pA';

function makeRepo(): IRefereeConflictRepository {
  return {
    declare: vi.fn(async (input) => ({
      id: 'rc-1',
      refereeUserId: input.refereeUserId,
      conflictedTeamId: input.conflictedTeamId,
      conflictedUserId: input.conflictedUserId,
      reason: input.reason,
      declaredAt: new Date(),
      removedAt: null,
    })),
    findById: vi.fn(),
    findActiveByReferee: vi.fn(),
    removeConflict: vi.fn(),
    hasConflict: vi.fn(async () => false),
  } as unknown as IRefereeConflictRepository;
}

function makeParticipant(overrides: Partial<MatchParticipant> = {}): MatchParticipant {
  return {
    id: 'mp-1', matchId: 'm-1', side: 'A',
    teamId: TEAM_A, userId: null, statKeeperUserId: null,
    mmrAtMatch: 1000, eloAtMatch: 1000, matchesPlayedAtMatch: 0,
    ...overrides,
  };
}

describe('RefereeConflictService.declareTeamConflict', () => {
  it('declares a team conflict for the caller referee', async () => {
    const repo = makeRepo();
    const svc = new RefereeConflictService(repo);
    const conflict = await svc.declareTeamConflict(REFEREE_ID, TEAM_A, 'related to player');
    expect(conflict.conflictedTeamId).toBe(TEAM_A);
    expect(conflict.conflictedUserId).toBeNull();
  });

  it('translates pg unique violation into CONFLICT_ALREADY_DECLARED', async () => {
    const repo = makeRepo();
    vi.mocked(repo.declare).mockRejectedValueOnce({ code: '23505' });
    const svc = new RefereeConflictService(repo);
    await expect(svc.declareTeamConflict(REFEREE_ID, TEAM_A))
      .rejects.toMatchObject({ message: expect.stringContaining('ALREADY_DECLARED') });
  });
});

describe('RefereeConflictService.declareUserConflict', () => {
  it('rejects self-conflict', async () => {
    const svc = new RefereeConflictService(makeRepo());
    await expect(svc.declareUserConflict(REFEREE_ID, REFEREE_ID))
      .rejects.toMatchObject({ message: expect.stringContaining('CANNOT_CONFLICT_WITH_SELF') });
  });

  it('declares a user conflict happy path', async () => {
    const svc = new RefereeConflictService(makeRepo());
    const c = await svc.declareUserConflict(REFEREE_ID, PLAYER_A, 'history');
    expect(c.conflictedUserId).toBe(PLAYER_A);
    expect(c.conflictedTeamId).toBeNull();
  });
});

describe('RefereeConflictService.hasConflictForMatch', () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it('returns true when an explicit conflict exists', async () => {
    const repo = makeRepo();
    vi.mocked(repo.hasConflict).mockResolvedValueOnce(true);
    vi.mocked(query).mockResolvedValue([]);
    const svc = new RefereeConflictService(repo);
    const out = await svc.hasConflictForMatch(REFEREE_ID, [
      makeParticipant({ side: 'A', teamId: TEAM_A }),
      makeParticipant({ side: 'B', teamId: TEAM_B, id: 'mp-2' }),
    ]);
    expect(out).toBe(true);
  });

  it('returns true when referee is an active member of a participating team', async () => {
    const repo = makeRepo();
    vi.mocked(repo.hasConflict).mockResolvedValueOnce(false);
    // teamMembers EXISTS check: pretend the referee is on team A.
    vi.mocked(query).mockResolvedValueOnce([{ exists: true }] as never);
    const svc = new RefereeConflictService(repo);
    const out = await svc.hasConflictForMatch(REFEREE_ID, [
      makeParticipant({ side: 'A', teamId: TEAM_A }),
      makeParticipant({ side: 'B', teamId: TEAM_B, id: 'mp-2' }),
    ]);
    expect(out).toBe(true);
  });

  it('returns false when no explicit and no implicit conflict exists', async () => {
    const repo = makeRepo();
    vi.mocked(repo.hasConflict).mockResolvedValueOnce(false);
    vi.mocked(query).mockResolvedValueOnce([{ exists: false }] as never);
    const svc = new RefereeConflictService(repo);
    const out = await svc.hasConflictForMatch(REFEREE_ID, [
      makeParticipant({ side: 'A', teamId: TEAM_A }),
      makeParticipant({ side: 'B', teamId: TEAM_B, id: 'mp-2' }),
    ]);
    expect(out).toBe(false);
  });
});

describe('RefereeConflictService.removeConflict', () => {
  it('rejects removal by a non-owning referee', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findById).mockResolvedValueOnce({
      id: 'rc-1', refereeUserId: 'u-other',
      conflictedTeamId: TEAM_A, conflictedUserId: null, reason: null,
      declaredAt: new Date(), removedAt: null,
    });
    const svc = new RefereeConflictService(repo);
    await expect(svc.removeConflict('rc-1', REFEREE_ID))
      .rejects.toMatchObject({ message: expect.stringContaining('NOT_CONFLICT_OWNER') });
  });

  it('removes when caller owns the conflict', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findById).mockResolvedValueOnce({
      id: 'rc-1', refereeUserId: REFEREE_ID,
      conflictedTeamId: TEAM_A, conflictedUserId: null, reason: null,
      declaredAt: new Date(), removedAt: null,
    });
    vi.mocked(repo.removeConflict).mockResolvedValueOnce({
      id: 'rc-1', refereeUserId: REFEREE_ID,
      conflictedTeamId: TEAM_A, conflictedUserId: null, reason: null,
      declaredAt: new Date(), removedAt: new Date(),
    });
    const svc = new RefereeConflictService(repo);
    const out = await svc.removeConflict('rc-1', REFEREE_ID);
    expect(out.removedAt).not.toBeNull();
  });
});
