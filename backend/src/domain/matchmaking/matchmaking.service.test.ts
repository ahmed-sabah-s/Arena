import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MatchmakingService } from './matchmaking.service.js';
import type { MatchService } from '../match/match.service.js';
import type { ITeamEloRepository, IPlayerEloRepository } from '../elo/elo.interface.js';
import type { EloService } from '../elo/elo.service.js';

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../shared/config/platformConfig/index.js', () => ({
  getConfigInteger: vi.fn(async () => 10),
  getConfigBoolean: vi.fn(async () => true),
}));

vi.mock('../../db.js', () => ({
  transaction: vi.fn(async (cb: (client: unknown) => Promise<unknown>) =>
    cb({ query: vi.fn(async () => ({ rows: [] })) }),
  ),
  query: vi.fn(async () => []),
}));

import { query } from '../../db.js';

// ─── fixtures ─────────────────────────────────────────────────────────────────

const USER = 'u-self';
const GAME = 'g-football';
const FORMAT = 'f-5v5';
const DIVISION = 'd-mixed';

interface QueueEntryRow {
  id: string;
  teamId: string | null;
  userId: string | null;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  mmrAtQueue: number;
  status: string;
  queuedAt: Date;
}

function makeEntry(overrides: Partial<QueueEntryRow> = {}): QueueEntryRow {
  return {
    id: 'q-1',
    teamId: null,
    userId: USER,
    gameId: GAME,
    formatId: FORMAT,
    divisionId: DIVISION,
    mmrAtQueue: 1000,
    status: 'friendly_offered',
    queuedAt: new Date(Date.now() - 11 * 60_000),
    ...overrides,
  };
}

function makeMatchServiceStub(matchId = 'm-new'): MatchService {
  return {
    createMatchFromQueueEntries: vi.fn(async () => ({
      match: { id: matchId } as unknown as Parameters<MatchService['createMatchFromQueueEntries']>[0] extends infer _ ? { id: string } : never,
    })),
  } as unknown as MatchService;
}

function makeEloStubs(): {
  teamRepo: ITeamEloRepository;
  playerRepo: IPlayerEloRepository;
  service: EloService;
} {
  const dummy = vi.fn(async () => null);
  return {
    teamRepo: { findByTeam: dummy } as unknown as ITeamEloRepository,
    playerRepo: { findByUser: dummy } as unknown as IPlayerEloRepository,
    service: { seedPlayerElo: vi.fn() } as unknown as EloService,
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('MatchmakingService.acceptFriendly', () => {
  let svc: MatchmakingService;
  let matchSvc: MatchService;

  beforeEach(() => {
    vi.mocked(query).mockReset();
    matchSvc = makeMatchServiceStub();
    const elo = makeEloStubs();
    svc = new MatchmakingService(matchSvc, elo.teamRepo, elo.playerRepo, elo.service);
  });

  it('pairs immediately when an opponent is available, with stakes=friendly', async () => {
    const self = makeEntry({ id: 'q-self', userId: USER });
    const opponent = makeEntry({ id: 'q-opp', userId: 'u-other' });

    vi.mocked(query).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "queueEntries" WHERE id =')) return [self] as never;
      if (sql.includes('FROM "queueEntries"\n       WHERE id <> :selfId')) {
        return [opponent] as never;
      }
      return [] as never;
    });

    const out = await svc.acceptFriendly('q-self', USER);
    expect(out.matched).toBe(true);
    expect(out.matchId).toBe('m-new');
    expect(matchSvc.createMatchFromQueueEntries).toHaveBeenCalledWith({
      entryAId: 'q-self',
      entryBId: 'q-opp',
      matchMode: 'score_only',
      stakes: 'friendly',
    });
  });

  it('returns matched=false when no opponent is available; entry stays in friendly_offered', async () => {
    const self = makeEntry({ id: 'q-self', userId: USER });
    vi.mocked(query).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "queueEntries" WHERE id =')) return [self] as never;
      // Opponent search: empty
      return [] as never;
    });

    const out = await svc.acceptFriendly('q-self', USER);
    expect(out.matched).toBe(false);
    expect(out.matchId).toBeUndefined();
    expect(matchSvc.createMatchFromQueueEntries).not.toHaveBeenCalled();
  });

  it('rejects when entry is not in friendly_offered status', async () => {
    const self = makeEntry({ id: 'q-self', userId: USER, status: 'waiting' });
    vi.mocked(query).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "queueEntries" WHERE id =')) return [self] as never;
      return [] as never;
    });
    await expect(svc.acceptFriendly('q-self', USER)).rejects.toMatchObject({
      message: expect.stringContaining('QUEUE_ENTRY_NOT_FRIENDLY_OFFERED'),
    });
  });

  it('rejects when caller does not own the entry', async () => {
    const self = makeEntry({ id: 'q-self', userId: 'u-other' });
    vi.mocked(query).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "queueEntries" WHERE id =')) return [self] as never;
      return [] as never;
    });
    await expect(svc.acceptFriendly('q-self', USER)).rejects.toMatchObject({
      message: expect.stringContaining('NOT_QUEUE_ENTRY_OWNER'),
    });
  });

  it('throws NotFoundError when entry does not exist', async () => {
    vi.mocked(query).mockImplementation(async () => [] as never);
    await expect(svc.acceptFriendly('q-missing', USER)).rejects.toThrow();
  });
});
