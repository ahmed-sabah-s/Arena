import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  getTestPool,
  closeTestPool,
  truncateTables,
  createTestUser,
} from '../../test/setup.js';
import {
  TeamRepository,
  TeamMemberRepository,
  TeamInviteRepository,
  TeamCreationLogRepository,
} from '../team/team.repository.js';
import { TeamService } from '../team/team.service.js';
import {
  TeamEloRepository,
  PlayerEloRepository,
  EloService,
} from './index.js';

async function getGameId(slug: string): Promise<string> {
  const r = await getTestPool().query<{ id: string }>(
    `SELECT id FROM games WHERE slug = $1`, [slug],
  );
  return r.rows[0].id;
}
async function getFormatId(gameSlug: string, formatSlug: string): Promise<string> {
  const r = await getTestPool().query<{ id: string }>(
    `SELECT gf.id FROM "gameFormats" gf JOIN games g ON g.id = gf."gameId"
     WHERE g.slug = $1 AND gf.slug = $2`,
    [gameSlug, formatSlug],
  );
  return r.rows[0].id;
}
async function getDivisionId(gameSlug: string, divSlug: string): Promise<string> {
  const r = await getTestPool().query<{ id: string }>(
    `SELECT d.id FROM divisions d JOIN games g ON g.id = d."gameId"
     WHERE g.slug = $1 AND d.slug = $2`,
    [gameSlug, divSlug],
  );
  return r.rows[0].id;
}

const teamRepo = new TeamRepository();
const memberRepo = new TeamMemberRepository();
const inviteRepo = new TeamInviteRepository();
const logRepo = new TeamCreationLogRepository();
const teamEloRepo = new TeamEloRepository();
const playerEloRepo = new PlayerEloRepository();
const eloService = new EloService(teamEloRepo, playerEloRepo);
const teamService = new TeamService(teamRepo, memberRepo, inviteRepo, logRepo, eloService);

afterAll(async () => {
  await closeTestPool();
});

beforeEach(async () => {
  await truncateTables('teamElos', 'playerElos', 'teamCreationLog', 'teamInvites', 'teamMembers', 'teams');
});

describe('Team creation seeds team ELO', () => {
  it('advanced captain seeds at elo=mmr=1200, all-time scope, both highests = seed', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const captain = await createTestUser({ gender: 'male' });

    // Set the captain's experienceLevel for this test
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'advanced' WHERE id = $1`,
      [captain.id],
    );

    const { team } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Test Team' },
      captain.id,
    );

    const elo = await teamEloRepo.findByTeam(team.id, gameId, formatId, divisionId, null);
    expect(elo).not.toBeNull();
    expect(elo!.elo).toBe(1200);
    expect(elo!.mmr).toBe(1200);
    expect(elo!.highestElo).toBe(1200);
    expect(elo!.highestMmr).toBe(1200);
    expect(elo!.matchesPlayed).toBe(0);
    expect(elo!.seasonId).toBeNull();
  });

  it('captain with null experienceLevel seeds at intermediate (1000) — defensive fallback', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const captain = await createTestUser({ gender: 'male' });

    // Explicitly null the experienceLevel for this test
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = NULL WHERE id = $1`,
      [captain.id],
    );

    const { team } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Default Team' },
      captain.id,
    );

    const elo = await teamEloRepo.findByTeam(team.id, gameId, formatId, divisionId, null);
    expect(elo!.elo).toBe(1000);
    expect(elo!.mmr).toBe(1000);
  });

  it('beginner captain seeds at 800', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'male');
    const captain = await createTestUser({ gender: 'male' });

    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'beginner' WHERE id = $1`,
      [captain.id],
    );

    const { team } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Rookie' },
      captain.id,
    );

    const elo = await teamEloRepo.findByTeam(team.id, gameId, formatId, divisionId, null);
    expect(elo!.elo).toBe(800);
    expect(elo!.mmr).toBe(800);
  });
});

describe('seedTeamElo idempotency', () => {
  it('throws TEAM_ELO_ALREADY_EXISTS when called twice for the same scope', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const captain = await createTestUser({ gender: 'male' });

    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'expert' WHERE id = $1`,
      [captain.id],
    );

    const { team } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Once' },
      captain.id,
    );

    // Manually call seedTeamElo a second time — must throw.
    await expect(
      eloService.seedTeamElo({
        teamId: team.id,
        gameId,
        formatId,
        divisionId,
        captainExperienceLevel: 'expert',
      }),
    ).rejects.toThrow(/TEAM_ELO_ALREADY_EXISTS/);
  });
});
