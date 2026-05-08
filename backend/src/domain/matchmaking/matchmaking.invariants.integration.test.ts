import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  closeTestPool,
  createTestUser,
  getTestPool,
  truncateTables,
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
import { MatchmakingService } from './matchmaking.service.js';
import {
  DisputeRepository,
  MatchParticipantRepository,
  MatchRepository,
  MatchStatLogRepository,
  MatchStatRepository,
  MatchSubmissionRepository,
} from '../match/match.repository.js';
import { MatchService } from '../match/match.service.js';
import { NotificationRepository } from '../notification/notification.repository.js';
import { NotificationService } from '../notification/notification.service.js';

async function getGameId(slug: string): Promise<string> {
  const r = await getTestPool().query<{ id: string }>(`SELECT id FROM games WHERE slug = $1`, [slug]);
  return r.rows[0].id;
}
async function getFormatId(gameSlug: string, fmt: string): Promise<string> {
  const r = await getTestPool().query<{ id: string }>(
    `SELECT gf.id FROM "gameFormats" gf JOIN games g ON g.id = gf."gameId"
     WHERE g.slug = $1 AND gf.slug = $2`,
    [gameSlug, fmt],
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

const teamEloRepo = new TeamEloRepository();
const playerEloRepo = new PlayerEloRepository();
const eloService = new EloService(teamEloRepo, playerEloRepo);
const teamService = new TeamService(
  new TeamRepository(),
  new TeamMemberRepository(),
  new TeamInviteRepository(),
  new TeamCreationLogRepository(),
  eloService,
);

const notificationService = new NotificationService(new NotificationRepository());
const matchService = new MatchService(
  new MatchRepository(),
  new MatchParticipantRepository(),
  new MatchSubmissionRepository(),
  new MatchStatLogRepository(),
  new MatchStatRepository(),
  new DisputeRepository(),
  teamEloRepo,
  playerEloRepo,
  notificationService,
);

const matchmakingService = new MatchmakingService(
  matchService, teamEloRepo, playerEloRepo, eloService,
);

afterAll(async () => {
  await closeTestPool();
});

beforeEach(async () => {
  await truncateTables(
    'notifications',
    'queueEntries',
    'matchParticipants',
    'matches',
    'teamElos',
    'teamCreationLog',
    'teamMembers',
    'teams',
  );
});

describe('Matchmaker pairing', () => {
  it('two compatible team entries pair into a match', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');

    const captainA = await createTestUser({ gender: 'male' });
    const captainB = await createTestUser({ gender: 'male' });
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id IN ($1, $2)`,
      [captainA.id, captainB.id],
    );
    const { team: tA } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Mm Team A' }, captainA.id,
    );
    const { team: tB } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Mm Team B' }, captainB.id,
    );

    await matchmakingService.enqueue({ teamId: tA.id, gameId, formatId, divisionId }, captainA.id);
    await matchmakingService.enqueue({ teamId: tB.id, gameId, formatId, divisionId }, captainB.id);

    // Enqueue triggers a pass; both teams should be paired now.
    const entries = await getTestPool().query<{ status: string; matchId: string | null }>(
      `SELECT status, "matchId" FROM "queueEntries" ORDER BY "queuedAt"`,
    );
    expect(entries.rows.every((r) => r.status === 'matched')).toBe(true);
    expect(entries.rows[0].matchId).toBe(entries.rows[1].matchId);

    // The match exists with two participants
    const matchRows = await getTestPool().query<{ id: string }>(`SELECT id FROM matches`);
    expect(matchRows.rows.length).toBe(1);
    const participantRows = await getTestPool().query<{ side: string }>(
      `SELECT side FROM "matchParticipants" WHERE "matchId" = $1 ORDER BY side`,
      [matchRows.rows[0].id],
    );
    expect(participantRows.rows.map((r) => r.side)).toEqual(['A', 'B']);
  });

  it('partial unique index prevents the same team queueing twice for same scope', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const captain = await createTestUser({ gender: 'male' });
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id = $1`,
      [captain.id],
    );
    const { team } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Solo' }, captain.id,
    );
    await matchmakingService.enqueue({ teamId: team.id, gameId, formatId, divisionId }, captain.id);
    await expect(
      matchmakingService.enqueue({ teamId: team.id, gameId, formatId, divisionId }, captain.id),
    ).rejects.toThrow(/ALREADY_IN_QUEUE_FOR_SCOPE/);
  });

  it('individual game lazy-seeds playerElos on first queue', async () => {
    const gameId = await getGameId('chess');
    const formatId = await getFormatId('chess', '1v1');
    const divisionId = await getDivisionId('chess', 'open');
    const player = await createTestUser({ gender: 'male' });
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'expert' WHERE id = $1`,
      [player.id],
    );

    // Pre-seed: should be no playerElos row
    const before = await getTestPool().query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM "playerElos" WHERE "userId" = $1`,
      [player.id],
    );
    expect(parseInt(before.rows[0].count, 10)).toBe(0);

    await matchmakingService.enqueue({ gameId, formatId, divisionId }, player.id);

    const after = await getTestPool().query<{ elo: number; mmr: number }>(
      `SELECT elo, mmr FROM "playerElos" WHERE "userId" = $1`,
      [player.id],
    );
    expect(after.rows.length).toBe(1);
    expect(after.rows[0].elo).toBe(1400); // expert seed
  });
});

describe('acceptFriendly — immediate pairing', () => {
  it('queues two entries, marks one friendly_offered, accepts → match created with stakes=friendly', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');

    const captainA = await createTestUser({ gender: 'male' });
    const captainB = await createTestUser({ gender: 'male' });
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id IN ($1, $2)`,
      [captainA.id, captainB.id],
    );
    const { team: tA } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Friendly A' }, captainA.id,
    );
    const { team: tB } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Friendly B' }, captainB.id,
    );

    // tA enqueues with a wide MMR gap to a hypothetical opponent — but here both
    // intermediate seeds are equal. We force the friendly-offered scenario by
    // backdating tA's queuedAt and skipping the auto-pair from enqueue.
    // Simplest path: enqueue tA, wait for the auto-pass to NOT match (no opponent
    // yet), then backdate, then enqueue tB which auto-pairs them via normal MMR.
    // For a clean acceptFriendly test we instead manually insert the entries with
    // tA in friendly_offered and tB in waiting — that simulates the post-timeout
    // state without burning real time.
    const eloA = await teamEloRepo.findByTeam(tA.id, gameId, formatId, divisionId, null);
    const eloB = await teamEloRepo.findByTeam(tB.id, gameId, formatId, divisionId, null);
    if (!eloA || !eloB) throw new Error('Setup: teamElos missing');

    const aRow = await getTestPool().query<{ id: string }>(
      `INSERT INTO "queueEntries" ("teamId", "gameId", "formatId", "divisionId", "mmrAtQueue", status, "queuedAt")
       VALUES ($1, $2, $3, $4, $5, 'friendly_offered', CURRENT_TIMESTAMP - INTERVAL '12 minutes')
       RETURNING id`,
      [tA.id, gameId, formatId, divisionId, eloA.mmr],
    );
    const bRow = await getTestPool().query<{ id: string }>(
      `INSERT INTO "queueEntries" ("teamId", "gameId", "formatId", "divisionId", "mmrAtQueue", status, "queuedAt")
       VALUES ($1, $2, $3, $4, $5, 'waiting', CURRENT_TIMESTAMP - INTERVAL '1 minute')
       RETURNING id`,
      [tB.id, gameId, formatId, divisionId, eloB.mmr],
    );

    const out = await matchmakingService.acceptFriendly(aRow.rows[0].id, captainA.id);
    expect(out.matched).toBe(true);
    expect(out.matchId).toBeDefined();

    // Match exists with stakes=friendly, creationSource=queue
    const match = await getTestPool().query<{ stakes: string; creationSource: string }>(
      `SELECT stakes, "creationSource" FROM matches WHERE id = $1`,
      [out.matchId],
    );
    expect(match.rows[0].stakes).toBe('friendly');
    expect(match.rows[0].creationSource).toBe('queue');

    // Both entries flipped to matched
    const entries = await getTestPool().query<{ id: string; status: string; matchId: string | null }>(
      `SELECT id, status, "matchId" FROM "queueEntries" WHERE id IN ($1, $2)`,
      [aRow.rows[0].id, bRow.rows[0].id],
    );
    expect(entries.rows.every((r) => r.status === 'matched')).toBe(true);
    expect(entries.rows.every((r) => r.matchId === out.matchId)).toBe(true);
  });

  it('returns matched=false when no opponent is in scope; entry stays in friendly_offered', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');

    const captain = await createTestUser({ gender: 'male' });
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id = $1`,
      [captain.id],
    );
    const { team } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Lonely' }, captain.id,
    );
    const elo = await teamEloRepo.findByTeam(team.id, gameId, formatId, divisionId, null);
    if (!elo) throw new Error('Setup: teamElo missing');

    const row = await getTestPool().query<{ id: string }>(
      `INSERT INTO "queueEntries" ("teamId", "gameId", "formatId", "divisionId", "mmrAtQueue", status, "queuedAt")
       VALUES ($1, $2, $3, $4, $5, 'friendly_offered', CURRENT_TIMESTAMP - INTERVAL '12 minutes')
       RETURNING id`,
      [team.id, gameId, formatId, divisionId, elo.mmr],
    );

    const out = await matchmakingService.acceptFriendly(row.rows[0].id, captain.id);
    expect(out.matched).toBe(false);

    // Entry still in friendly_offered
    const entry = await getTestPool().query<{ status: string }>(
      `SELECT status FROM "queueEntries" WHERE id = $1`,
      [row.rows[0].id],
    );
    expect(entry.rows[0].status).toBe('friendly_offered');
  });
});
