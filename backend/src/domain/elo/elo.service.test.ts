import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EloService } from './elo.service.js';
import type { ITeamEloRepository, IPlayerEloRepository } from './elo.interface.js';
import type { TeamElo, PlayerElo } from './elo.entity.js';

vi.mock('../../shared/config/platformConfig/index.js', () => ({
  getConfigInteger: vi.fn(async (key: string) => {
    const map: Record<string, number> = {
      starting_mmr_beginner: 800,
      starting_mmr_intermediate: 1000,
      starting_mmr_advanced: 1200,
      starting_mmr_expert: 1400,
      tier_threshold_bronze: 0,
      tier_threshold_silver: 1000,
      tier_threshold_gold: 1300,
      tier_threshold_platinum: 1600,
      tier_threshold_elite: 1900,
    };
    return map[key]!;
  }),
}));

vi.mock('../../db.js', () => ({
  query: vi.fn(async () => []),
}));

function makeTeamEloRepo(): ITeamEloRepository {
  return {
    create: vi.fn(async (input) => ({
      id: 'te-new', teamId: input.teamId, gameId: input.gameId, formatId: input.formatId,
      divisionId: input.divisionId, seasonId: input.seasonId,
      elo: input.elo, mmr: input.mmr,
      matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesDrawn: 0,
      calibrationCompleteAt: null, lastMatchAt: null, form: [],
      highestElo: input.elo, highestMmr: input.mmr,
      createdAt: new Date(), updatedAt: new Date(),
    } satisfies TeamElo)),
    findById: vi.fn(async () => null),
    findByTeam: vi.fn(async () => null),
    findManyByTeam: vi.fn(async () => []),
    findLeaderboard: vi.fn(async () => []),
    update: vi.fn(),
  };
}

function makePlayerEloRepo(): IPlayerEloRepository {
  return {
    create: vi.fn(async (input) => ({
      id: 'pe-new', userId: input.userId, gameId: input.gameId, formatId: input.formatId,
      divisionId: input.divisionId, seasonId: input.seasonId,
      elo: input.elo, mmr: input.mmr,
      matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesDrawn: 0,
      calibrationCompleteAt: null, lastMatchAt: null, form: [],
      highestElo: input.elo, highestMmr: input.mmr,
      createdAt: new Date(), updatedAt: new Date(),
    } satisfies PlayerElo)),
    findById: vi.fn(async () => null),
    findByUser: vi.fn(async () => null),
    findManyByUser: vi.fn(async () => []),
    findLeaderboard: vi.fn(async () => []),
    update: vi.fn(),
  };
}

describe('EloService.seedTeamElo', () => {
  let teamRepo: ITeamEloRepository;
  let playerRepo: IPlayerEloRepository;
  let svc: EloService;

  beforeEach(() => {
    teamRepo = makeTeamEloRepo();
    playerRepo = makePlayerEloRepo();
    svc = new EloService(teamRepo, playerRepo);
  });

  it('seeds advanced captain at elo=mmr=1200 (all-time, seasonId=null)', async () => {
    const out = await svc.seedTeamElo({
      teamId: 't-1', gameId: 'g-1', formatId: 'f-1', divisionId: 'd-1',
      captainExperienceLevel: 'advanced',
    });
    expect(out.elo).toBe(1200);
    expect(out.mmr).toBe(1200);
    expect(out.highestElo).toBe(1200);
    expect(out.seasonId).toBeNull();
    expect(teamRepo.create).toHaveBeenCalledTimes(1);
  });

  it('seeds null experienceLevel at intermediate (1000) — defensive fallback', async () => {
    const out = await svc.seedTeamElo({
      teamId: 't-2', gameId: 'g-1', formatId: 'f-1', divisionId: 'd-1',
      captainExperienceLevel: null,
    });
    expect(out.elo).toBe(1000);
    expect(out.mmr).toBe(1000);
  });

  it('throws TEAM_ELO_ALREADY_EXISTS when row at scope exists', async () => {
    teamRepo.findByTeam = vi.fn(async () => ({ id: 'existing' } as TeamElo));
    await expect(svc.seedTeamElo({
      teamId: 't-1', gameId: 'g-1', formatId: 'f-1', divisionId: 'd-1',
      captainExperienceLevel: 'beginner',
    })).rejects.toThrow(/TEAM_ELO_ALREADY_EXISTS/);
    expect(teamRepo.create).not.toHaveBeenCalled();
  });
});

describe('EloService.seedPlayerElo', () => {
  let teamRepo: ITeamEloRepository;
  let playerRepo: IPlayerEloRepository;
  let svc: EloService;

  beforeEach(() => {
    teamRepo = makeTeamEloRepo();
    playerRepo = makePlayerEloRepo();
    svc = new EloService(teamRepo, playerRepo);
  });

  it('seeds expert player at 1400', async () => {
    const out = await svc.seedPlayerElo({
      userId: 'u-1', gameId: 'g-chess', formatId: 'f-1v1', divisionId: 'd-open',
      experienceLevel: 'expert',
    });
    expect(out.elo).toBe(1400);
    expect(out.mmr).toBe(1400);
    expect(out.userId).toBe('u-1');
  });

  it('throws PLAYER_ELO_ALREADY_EXISTS when row at scope exists', async () => {
    playerRepo.findByUser = vi.fn(async () => ({ id: 'existing' } as PlayerElo));
    await expect(svc.seedPlayerElo({
      userId: 'u-1', gameId: 'g-chess', formatId: 'f-1v1', divisionId: 'd-open',
      experienceLevel: 'beginner',
    })).rejects.toThrow(/PLAYER_ELO_ALREADY_EXISTS/);
  });
});

describe('EloService.recalculateTier', () => {
  let svc: EloService;

  beforeEach(() => {
    svc = new EloService(makeTeamEloRepo(), makePlayerEloRepo());
  });

  it('reads tier thresholds from config and maps elo to tier', async () => {
    expect(await svc.recalculateTier(800)).toBe('bronze');
    expect(await svc.recalculateTier(1000)).toBe('silver');
    expect(await svc.recalculateTier(1300)).toBe('gold');
    expect(await svc.recalculateTier(1600)).toBe('platinum');
    expect(await svc.recalculateTier(1900)).toBe('elite');
  });
});
