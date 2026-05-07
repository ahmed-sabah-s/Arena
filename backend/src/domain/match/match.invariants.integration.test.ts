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
} from '../elo';
import {
  DisputeRepository,
  MatchParticipantRepository,
  MatchRepository,
  MatchStatLogRepository,
  MatchStatRepository,
  MatchSubmissionRepository,
} from './match.repository.js';
import { MatchService } from './match.service.js';
import { NotificationRepository } from '../notification/notification.repository.js';
import { NotificationService } from '../notification/notification.service.js';

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

const matchRepo = new MatchRepository();
const matchParticipantRepo = new MatchParticipantRepository();
const submissionRepo = new MatchSubmissionRepository();
const statLogRepo = new MatchStatLogRepository();
const statRepo = new MatchStatRepository();
const disputeRepo = new DisputeRepository();
const notificationService = new NotificationService(new NotificationRepository());
const matchService = new MatchService(
  matchRepo, matchParticipantRepo, submissionRepo,
  statLogRepo, statRepo, disputeRepo,
  teamEloRepo, playerEloRepo, notificationService,
);

afterAll(async () => {
  await closeTestPool();
});

beforeEach(async () => {
  await truncateTables(
    'notifications',
    'disputes',
    'matchStats',
    'matchStatLogs',
    'matchSubmissions',
    'matchParticipants',
    'matches',
    'teamElos',
    'teamCreationLog',
    'teamInvites',
    'teamMembers',
    'teams',
  );
});

async function createTwoTeamsWithCaptains(): Promise<{
  gameId: string; formatId: string; divisionId: string;
  teamA: string; teamB: string;
  captainA: string; captainB: string;
}> {
  const gameId = await getGameId('football');
  const formatId = await getFormatId('football', '5v5');
  const divisionId = await getDivisionId('football', 'mixed');
  const captainA = await createTestUser({ gender: 'male' });
  const captainB = await createTestUser({ gender: 'male' });
  // Set captains' experienceLevel = intermediate (1000) for predictable seed values
  await getTestPool().query(
    `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id IN ($1, $2)`,
    [captainA.id, captainB.id],
  );
  const { team: teamA } = await teamService.createTeam(
    { gameId, formatId, divisionId, name: 'Side A FC' }, captainA.id,
  );
  const { team: teamB } = await teamService.createTeam(
    { gameId, formatId, divisionId, name: 'Side B FC' }, captainB.id,
  );
  return {
    gameId, formatId, divisionId,
    teamA: teamA.id, teamB: teamB.id,
    captainA: captainA.id, captainB: captainB.id,
  };
}

async function createMatchBetween(
  ctx: { gameId: string; formatId: string; divisionId: string; teamA: string; teamB: string },
  stakes: 'ranked' | 'friendly' = 'ranked',
): Promise<{ matchId: string }> {
  const pool = getTestPool();
  // Insert match + participants directly (Phase 5 also has createMatchFromQueueEntries
  // / createMatchFromInvite, but those need queue/invite scaffolding; raw insert is
  // acceptable in a test where we're exercising the resolution path).
  const teamAElo = await teamEloRepo.findByTeam(ctx.teamA, ctx.gameId, ctx.formatId, ctx.divisionId, null);
  const teamBElo = await teamEloRepo.findByTeam(ctx.teamB, ctx.gameId, ctx.formatId, ctx.divisionId, null);
  if (!teamAElo || !teamBElo) throw new Error('Test setup: missing team ELO');

  const matchRow = await pool.query<{ id: string }>(
    `INSERT INTO matches (
       "gameId", "formatId", "divisionId", "matchMode", stakes, status,
       "scheduledAt", "creationSource"
     )
     VALUES ($1, $2, $3, 'score_only', $4, 'active', CURRENT_TIMESTAMP, 'admin_created')
     RETURNING id`,
    [ctx.gameId, ctx.formatId, ctx.divisionId, stakes],
  );
  const matchId = matchRow.rows[0].id;

  await pool.query(
    `INSERT INTO "matchParticipants" (
       "matchId", side, "teamId",
       "mmrAtMatch", "eloAtMatch", "matchesPlayedAtMatch"
     )
     VALUES ($1, 'A', $2, $3, $4, $5), ($1, 'B', $6, $7, $8, $9)`,
    [
      matchId,
      ctx.teamA, teamAElo.mmr, teamAElo.elo, teamAElo.matchesPlayed,
      ctx.teamB, teamBElo.mmr, teamBElo.elo, teamBElo.matchesPlayed,
    ],
  );
  return { matchId };
}

// ─── 1. End-to-end ranked match: ELO updates correctly ──────────────────────

describe('Match resolution (ranked)', () => {
  it('both sides agree → match completed, ELO updated for both teams', async () => {
    const ctx = await createTwoTeamsWithCaptains();
    const { matchId } = await createMatchBetween(ctx, 'ranked');

    // Side A submits 3-1 (A wins)
    const r1 = await matchService.submitMatchResult(
      { matchId, scoreA: 3, scoreB: 1 }, ctx.captainA,
    );
    expect(r1.status).toBe('awaiting_other_side');

    // Side B confirms with same score
    const r2 = await matchService.submitMatchResult(
      { matchId, scoreA: 3, scoreB: 1 }, ctx.captainB,
    );
    expect(r2.status).toBe('completed');
    expect(r2.resolution!.isRanked).toBe(true);
    expect(r2.resolution!.sides[0].result).toBe('win');
    expect(r2.resolution!.sides[1].result).toBe('loss');

    // Verify ELO moved
    const eloA = await teamEloRepo.findByTeam(ctx.teamA, ctx.gameId, ctx.formatId, ctx.divisionId, null);
    const eloB = await teamEloRepo.findByTeam(ctx.teamB, ctx.gameId, ctx.formatId, ctx.divisionId, null);
    expect(eloA!.elo).toBeGreaterThan(1000);
    expect(eloB!.elo).toBeLessThan(1000);
    expect(eloA!.matchesPlayed).toBe(1);
    expect(eloA!.matchesWon).toBe(1);
    expect(eloB!.matchesLost).toBe(1);

    // Match is completed with final scores
    const matchRow = await getTestPool().query<{ status: string; finalScoreA: number; finalScoreB: number }>(
      `SELECT status, "finalScoreA", "finalScoreB" FROM matches WHERE id = $1`,
      [matchId],
    );
    expect(matchRow.rows[0].status).toBe('completed');
    expect(matchRow.rows[0].finalScoreA).toBe(3);
    expect(matchRow.rows[0].finalScoreB).toBe(1);
  });

  it('disagreement → dispute opened, ELO unchanged', async () => {
    const ctx = await createTwoTeamsWithCaptains();
    const { matchId } = await createMatchBetween(ctx, 'ranked');

    await matchService.submitMatchResult({ matchId, scoreA: 3, scoreB: 1 }, ctx.captainA);
    const r2 = await matchService.submitMatchResult(
      { matchId, scoreA: 1, scoreB: 3 }, ctx.captainB,
    );
    expect(r2.status).toBe('disputed');

    const dispute = await disputeRepo.findOpenForMatch(matchId);
    expect(dispute).not.toBeNull();

    // ELO unchanged
    const eloA = await teamEloRepo.findByTeam(ctx.teamA, ctx.gameId, ctx.formatId, ctx.divisionId, null);
    expect(eloA!.matchesPlayed).toBe(0);
    expect(eloA!.elo).toBe(1000);
  });
});

// ─── 2. Friendly match: no ELO movement ──────────────────────────────────────

describe('Friendly match resolution', () => {
  it('completes the match but does NOT change ELO', async () => {
    const ctx = await createTwoTeamsWithCaptains();
    const { matchId } = await createMatchBetween(ctx, 'friendly');

    await matchService.submitMatchResult({ matchId, scoreA: 5, scoreB: 0 }, ctx.captainA);
    const r2 = await matchService.submitMatchResult(
      { matchId, scoreA: 5, scoreB: 0 }, ctx.captainB,
    );
    expect(r2.status).toBe('completed');
    expect(r2.resolution!.isRanked).toBe(false);
    expect(r2.resolution!.sides[0].eloChange).toBe(0);
    expect(r2.resolution!.sides[1].eloChange).toBe(0);

    const eloA = await teamEloRepo.findByTeam(ctx.teamA, ctx.gameId, ctx.formatId, ctx.divisionId, null);
    expect(eloA!.elo).toBe(1000);
    // matchesPlayed counters also stay at zero — friendly doesn't count
    expect(eloA!.matchesPlayed).toBe(0);
  });
});

// ─── 3. Rematch cooldown: 2nd halves, 3rd zeros visible ELO ────────────────

describe('Rematch cooldown', () => {
  it('three back-to-back ranked matches between same teams: 2nd halved, 3rd zero ELO', async () => {
    const ctx = await createTwoTeamsWithCaptains();

    // Match 1
    const m1 = await createMatchBetween(ctx, 'ranked');
    await matchService.submitMatchResult({ matchId: m1.matchId, scoreA: 3, scoreB: 1 }, ctx.captainA);
    await matchService.submitMatchResult({ matchId: m1.matchId, scoreA: 3, scoreB: 1 }, ctx.captainB);
    const eloA1 = await teamEloRepo.findByTeam(ctx.teamA, ctx.gameId, ctx.formatId, ctx.divisionId, null);
    const change1 = eloA1!.elo - 1000;

    // Match 2 — multiplier 0.5
    const m2 = await createMatchBetween(ctx, 'ranked');
    await matchService.submitMatchResult({ matchId: m2.matchId, scoreA: 3, scoreB: 1 }, ctx.captainA);
    const r2 = await matchService.submitMatchResult(
      { matchId: m2.matchId, scoreA: 3, scoreB: 1 }, ctx.captainB,
    );
    const sideA2 = r2.resolution!.sides.find((s) => s.side === 'A')!;
    expect(sideA2.cooldownMultiplier).toBe(0.5);

    // Match 3 — multiplier 0
    const m3 = await createMatchBetween(ctx, 'ranked');
    await matchService.submitMatchResult({ matchId: m3.matchId, scoreA: 3, scoreB: 1 }, ctx.captainA);
    const r3 = await matchService.submitMatchResult(
      { matchId: m3.matchId, scoreA: 3, scoreB: 1 }, ctx.captainB,
    );
    const sideA3 = r3.resolution!.sides.find((s) => s.side === 'A')!;
    expect(sideA3.cooldownMultiplier).toBe(0);
    expect(sideA3.eloChange).toBe(0);
    // mmrChange still nonzero — system keeps learning
    expect(sideA3.mmrChange).not.toBe(0);

    // Sanity: change1 was full, change2 was halved
    expect(change1).toBeGreaterThan(0);
  });
});
