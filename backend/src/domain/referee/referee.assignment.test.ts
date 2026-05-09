import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── module mocks ─────────────────────────────────────────────────────────────
vi.mock('../../shared/config/platformConfig/index.js', () => ({
  getConfigInteger: vi.fn(async (key: string) => {
    if (key === 'referee_same_team_limit') return 3;
    if (key === 'referee_conflict_window_days') return 30;
    if (key === 'referee_offense_window_days') return 90;
    if (key === 'referee_flag_review_threshold') return 3;
    if (key === 'referee_flag_window_days') return 30;
    return 0;
  }),
  getConfigNumber: vi.fn(async (key: string) => {
    if (key === 'referee_first_offense_penalty') return 0.5;
    if (key === 'referee_repeat_offense_penalty') return 1.0;
    return 0;
  }),
  getConfigBoolean: vi.fn(async () => false),
}));

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

import { query, transaction } from '../../db.js';
import { RefereeAssignmentService, type AssignmentServiceDeps } from './referee.assignment.service.js';
import type { RefereeAssignment } from './referee.entity.js';
import type { Match, MatchParticipant } from '../match/match.entity.js';

// ─── fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_ID = 'u-admin';
const REF_ID = 'u-ref';
const ASSISTANT_ID = 'u-asst';
const OPP_REF_ID = 'u-other-ref';
const MATCH_ID = 'm-1';
const GAME_ID = 'g-football';

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: MATCH_ID, gameId: GAME_ID, formatId: 'f-5v5', divisionId: 'd-mixed',
    seasonId: null, matchMode: 'refereed', stakes: 'ranked', status: 'scheduled',
    venueId: null, scheduledAt: new Date(), startedAt: null, completedAt: null,
    finalScoreA: null, finalScoreB: null, creationSource: 'admin_created',
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<RefereeAssignment> = {}): RefereeAssignment {
  return {
    id: 'ra-1', matchId: MATCH_ID, refereeUserId: REF_ID, role: 'main',
    status: 'assigned', assignedByUserId: ADMIN_ID, assignedAt: new Date(),
    respondedAt: null, checkedInAt: null, promotedAt: null,
    promotedFromAssignmentId: null, declineReason: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeParticipant(overrides: Partial<MatchParticipant> = {}): MatchParticipant {
  return {
    id: 'mp-1', matchId: MATCH_ID, side: 'A',
    teamId: 't-A', userId: null, statKeeperUserId: null,
    mmrAtMatch: 1000, eloAtMatch: 1000, matchesPlayedAtMatch: 5,
    ...overrides,
  };
}

function makeDeps(): AssignmentServiceDeps {
  const assignmentRepo = {
    create: vi.fn(async (input) => makeAssignment(input as Partial<RefereeAssignment>)),
    findById: vi.fn(async () => null),
    findByIdForUpdate: vi.fn(async () => null),
    findByMatch: vi.fn(async () => []),
    findActiveMainByMatch: vi.fn(async () => null),
    findActiveAssistantsByMatch: vi.fn(async () => []),
    findActiveAssignmentForReferee: vi.fn(async () => null),
    updateStatus: vi.fn(async (id, status) => makeAssignment({ id, status })),
    promoteToMain: vi.fn(async (id, fromId) => makeAssignment({
      id, role: 'main', status: 'checked_in', promotedFromAssignmentId: fromId,
    })),
    demoteToAssistant: vi.fn(async (id) => makeAssignment({ id, role: 'assistant' })),
    countOfficiatedTeamMatchesInWindow: vi.fn(async () => 0),
    countNoShowsInWindow: vi.fn(async () => 1),
  };
  const profileRepo = {
    create: vi.fn(),
    findByUserId: vi.fn(async () => ({
      id: 'rp-1', userId: REF_ID, reliabilityScore: 5, totalMatchesOfficiated: 0,
      totalNoShows: 0, totalCaptainFlags: 0, baseCity: null,
      isAcceptingAssignments: true, lastOfficiatedAt: null, bio: null,
      createdAt: new Date(), updatedAt: new Date(),
    })),
    findByUserIdForUpdate: vi.fn(),
    update: vi.fn(),
    incrementCounter: vi.fn(async () => undefined),
    applyReliabilityDelta: vi.fn(async () => ({
      id: 'rp-1', userId: REF_ID, reliabilityScore: 4.5, totalMatchesOfficiated: 0,
      totalNoShows: 1, totalCaptainFlags: 0, baseCity: null,
      isAcceptingAssignments: true, lastOfficiatedAt: null, bio: null,
      createdAt: new Date(), updatedAt: new Date(),
    })),
    setLastOfficiatedAt: vi.fn(async () => undefined),
  };
  const flagRepo = {
    create: vi.fn(),
    findByReferee: vi.fn(),
    findOpenByMatch: vi.fn(),
    countByRefereeInWindow: vi.fn(async () => 1),
  };
  const matchRepo = {
    findById: vi.fn(async () => makeMatch()),
    findByIdForUpdate: vi.fn(async () => makeMatch()),
    create: vi.fn(),
    updateStatus: vi.fn(),
    setStarted: vi.fn(async () => makeMatch({ status: 'active' })),
    setCompleted: vi.fn(async () => makeMatch({ status: 'completed' })),
    findAwaitingConfirmationOlderThan: vi.fn(),
  };
  const participantRepo = {
    create: vi.fn(),
    findByMatchId: vi.fn(async () => [
      makeParticipant({ side: 'A', teamId: 't-A' }),
      makeParticipant({ id: 'mp-2', side: 'B', teamId: 't-B' }),
    ]),
    findByMatchAndSide: vi.fn(),
    setStatKeeper: vi.fn(),
  };
  const matchStatRepo = {
    create: vi.fn(),
    findByMatch: vi.fn(),
  };
  const teamEloRepo = { findByTeam: vi.fn() };
  const playerEloRepo = { findByUser: vi.fn() };
  const profileService = {
    isCertifiedFor: vi.fn(async () => true),
  };
  const conflictService = {
    hasConflictForMatch: vi.fn(async () => false),
  };
  const notificationService = {
    enqueue: vi.fn(async () => ({ id: 'n-1' })),
  };

  return {
    assignmentRepo, profileRepo, flagRepo, matchRepo, participantRepo,
    matchStatRepo, teamEloRepo, playerEloRepo,
    profileService, conflictService, notificationService,
  } as unknown as AssignmentServiceDeps;
}

function setRoleQueryToAdmin(adminUsers: Set<string>, refereeUsers: Set<string>): void {
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
    if (sql.includes('FROM "user" u')) {
      // notifyAdmins admin lookup
      return Promise.resolve([] as never);
    }
    return Promise.resolve([] as never);
  }) as unknown as typeof query);
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('RefereeAssignmentService.assignReferee', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
    vi.mocked(transaction).mockClear();
  });

  it('happy path: admin assigns a main referee', async () => {
    setRoleQueryToAdmin(new Set([ADMIN_ID]), new Set([REF_ID]));
    const deps = makeDeps();
    const svc = new RefereeAssignmentService(deps);
    const out = await svc.assignReferee(MATCH_ID, REF_ID, 'main', ADMIN_ID);
    expect(out.role).toBe('main');
    expect(deps.assignmentRepo.create).toHaveBeenCalled();
    expect(deps.notificationService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      userId: REF_ID, type: 'referee_assignment_offered',
    }));
  });

  it('rejects when caller is not an admin', async () => {
    setRoleQueryToAdmin(new Set(), new Set([REF_ID]));
    const svc = new RefereeAssignmentService(makeDeps());
    await expect(svc.assignReferee(MATCH_ID, REF_ID, 'main', 'u-rando'))
      .rejects.toMatchObject({ message: expect.stringContaining('NOT_ADMIN') });
  });

  it('rejects when referee is not certified for the match game', async () => {
    setRoleQueryToAdmin(new Set([ADMIN_ID]), new Set([REF_ID]));
    const deps = makeDeps();
    vi.mocked(deps.profileService.isCertifiedFor).mockResolvedValue(false);
    const svc = new RefereeAssignmentService(deps);
    await expect(svc.assignReferee(MATCH_ID, REF_ID, 'main', ADMIN_ID))
      .rejects.toMatchObject({ message: expect.stringContaining('NOT_CERTIFIED') });
  });

  it('rejects when conflict-of-interest exists', async () => {
    setRoleQueryToAdmin(new Set([ADMIN_ID]), new Set([REF_ID]));
    const deps = makeDeps();
    vi.mocked(deps.conflictService.hasConflictForMatch).mockResolvedValue(true);
    const svc = new RefereeAssignmentService(deps);
    await expect(svc.assignReferee(MATCH_ID, REF_ID, 'main', ADMIN_ID))
      .rejects.toMatchObject({ message: expect.stringContaining('CONFLICT_OF_INTEREST') });
  });

  it('rejects when same-team-frequency limit hit', async () => {
    setRoleQueryToAdmin(new Set([ADMIN_ID]), new Set([REF_ID]));
    const deps = makeDeps();
    vi.mocked(deps.assignmentRepo.countOfficiatedTeamMatchesInWindow).mockResolvedValue(3);
    const svc = new RefereeAssignmentService(deps);
    await expect(svc.assignReferee(MATCH_ID, REF_ID, 'main', ADMIN_ID))
      .rejects.toMatchObject({ message: expect.stringContaining('SAME_TEAM_LIMIT') });
  });

  it('rejects when match status is not scheduled', async () => {
    setRoleQueryToAdmin(new Set([ADMIN_ID]), new Set([REF_ID]));
    const deps = makeDeps();
    vi.mocked(deps.matchRepo.findById).mockResolvedValue(makeMatch({ status: 'active' }));
    const svc = new RefereeAssignmentService(deps);
    await expect(svc.assignReferee(MATCH_ID, REF_ID, 'main', ADMIN_ID))
      .rejects.toMatchObject({ message: expect.stringContaining('NOT_SCHEDULED') });
  });

  it('rejects assigning a 2nd main while one is active', async () => {
    setRoleQueryToAdmin(new Set([ADMIN_ID]), new Set([REF_ID]));
    const deps = makeDeps();
    vi.mocked(deps.assignmentRepo.findActiveMainByMatch).mockResolvedValue(makeAssignment());
    const svc = new RefereeAssignmentService(deps);
    await expect(svc.assignReferee(MATCH_ID, REF_ID, 'main', ADMIN_ID))
      .rejects.toMatchObject({ message: expect.stringContaining('ALREADY_HAS_MAIN_REFEREE') });
  });
});

describe('RefereeAssignmentService.respondToAssignment', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
    setRoleQueryToAdmin(new Set([ADMIN_ID]), new Set());
  });

  it('accept transitions assigned → accepted', async () => {
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.assignmentRepo.findByIdForUpdate).mockResolvedValue(makeAssignment());
    const svc = new RefereeAssignmentService(deps);
    await svc.respondToAssignment('ra-1', true, REF_ID);
    expect(deps.assignmentRepo.updateStatus).toHaveBeenCalledWith(
      'ra-1', 'accepted', expect.anything(), expect.objectContaining({ declineReason: null }),
    );
  });

  it('decline transitions assigned → declined and notifies admins', async () => {
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.assignmentRepo.findByIdForUpdate).mockResolvedValue(makeAssignment());
    const svc = new RefereeAssignmentService(deps);
    await svc.respondToAssignment('ra-1', false, REF_ID, 'sick');
    expect(deps.assignmentRepo.updateStatus).toHaveBeenCalledWith(
      'ra-1', 'declined', expect.anything(),
      expect.objectContaining({ declineReason: 'sick' }),
    );
  });

  it('rejects when caller is not the assigned referee', async () => {
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.assignmentRepo.findByIdForUpdate).mockResolvedValue(makeAssignment());
    const svc = new RefereeAssignmentService(deps);
    await expect(svc.respondToAssignment('ra-1', true, 'u-stranger'))
      .rejects.toMatchObject({ message: expect.stringContaining('NOT_ASSIGNMENT_REFEREE') });
  });
});

describe('RefereeAssignmentService.checkIn', () => {
  it('transitions accepted → checked_in', async () => {
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.assignmentRepo.findByIdForUpdate).mockResolvedValue(
      makeAssignment({ status: 'accepted' }),
    );
    const svc = new RefereeAssignmentService(deps);
    await svc.checkIn('ra-1', REF_ID);
    expect(deps.assignmentRepo.updateStatus).toHaveBeenCalledWith(
      'ra-1', 'checked_in', expect.anything(), expect.anything(),
    );
  });
});

describe('RefereeAssignmentService.triggerAutoPromotion', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
    setRoleQueryToAdmin(new Set([ADMIN_ID]), new Set());
  });

  it('promotes the oldest checked-in assistant when main has not checked in', async () => {
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.assignmentRepo.findActiveMainByMatch).mockResolvedValue(
      makeAssignment({ id: 'ra-main', refereeUserId: REF_ID, status: 'accepted' }),
    );
    vi.mocked(deps.assignmentRepo.findActiveAssistantsByMatch).mockResolvedValue([
      makeAssignment({ id: 'ra-asst-1', refereeUserId: ASSISTANT_ID, role: 'assistant', status: 'checked_in' }),
      makeAssignment({ id: 'ra-asst-2', refereeUserId: 'u-asst-2', role: 'assistant', status: 'accepted' }),
    ]);
    const svc = new RefereeAssignmentService(deps);
    const out = await svc.triggerAutoPromotion(MATCH_ID, ADMIN_ID);
    expect(out.promoted).toBe(true);
    expect(out.oldMainUserId).toBe(REF_ID);
    expect(out.newMainUserId).toBe(ASSISTANT_ID);
    // Order matters: old main → no_show first, then assistant → main.
    const updateCall = vi.mocked(deps.assignmentRepo.updateStatus).mock.calls[0];
    expect(updateCall[0]).toBe('ra-main');
    expect(updateCall[1]).toBe('no_show');
    expect(deps.assignmentRepo.promoteToMain).toHaveBeenCalledWith(
      'ra-asst-1', 'ra-main', expect.anything(),
    );
  });

  it('applies first-offense penalty when this is the only no_show in window', async () => {
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.assignmentRepo.findActiveMainByMatch).mockResolvedValue(
      makeAssignment({ id: 'ra-main', refereeUserId: REF_ID, status: 'accepted' }),
    );
    vi.mocked(deps.assignmentRepo.findActiveAssistantsByMatch).mockResolvedValue([
      makeAssignment({ id: 'ra-asst-1', refereeUserId: ASSISTANT_ID, role: 'assistant', status: 'checked_in' }),
    ]);
    vi.mocked(deps.assignmentRepo.countNoShowsInWindow).mockResolvedValue(1); // just this one
    const svc = new RefereeAssignmentService(deps);
    await svc.triggerAutoPromotion(MATCH_ID, ADMIN_ID);
    expect(deps.profileRepo.applyReliabilityDelta).toHaveBeenCalledWith(
      REF_ID, -0.5, expect.anything(),
    );
  });

  it('applies repeat-offense penalty when prior no_show exists in window', async () => {
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.assignmentRepo.findActiveMainByMatch).mockResolvedValue(
      makeAssignment({ id: 'ra-main', refereeUserId: REF_ID, status: 'accepted' }),
    );
    vi.mocked(deps.assignmentRepo.findActiveAssistantsByMatch).mockResolvedValue([
      makeAssignment({ id: 'ra-asst-1', refereeUserId: ASSISTANT_ID, role: 'assistant', status: 'checked_in' }),
    ]);
    vi.mocked(deps.assignmentRepo.countNoShowsInWindow).mockResolvedValue(2); // this + a prior
    const svc = new RefereeAssignmentService(deps);
    await svc.triggerAutoPromotion(MATCH_ID, ADMIN_ID);
    expect(deps.profileRepo.applyReliabilityDelta).toHaveBeenCalledWith(
      REF_ID, -1.0, expect.anything(),
    );
  });

  it('no-ops if main has already checked in', async () => {
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.assignmentRepo.findActiveMainByMatch).mockResolvedValue(
      makeAssignment({ id: 'ra-main', refereeUserId: REF_ID, status: 'checked_in' }),
    );
    const svc = new RefereeAssignmentService(deps);
    const out = await svc.triggerAutoPromotion(MATCH_ID, ADMIN_ID);
    expect(out.promoted).toBe(false);
    expect(deps.assignmentRepo.promoteToMain).not.toHaveBeenCalled();
  });

  it('no-ops when no checked-in assistant is available', async () => {
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.assignmentRepo.findActiveMainByMatch).mockResolvedValue(
      makeAssignment({ id: 'ra-main', refereeUserId: REF_ID, status: 'accepted' }),
    );
    vi.mocked(deps.assignmentRepo.findActiveAssistantsByMatch).mockResolvedValue([]);
    const svc = new RefereeAssignmentService(deps);
    const out = await svc.triggerAutoPromotion(MATCH_ID, ADMIN_ID);
    expect(out.promoted).toBe(false);
  });
});

describe('RefereeAssignmentService.reclaimMainSlot', () => {
  it('reverses the promotion when the original main reclaims', async () => {
    const deps = makeDeps();
    const txClient = {
      query: vi.fn(async () => ({ rows: [makeAssignment({ id: 'ra-main', status: 'checked_in' })] })),
    };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.assignmentRepo.findByIdForUpdate).mockResolvedValue(
      makeAssignment({ id: 'ra-main', refereeUserId: REF_ID, status: 'no_show', role: 'main' }),
    );
    vi.mocked(deps.matchRepo.findByIdForUpdate).mockResolvedValue(makeMatch());
    vi.mocked(deps.assignmentRepo.findActiveMainByMatch).mockResolvedValue(
      makeAssignment({
        id: 'ra-asst-1', refereeUserId: ASSISTANT_ID, role: 'main',
        status: 'checked_in', promotedFromAssignmentId: 'ra-main',
      }),
    );
    const svc = new RefereeAssignmentService(deps);
    await svc.reclaimMainSlot('ra-main', REF_ID);
    expect(deps.assignmentRepo.demoteToAssistant).toHaveBeenCalledWith(
      'ra-asst-1', expect.anything(),
    );
  });

  it('rejects when match has already started', async () => {
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.assignmentRepo.findByIdForUpdate).mockResolvedValue(
      makeAssignment({ id: 'ra-main', refereeUserId: REF_ID, status: 'no_show', role: 'main' }),
    );
    vi.mocked(deps.matchRepo.findByIdForUpdate).mockResolvedValue(makeMatch({ status: 'active' }));
    const svc = new RefereeAssignmentService(deps);
    await expect(svc.reclaimMainSlot('ra-main', REF_ID))
      .rejects.toMatchObject({ message: expect.stringContaining('ALREADY_STARTED') });
  });
});

describe('RefereeAssignmentService.submitRefereedResult', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
    setRoleQueryToAdmin(new Set(), new Set());
  });

  it('writes referee_recorded stats, applies ELO, marks assignments completed', async () => {
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.matchRepo.findByIdForUpdate).mockResolvedValue(makeMatch({ status: 'active' }));
    vi.mocked(deps.assignmentRepo.findActiveMainByMatch).mockResolvedValue(
      makeAssignment({ refereeUserId: REF_ID, status: 'checked_in' }),
    );
    vi.mocked(deps.assignmentRepo.findByMatch).mockResolvedValue([
      makeAssignment({ id: 'ra-main', refereeUserId: REF_ID, status: 'checked_in' }),
      makeAssignment({ id: 'ra-asst', refereeUserId: ASSISTANT_ID, role: 'assistant', status: 'checked_in' }),
    ]);
    const svc = new RefereeAssignmentService(deps);
    const out = await svc.submitRefereedResult({
      matchId: MATCH_ID, scoreA: 2, scoreB: 1,
      stats: [
        { side: 'A', statKey: 'goals', statValue: 2, minute: 30, playerId: null },
      ],
    }, REF_ID);
    expect(deps.matchStatRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ verificationStatus: 'referee_recorded', statKey: 'goals' }),
      expect.anything(),
    );
    expect(deps.matchRepo.setCompleted).toHaveBeenCalledWith(MATCH_ID, 2, 1, expect.anything());
    expect(out.resolution.matchId).toBe('m-1');
    // Both assignments flipped to completed.
    expect(deps.assignmentRepo.updateStatus).toHaveBeenCalledWith('ra-main', 'completed', expect.anything());
    expect(deps.assignmentRepo.updateStatus).toHaveBeenCalledWith('ra-asst', 'completed', expect.anything());
    expect(deps.profileRepo.incrementCounter).toHaveBeenCalledWith(
      REF_ID, 'totalMatchesOfficiated', expect.anything(),
    );
  });

  it('rejects when caller is not the active main referee', async () => {
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.matchRepo.findByIdForUpdate).mockResolvedValue(makeMatch({ status: 'active' }));
    vi.mocked(deps.assignmentRepo.findActiveMainByMatch).mockResolvedValue(
      makeAssignment({ refereeUserId: OPP_REF_ID, status: 'checked_in' }),
    );
    const svc = new RefereeAssignmentService(deps);
    await expect(svc.submitRefereedResult({
      matchId: MATCH_ID, scoreA: 2, scoreB: 1, stats: [],
    }, REF_ID)).rejects.toMatchObject({ message: expect.stringContaining('NOT_ACTIVE_MAIN_REFEREE') });
  });
});

describe('RefereeAssignmentService.flagReferee', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it('inserts the flag and increments totalCaptainFlags', async () => {
    // findCaptainSideOrThrow looks up team captainId — inline-stub this query.
    vi.mocked(query).mockImplementation(((...args: unknown[]) => {
      const sql = (args[0] ?? '') as string;
      if (sql.includes('FROM teams') && sql.includes('"captainId"')) {
        return Promise.resolve([{ id: 't-A' }] as never);
      }
      return Promise.resolve([] as never);
    }) as unknown as typeof query);
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.matchRepo.findById).mockResolvedValue(makeMatch({ status: 'completed' }));
    vi.mocked(deps.assignmentRepo.findActiveAssignmentForReferee).mockResolvedValue(
      makeAssignment({ refereeUserId: REF_ID }),
    );
    vi.mocked(deps.flagRepo.create).mockResolvedValue({
      id: 'fl-1', matchId: MATCH_ID, refereeUserId: REF_ID,
      flaggedByUserId: 'u-captain', flaggedBySide: 'A',
      reason: 'bias_toward_opponent', description: null,
      status: 'open', reviewedByUserId: null, reviewedAt: null,
      createdAt: new Date(),
    });
    const svc = new RefereeAssignmentService(deps);
    const out = await svc.flagReferee(MATCH_ID, REF_ID, 'u-captain', 'bias_toward_opponent');
    expect(out.id).toBe('fl-1');
    expect(deps.profileRepo.incrementCounter).toHaveBeenCalledWith(
      REF_ID, 'totalCaptainFlags', expect.anything(),
    );
  });

  it('translates pg unique violation to FLAG_ALREADY_EXISTS', async () => {
    vi.mocked(query).mockImplementation(((...args: unknown[]) => {
      const sql = (args[0] ?? '') as string;
      if (sql.includes('FROM teams')) return Promise.resolve([{ id: 't-A' }] as never);
      return Promise.resolve([] as never);
    }) as unknown as typeof query);
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.matchRepo.findById).mockResolvedValue(makeMatch({ status: 'completed' }));
    vi.mocked(deps.assignmentRepo.findActiveAssignmentForReferee).mockResolvedValue(
      makeAssignment({ refereeUserId: REF_ID }),
    );
    vi.mocked(deps.flagRepo.create).mockRejectedValue({ code: '23505' });
    const svc = new RefereeAssignmentService(deps);
    await expect(svc.flagReferee(MATCH_ID, REF_ID, 'u-captain', 'inattention'))
      .rejects.toMatchObject({ message: expect.stringContaining('FLAG_ALREADY_EXISTS') });
  });

  it('triggers admin notification when flag count crosses threshold', async () => {
    vi.mocked(query).mockImplementation(((...args: unknown[]) => {
      const sql = (args[0] ?? '') as string;
      if (sql.includes('FROM teams') && sql.includes('"captainId"')) {
        return Promise.resolve([{ id: 't-A' }] as never);
      }
      if (sql.includes('FROM "user" u')) {
        return Promise.resolve([{ id: ADMIN_ID }] as never);
      }
      return Promise.resolve([] as never);
    }) as unknown as typeof query);
    const deps = makeDeps();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) => cb(txClient));
    vi.mocked(deps.matchRepo.findById).mockResolvedValue(makeMatch({ status: 'completed' }));
    vi.mocked(deps.assignmentRepo.findActiveAssignmentForReferee).mockResolvedValue(
      makeAssignment({ refereeUserId: REF_ID }),
    );
    vi.mocked(deps.flagRepo.create).mockResolvedValue({
      id: 'fl-1', matchId: MATCH_ID, refereeUserId: REF_ID,
      flaggedByUserId: 'u-captain', flaggedBySide: 'A',
      reason: 'inattention', description: null,
      status: 'open', reviewedByUserId: null, reviewedAt: null,
      createdAt: new Date(),
    });
    vi.mocked(deps.flagRepo.countByRefereeInWindow).mockResolvedValue(3);
    const svc = new RefereeAssignmentService(deps);
    await svc.flagReferee(MATCH_ID, REF_ID, 'u-captain', 'inattention');
    expect(deps.notificationService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ADMIN_ID, type: 'referee_flag_threshold_reached' }),
      expect.anything(),
    );
  });
});
