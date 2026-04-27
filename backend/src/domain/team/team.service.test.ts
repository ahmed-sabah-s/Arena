import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TeamService } from './team.service.js';
import type {
  ITeamRepository,
  ITeamMemberRepository,
  ITeamInviteRepository,
  ITeamCreationLogRepository,
} from './team.interface.js';
import type { Team, TeamMember, TeamInvite } from './team.entity.js';

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../shared/config/platformConfig/index.js', () => ({
  getConfigInteger: vi.fn(async (key: string) => {
    const map: Record<string, number> = {
      captain_disband_cooldown_days: 30,
      team_creation_cooldown_days: 90,
      max_teams_per_user_per_game_per_window: 2,
      team_invite_expiry_days: 7,
    };
    return map[key]!;
  }),
}));

// Mock transaction to invoke its callback with a fake client.
// `unknown` for the cb because the fake client only implements .query(), not the full
// CustomClient interface — and rebuilding the full interface adds no test value.
vi.mock('../../db.js', () => ({
  transaction: vi.fn(async (cb: (client: unknown) => Promise<unknown>) =>
    cb({ query: vi.fn(async () => ({ rows: [] })) }),
  ),
  query: vi.fn(async () => []),
}));

import { query } from '../../db.js';

// `buildQueryHandler` returns a relaxed `(sql, params?) => Promise<unknown[]>`. The
// real `query` function is generic over a QueryResultRow constraint that the test
// helper can't satisfy without rebuilding pg's type machinery. We funnel through
// `as unknown as typeof query` at every mockImplementation call site — the runtime
// shape matches what query() returns, just with a relaxed TypeScript signature.

// ─── fixtures ─────────────────────────────────────────────────────────────────

const FOOTBALL_GAME = 'g-football';
const FOOTBALL_5V5 = 'f-5v5';
const MALE_DIV = 'd-male';
const MIXED_DIV = 'd-mixed';

const CAPTAIN = 'u-captain';
const MEMBER_2 = 'u-member-2';
const OUTSIDER = 'u-outsider';

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 't-1',
    gameId: FOOTBALL_GAME,
    formatId: FOOTBALL_5V5,
    divisionId: MALE_DIV,
    captainId: CAPTAIN,
    name: 'Asad Baghdad',
    nameAr: null,
    slug: 'asad-baghdad',
    city: 'Baghdad',
    badgeFileId: null,
    primaryColor: null,
    status: 'active',
    foundedAt: new Date(),
    disbandedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'tm-1',
    teamId: 't-1',
    userId: CAPTAIN,
    gameId: FOOTBALL_GAME,
    formatId: FOOTBALL_5V5,
    divisionId: MALE_DIV,
    isCaptain: true,
    position: null,
    shirtNumber: null,
    joinedAt: new Date(),
    releasedAt: null,
    releaseReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeInvite(overrides: Partial<TeamInvite> = {}): TeamInvite {
  return {
    id: 'inv-1',
    teamId: 't-1',
    invitedUserId: MEMBER_2,
    invitedByUserId: CAPTAIN,
    position: null,
    shirtNumber: null,
    status: 'pending',
    message: null,
    createdAt: new Date(),
    respondedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

function makeRepos() {
  const team: ITeamRepository = {
    create: vi.fn(async (input) => makeTeam({
      id: 't-new', gameId: input.gameId, formatId: input.formatId,
      divisionId: input.divisionId, captainId: input.captainId,
      name: input.name, slug: input.slug,
    })),
    findById: vi.fn(async () => null),
    findBySlug: vi.fn(async () => null),
    findManyByCaptain: vi.fn(async () => []),
    findActiveByScope: vi.fn(async () => []),
    update: vi.fn(async (id, partial) => makeTeam({ id, ...partial })),
    disband: vi.fn(async () => undefined),
    setCaptain: vi.fn(async () => undefined),
  };
  const member: ITeamMemberRepository = {
    create: vi.fn(async (input) => makeMember({
      id: 'tm-new', teamId: input.teamId, userId: input.userId,
      gameId: input.gameId, formatId: input.formatId, divisionId: input.divisionId,
      isCaptain: input.isCaptain,
    })),
    findById: vi.fn(async () => null),
    findByTeamAndUser: vi.fn(async () => null),
    findActiveMembersByTeam: vi.fn(async () => []),
    findActiveByUserAndScope: vi.fn(async () => null),
    release: vi.fn(async () => undefined),
    releaseAllForTeam: vi.fn(async () => undefined),
    setCaptainFlag: vi.fn(async () => undefined),
    update: vi.fn(async (id) => makeMember({ id })),
  };
  const invite: ITeamInviteRepository = {
    create: vi.fn(async (input) => makeInvite({
      id: 'inv-new', teamId: input.teamId,
      invitedUserId: input.invitedUserId, invitedByUserId: input.invitedByUserId,
      expiresAt: input.expiresAt,
    })),
    findById: vi.fn(async () => null),
    findPendingForUser: vi.fn(async () => []),
    findPendingByTeam: vi.fn(async () => []),
    findExistingPending: vi.fn(async () => null),
    markStatus: vi.fn(async () => undefined),
    cancelAllPendingForTeam: vi.fn(async () => undefined),
  };
  const log: ITeamCreationLogRepository = {
    recordCreate: vi.fn(async () => undefined),
    recordDisband: vi.fn(async () => undefined),
    countCreatesInWindow: vi.fn(async () => 0),
    findMostRecentDisband: vi.fn(async () => null),
  };
  return { team, member, invite, log };
}

function buildQueryHandler(opts: {
  game?: { id: string; participantType?: 'team' | 'individual'; isActive?: boolean };
  format?: { id: string; gameId: string; minRosterSize?: number; maxRosterSize?: number; isActive?: boolean };
  divisions?: Array<{ id: string; gameId: string; genderRestriction: 'male' | 'female' | 'mixed' | null }>;
  user?: { id: string; gender: 'male' | 'female' | 'prefer_not_say' | null };
  divisionLookup?: Record<string, { id: string; gameId: string; genderRestriction: 'male' | 'female' | 'mixed' | null }>;
}): (sql: string, params?: Record<string, unknown>) => Promise<unknown[]> {
  return async (sql: string, params?: Record<string, unknown>) => {
    const p = params ?? {};
    if (sql.includes('FROM games WHERE id')) {
      if (!opts.game || p.id !== opts.game.id) return [];
      return [{ id: opts.game.id, slug: 'football', participantType: opts.game.participantType ?? 'team', isActive: opts.game.isActive ?? true }];
    }
    if (sql.includes('FROM "gameFormats" WHERE id')) {
      if (!opts.format || p.id !== opts.format.id) return [];
      return [{ id: opts.format.id, gameId: opts.format.gameId, minRosterSize: opts.format.minRosterSize ?? 5, maxRosterSize: opts.format.maxRosterSize ?? 8, isActive: opts.format.isActive ?? true }];
    }
    if (sql.includes('FROM divisions WHERE "gameId"')) {
      return (opts.divisions ?? []).filter((d) => d.gameId === p.gameId);
    }
    if (sql.includes('FROM divisions WHERE id')) {
      const d = (opts.divisionLookup ?? {})[p.id as string];
      return d ? [d] : [];
    }
    if (sql.includes('FROM "user" WHERE id')) {
      if (opts.user && p.id === opts.user.id) return [opts.user];
      return [];
    }
    return [];
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('TeamService.createTeam', () => {
  let repos: ReturnType<typeof makeRepos>;
  let svc: TeamService;

  beforeEach(() => {
    repos = makeRepos();
    svc = new TeamService(repos.team, repos.member, repos.invite, repos.log);
    vi.mocked(query).mockReset();
  });

  it('happy path creates team + captain member + log', async () => {
    vi.mocked(query).mockImplementation(buildQueryHandler({
      game: { id: FOOTBALL_GAME },
      format: { id: FOOTBALL_5V5, gameId: FOOTBALL_GAME },
      divisions: [{ id: MALE_DIV, gameId: FOOTBALL_GAME, genderRestriction: 'male' }],
      user: { id: CAPTAIN, gender: 'male' },
    }) as unknown as typeof query);

    const out = await svc.createTeam({
      gameId: FOOTBALL_GAME, formatId: FOOTBALL_5V5, divisionId: MALE_DIV,
      name: 'Asad Baghdad',
    }, CAPTAIN);

    expect(out.team.id).toBe('t-new');
    expect(out.captainMember.isCaptain).toBe(true);
    expect(repos.team.create).toHaveBeenCalledTimes(1);
    expect(repos.member.create).toHaveBeenCalledTimes(1);
    expect(repos.log.recordCreate).toHaveBeenCalledTimes(1);
  });

  it('rejects when game is inactive', async () => {
    vi.mocked(query).mockImplementation(buildQueryHandler({
      game: { id: FOOTBALL_GAME, isActive: false },
      format: { id: FOOTBALL_5V5, gameId: FOOTBALL_GAME },
    }) as unknown as typeof query);

    await expect(svc.createTeam({
      gameId: FOOTBALL_GAME, formatId: FOOTBALL_5V5, divisionId: MALE_DIV, name: 'X',
    }, CAPTAIN)).rejects.toThrow(/GAME_INACTIVE/);
  });

  it('rejects when format does not belong to the game', async () => {
    vi.mocked(query).mockImplementation(buildQueryHandler({
      game: { id: FOOTBALL_GAME },
      format: { id: FOOTBALL_5V5, gameId: 'other-game' },
    }) as unknown as typeof query);

    await expect(svc.createTeam({
      gameId: FOOTBALL_GAME, formatId: FOOTBALL_5V5, divisionId: MALE_DIV, name: 'X',
    }, CAPTAIN)).rejects.toThrow(/FORMAT_NOT_FOR_GAME/);
  });

  it('rejects when division is missing for a game with divisions', async () => {
    vi.mocked(query).mockImplementation(buildQueryHandler({
      game: { id: FOOTBALL_GAME },
      format: { id: FOOTBALL_5V5, gameId: FOOTBALL_GAME },
      divisions: [{ id: MALE_DIV, gameId: FOOTBALL_GAME, genderRestriction: 'male' }],
    }) as unknown as typeof query);

    await expect(svc.createTeam({
      gameId: FOOTBALL_GAME, formatId: FOOTBALL_5V5, name: 'X',
    }, CAPTAIN)).rejects.toThrow(/DIVISION_REQUIRED_FOR_GAME/);
  });

  it('rejects gender mismatch on restricted division', async () => {
    vi.mocked(query).mockImplementation(buildQueryHandler({
      game: { id: FOOTBALL_GAME },
      format: { id: FOOTBALL_5V5, gameId: FOOTBALL_GAME },
      divisions: [{ id: MALE_DIV, gameId: FOOTBALL_GAME, genderRestriction: 'male' }],
      user: { id: CAPTAIN, gender: 'female' },
    }) as unknown as typeof query);

    await expect(svc.createTeam({
      gameId: FOOTBALL_GAME, formatId: FOOTBALL_5V5, divisionId: MALE_DIV, name: 'X',
    }, CAPTAIN)).rejects.toThrow(/CAPTAIN_GENDER_MISMATCH/);
  });

  it('rejects when captain disband cooldown is active', async () => {
    vi.mocked(query).mockImplementation(buildQueryHandler({
      game: { id: FOOTBALL_GAME },
      format: { id: FOOTBALL_5V5, gameId: FOOTBALL_GAME },
      divisions: [{ id: MIXED_DIV, gameId: FOOTBALL_GAME, genderRestriction: 'mixed' }],
      user: { id: CAPTAIN, gender: 'male' },
    }) as unknown as typeof query);
    repos.log.findMostRecentDisband = vi.fn(async () => new Date()); // just disbanded

    await expect(svc.createTeam({
      gameId: FOOTBALL_GAME, formatId: FOOTBALL_5V5, divisionId: MIXED_DIV, name: 'X',
    }, CAPTAIN)).rejects.toThrow(/CAPTAIN_DISBAND_COOLDOWN_ACTIVE/);
  });

  it('rejects when max teams per window reached', async () => {
    vi.mocked(query).mockImplementation(buildQueryHandler({
      game: { id: FOOTBALL_GAME },
      format: { id: FOOTBALL_5V5, gameId: FOOTBALL_GAME },
      divisions: [{ id: MIXED_DIV, gameId: FOOTBALL_GAME, genderRestriction: 'mixed' }],
      user: { id: CAPTAIN, gender: 'male' },
    }) as unknown as typeof query);
    repos.log.countCreatesInWindow = vi.fn(async () => 2); // already at limit

    await expect(svc.createTeam({
      gameId: FOOTBALL_GAME, formatId: FOOTBALL_5V5, divisionId: MIXED_DIV, name: 'X',
    }, CAPTAIN)).rejects.toThrow(/MAX_TEAMS_LIMIT_REACHED/);
  });

  it('slug generation handles collisions', async () => {
    vi.mocked(query).mockImplementation(buildQueryHandler({
      game: { id: FOOTBALL_GAME },
      format: { id: FOOTBALL_5V5, gameId: FOOTBALL_GAME },
      divisions: [{ id: MIXED_DIV, gameId: FOOTBALL_GAME, genderRestriction: 'mixed' }],
      user: { id: CAPTAIN, gender: 'male' },
    }) as unknown as typeof query);
    let calls = 0;
    repos.team.findBySlug = vi.fn(async () => {
      calls += 1;
      // First call ('asad-baghdad') returns existing, second ('asad-baghdad-2') returns null
      return calls === 1 ? makeTeam({ slug: 'asad-baghdad' }) : null;
    });

    const out = await svc.createTeam({
      gameId: FOOTBALL_GAME, formatId: FOOTBALL_5V5, divisionId: MIXED_DIV,
      name: 'Asad Baghdad',
    }, CAPTAIN);

    const createCall = vi.mocked(repos.team.create).mock.calls[0][0];
    expect(createCall.slug).toBe('asad-baghdad-2');
    expect(out.team.id).toBe('t-new');
  });
});

describe('TeamService.inviteMember', () => {
  let repos: ReturnType<typeof makeRepos>;
  let svc: TeamService;

  beforeEach(() => {
    repos = makeRepos();
    svc = new TeamService(repos.team, repos.member, repos.invite, repos.log);
  });

  it('rejects non-captain caller', async () => {
    repos.team.findById = vi.fn(async () => makeTeam({ captainId: CAPTAIN }));
    await expect(svc.inviteMember({ teamId: 't-1', userId: MEMBER_2 }, OUTSIDER))
      .rejects.toThrow(/NOT_TEAM_CAPTAIN/);
  });

  it('rejects when invitee already in another active team for scope', async () => {
    repos.team.findById = vi.fn(async () => makeTeam());
    vi.mocked(query).mockImplementation(buildQueryHandler({
      user: { id: MEMBER_2, gender: 'male' },
    }) as unknown as typeof query);
    repos.member.findActiveByUserAndScope = vi.fn(async () => makeMember({ userId: MEMBER_2 }));

    await expect(svc.inviteMember({ teamId: 't-1', userId: MEMBER_2 }, CAPTAIN))
      .rejects.toThrow(/USER_ALREADY_IN_ACTIVE_TEAM_FOR_SCOPE/);
  });

  it('rejects when team is at max roster', async () => {
    repos.team.findById = vi.fn(async () => makeTeam({ divisionId: null }));
    vi.mocked(query).mockImplementation(buildQueryHandler({
      format: { id: FOOTBALL_5V5, gameId: FOOTBALL_GAME, maxRosterSize: 5 },
      user: { id: MEMBER_2, gender: 'male' },
    }) as unknown as typeof query);
    // Five active members already
    repos.member.findActiveMembersByTeam = vi.fn(async () =>
      Array.from({ length: 5 }, (_, i) => makeMember({ id: `m-${i}` })),
    );

    await expect(svc.inviteMember({ teamId: 't-1', userId: MEMBER_2 }, CAPTAIN))
      .rejects.toThrow(/TEAM_AT_MAX_ROSTER/);
  });
});

describe('TeamService.acceptInvite', () => {
  let repos: ReturnType<typeof makeRepos>;
  let svc: TeamService;

  beforeEach(() => {
    repos = makeRepos();
    svc = new TeamService(repos.team, repos.member, repos.invite, repos.log);
  });

  it('rejects expired invite', async () => {
    repos.invite.findById = vi.fn(async () => makeInvite({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(svc.acceptInvite('inv-1', MEMBER_2)).rejects.toThrow(/INVITE_EXPIRED/);
  });

  it('re-checks scope conflict at accept time', async () => {
    repos.invite.findById = vi.fn(async () => makeInvite());
    repos.team.findById = vi.fn(async () => makeTeam({ divisionId: null }));
    vi.mocked(query).mockImplementation(buildQueryHandler({
      user: { id: MEMBER_2, gender: 'male' },
    }) as unknown as typeof query);
    // Invitee meanwhile joined a different team in same scope
    repos.member.findActiveByUserAndScope = vi.fn(async () => makeMember({ userId: MEMBER_2 }));

    await expect(svc.acceptInvite('inv-1', MEMBER_2))
      .rejects.toThrow(/USER_ALREADY_IN_ACTIVE_TEAM_FOR_SCOPE/);
  });
});

describe('TeamService.transferCaptaincy', () => {
  let repos: ReturnType<typeof makeRepos>;
  let svc: TeamService;

  beforeEach(() => {
    repos = makeRepos();
    svc = new TeamService(repos.team, repos.member, repos.invite, repos.log);
  });

  it('happy path swaps flags and updates team captainId', async () => {
    repos.team.findById = vi.fn(async () => makeTeam({ divisionId: null }));
    repos.member.findByTeamAndUser = vi.fn(async () => makeMember({ userId: MEMBER_2, isCaptain: false }));

    await svc.transferCaptaincy('t-1', MEMBER_2, CAPTAIN);

    const calls = vi.mocked(repos.member.setCaptainFlag).mock.calls;
    expect(calls[0]).toEqual(['t-1', CAPTAIN, false, expect.anything()]);
    expect(calls[1]).toEqual(['t-1', MEMBER_2, true, expect.anything()]);
    expect(repos.team.setCaptain).toHaveBeenCalledWith('t-1', MEMBER_2, expect.anything());
  });

  it('rejects non-captain caller', async () => {
    repos.team.findById = vi.fn(async () => makeTeam({ captainId: CAPTAIN }));
    await expect(svc.transferCaptaincy('t-1', MEMBER_2, OUTSIDER))
      .rejects.toThrow(/NOT_TEAM_CAPTAIN/);
  });

  it('rejects when new captain is not on team', async () => {
    repos.team.findById = vi.fn(async () => makeTeam({ divisionId: null }));
    repos.member.findByTeamAndUser = vi.fn(async () => null);
    await expect(svc.transferCaptaincy('t-1', MEMBER_2, CAPTAIN))
      .rejects.toThrow(/NEW_CAPTAIN_NOT_ON_TEAM/);
  });

  it('rejects gender mismatch on restricted division', async () => {
    repos.team.findById = vi.fn(async () => makeTeam({ divisionId: MALE_DIV }));
    repos.member.findByTeamAndUser = vi.fn(async () => makeMember({ userId: MEMBER_2 }));
    vi.mocked(query).mockImplementation(buildQueryHandler({
      divisionLookup: { [MALE_DIV]: { id: MALE_DIV, gameId: FOOTBALL_GAME, genderRestriction: 'male' } },
      user: { id: MEMBER_2, gender: 'female' },
    }) as unknown as typeof query);

    await expect(svc.transferCaptaincy('t-1', MEMBER_2, CAPTAIN))
      .rejects.toThrow(/NEW_CAPTAIN_GENDER_MISMATCH/);
  });
});

describe('TeamService.disbandTeam', () => {
  let repos: ReturnType<typeof makeRepos>;
  let svc: TeamService;

  beforeEach(() => {
    repos = makeRepos();
    svc = new TeamService(repos.team, repos.member, repos.invite, repos.log);
  });

  it('rejects non-captain caller', async () => {
    repos.team.findById = vi.fn(async () => makeTeam({ captainId: CAPTAIN }));
    await expect(svc.disbandTeam('t-1', OUTSIDER))
      .rejects.toThrow(/NOT_TEAM_CAPTAIN/);
  });

  it('disbands team, releases all members, cancels invites, logs event', async () => {
    repos.team.findById = vi.fn(async () => makeTeam());
    await svc.disbandTeam('t-1', CAPTAIN);

    expect(repos.team.disband).toHaveBeenCalledWith('t-1', expect.anything());
    expect(repos.member.releaseAllForTeam).toHaveBeenCalledWith('t-1', 'team_disbanded', expect.anything());
    expect(repos.invite.cancelAllPendingForTeam).toHaveBeenCalledWith('t-1', expect.anything());
    expect(repos.log.recordDisband).toHaveBeenCalledTimes(1);
  });
});

describe('TeamService.leaveTeam / releaseMember', () => {
  let repos: ReturnType<typeof makeRepos>;
  let svc: TeamService;

  beforeEach(() => {
    repos = makeRepos();
    svc = new TeamService(repos.team, repos.member, repos.invite, repos.log);
  });

  it('leaveTeam rejects when caller is captain', async () => {
    repos.team.findById = vi.fn(async () => makeTeam());
    repos.member.findByTeamAndUser = vi.fn(async () => makeMember({ userId: CAPTAIN, isCaptain: true }));
    await expect(svc.leaveTeam('t-1', CAPTAIN))
      .rejects.toThrow(/CAPTAIN_CANNOT_LEAVE_WITHOUT_TRANSFER/);
  });

  it('releaseMember rejects releasing the captain', async () => {
    repos.team.findById = vi.fn(async () => makeTeam());
    repos.member.findByTeamAndUser = vi.fn(async () => makeMember({ userId: CAPTAIN, isCaptain: true }));
    await expect(svc.releaseMember('t-1', CAPTAIN, CAPTAIN))
      .rejects.toThrow(/CANNOT_RELEASE_CAPTAIN/);
  });
});
