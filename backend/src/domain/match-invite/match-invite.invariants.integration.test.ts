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
import { MatchInviteRepository } from './match-invite.repository.js';
import { MatchInviteService } from './match-invite.service.js';

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
const inviteRepo = new MatchInviteRepository();
const inviteService = new MatchInviteService(
  inviteRepo, matchService, notificationService, 'test-jwt-secret',
);

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

afterAll(async () => {
  await closeTestPool();
});

beforeEach(async () => {
  await truncateTables(
    'notifications',
    'matchSubmissions',
    'matchParticipants',
    'matches',
    'matchInvites',
    'queueEntries',
    'teamElos',
    'teamCreationLog',
    'teamInvites',
    'teamMembers',
    'teams',
  );
});

describe('Friendly QR invite — full flow', () => {
  it('claim auto-locks the match with stakes=friendly; invite has creatorConfirmedAt set', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');

    const captainA = await createTestUser({ gender: 'male' });
    const captainB = await createTestUser({ gender: 'male' });
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id IN ($1, $2)`,
      [captainA.id, captainB.id],
    );

    const { team: teamA } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Friendly Inviters' }, captainA.id,
    );
    const { team: teamB } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Friendly Claimers' }, captainB.id,
    );

    const invite = await inviteService.createInvite({
      gameId, formatId, divisionId,
      creatorTeamId: teamA.id,
      stakes: 'friendly',
      matchMode: 'score_only',
    }, captainA.id);

    const claim = await inviteService.claimInvite(
      { code: invite.code, claimingTeamId: teamB.id },
      captainB.id,
    );

    expect(claim.status).toBe('completed');
    expect(claim.match).toBeDefined();
    expect(claim.match!.stakes).toBe('friendly');
    expect(claim.invite.creatorConfirmedAt).not.toBeNull();
    expect(claim.invite.matchId).toBe(claim.match!.id);

    // Match row exists with two participants (one per team)
    const matchRow = await getTestPool().query<{ id: string; stakes: string; creationSource: string }>(
      `SELECT id, stakes, "creationSource" FROM matches WHERE id = $1`,
      [claim.match!.id],
    );
    expect(matchRow.rows[0].stakes).toBe('friendly');
    expect(matchRow.rows[0].creationSource).toBe('qr_invite');

    const participants = await getTestPool().query<{ side: string; teamId: string }>(
      `SELECT side, "teamId" FROM "matchParticipants" WHERE "matchId" = $1 ORDER BY side`,
      [claim.match!.id],
    );
    expect(participants.rows.map((r) => r.side)).toEqual(['A', 'B']);
    expect(participants.rows[0].teamId).toBe(teamA.id);
    expect(participants.rows[1].teamId).toBe(teamB.id);

    // Notifications enqueued for both captains
    const notifs = await getTestPool().query<{ userId: string; type: string }>(
      `SELECT "userId", type FROM notifications WHERE type = 'match_locked'`,
    );
    const notifyUsers = new Set(notifs.rows.map((r) => r.userId));
    expect(notifyUsers.has(captainA.id)).toBe(true);
    expect(notifyUsers.has(captainB.id)).toBe(true);
  });

  it('confirmClaim on an already-confirmed friendly invite is a no-op returning the existing match', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');

    const captainA = await createTestUser({ gender: 'male' });
    const captainB = await createTestUser({ gender: 'male' });
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id IN ($1, $2)`,
      [captainA.id, captainB.id],
    );
    const { team: teamA } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'A' }, captainA.id,
    );
    const { team: teamB } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'B' }, captainB.id,
    );

    const invite = await inviteService.createInvite({
      gameId, formatId, divisionId,
      creatorTeamId: teamA.id,
      stakes: 'friendly',
      matchMode: 'score_only',
    }, captainA.id);

    const claim = await inviteService.claimInvite(
      { code: invite.code, claimingTeamId: teamB.id }, captainB.id,
    );

    // confirmClaim should succeed and return the same match.
    const confirm = await inviteService.confirmClaim(invite.id, captainA.id);
    expect(confirm.match.id).toBe(claim.match!.id);

    // No second match row
    const r = await getTestPool().query<{ count: string }>(`SELECT COUNT(*) AS count FROM matches`);
    expect(parseInt(r.rows[0].count, 10)).toBe(1);
  });
});

describe('Ranked QR invite — still requires confirmClaim', () => {
  it('claim returns awaiting_creator_confirmation; no match row yet', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');

    const captainA = await createTestUser({ gender: 'male' });
    const captainB = await createTestUser({ gender: 'male' });
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id IN ($1, $2)`,
      [captainA.id, captainB.id],
    );
    const { team: teamA } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Ranked A' }, captainA.id,
    );
    const { team: teamB } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Ranked B' }, captainB.id,
    );

    const invite = await inviteService.createInvite({
      gameId, formatId, divisionId,
      creatorTeamId: teamA.id,
      stakes: 'ranked',
      matchMode: 'score_only',
    }, captainA.id);

    const claim = await inviteService.claimInvite(
      { code: invite.code, claimingTeamId: teamB.id },
      captainB.id,
    );

    expect(claim.status).toBe('awaiting_creator_confirmation');
    expect(claim.match).toBeUndefined();

    const r = await getTestPool().query<{ count: string }>(`SELECT COUNT(*) AS count FROM matches`);
    expect(parseInt(r.rows[0].count, 10)).toBe(0);

    // Now confirmClaim by the creator → match created.
    const confirmed = await inviteService.confirmClaim(invite.id, captainA.id);
    expect(confirmed.match).toBeDefined();
    expect(confirmed.match.stakes).toBe('ranked');

    const r2 = await getTestPool().query<{ count: string }>(`SELECT COUNT(*) AS count FROM matches`);
    expect(parseInt(r2.rows[0].count, 10)).toBe(1);
  });
});
