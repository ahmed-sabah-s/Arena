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
import { TeamEloRepository, PlayerEloRepository, EloService } from '../elo';
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
import {
  RefereeAssignmentRepository,
  RefereeCaptainFlagRepository,
  RefereeCertificationRepository,
  RefereeConflictRepository,
  RefereeProfileRepository,
} from './referee.repository.js';
import { RefereeProfileService } from './referee.profile.service.js';
import { RefereeConflictService } from './referee.conflict.service.js';
import { RefereeAssignmentService } from './referee.assignment.service.js';

// ─── construct the dependency tree ──────────────────────────────────────────

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
const matchRepo = new MatchRepository();
const participantRepo = new MatchParticipantRepository();
const matchStatRepo = new MatchStatRepository();
const matchService = new MatchService(
  matchRepo, participantRepo,
  new MatchSubmissionRepository(),
  new MatchStatLogRepository(),
  matchStatRepo,
  new DisputeRepository(),
  teamEloRepo, playerEloRepo,
  notificationService,
);

const profileRepo = new RefereeProfileRepository();
const certRepo = new RefereeCertificationRepository();
const conflictRepo = new RefereeConflictRepository();
const assignmentRepo = new RefereeAssignmentRepository();
const flagRepo = new RefereeCaptainFlagRepository();

const refProfileService = new RefereeProfileService(profileRepo, certRepo);
const refConflictService = new RefereeConflictService(conflictRepo);
const refAssignmentService = new RefereeAssignmentService({
  assignmentRepo, profileRepo, flagRepo, matchRepo, participantRepo,
  matchStatRepo, teamEloRepo, playerEloRepo,
  profileService: refProfileService,
  conflictService: refConflictService,
  notificationService,
});

// ─── helpers ────────────────────────────────────────────────────────────────

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

async function ensureRoles(): Promise<{ adminRoleId: string; refRoleId: string }> {
  await getTestPool().query(
    `INSERT INTO role (name, description) VALUES ('admin', 'admin'), ('referee', 'ref')
     ON CONFLICT (name) DO NOTHING`,
  );
  const r = await getTestPool().query<{ id: string; name: string }>(
    `SELECT id, name FROM role WHERE name IN ('admin', 'referee')`,
  );
  const map: Record<string, string> = {};
  for (const row of r.rows) map[row.name] = row.id;
  return { adminRoleId: map.admin, refRoleId: map.referee };
}

async function makeAdmin(): Promise<{ id: string }> {
  const u = await createTestUser({ gender: 'male' });
  const { adminRoleId } = await ensureRoles();
  await getTestPool().query(
    `INSERT INTO "userRole" ("userId", "roleId") VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [u.id, adminRoleId],
  );
  return u;
}

async function makeReferee(opts: { gameId: string; certifiedByUserId: string }): Promise<{ id: string }> {
  const u = await createTestUser({ gender: 'male' });
  const { refRoleId } = await ensureRoles();
  await getTestPool().query(
    `INSERT INTO "userRole" ("userId", "roleId") VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [u.id, refRoleId],
  );
  await getTestPool().query(
    `INSERT INTO "refereeProfiles" ("userId") VALUES ($1) ON CONFLICT DO NOTHING`,
    [u.id],
  );
  await getTestPool().query(
    `INSERT INTO "refereeCertifications" ("userId", "gameId", "certifiedByUserId")
     VALUES ($1, $2, $3)`,
    [u.id, opts.gameId, opts.certifiedByUserId],
  );
  return u;
}

async function makeRefereedMatch(opts: {
  gameId: string;
  formatId: string;
  divisionId: string;
  teamAId: string;
  teamBId: string;
}): Promise<string> {
  const r = await getTestPool().query<{ id: string }>(
    `INSERT INTO matches (
       "gameId", "formatId", "divisionId", "matchMode", stakes, status,
       "scheduledAt", "creationSource"
     )
     VALUES ($1, $2, $3, 'refereed', 'ranked', 'scheduled',
             CURRENT_TIMESTAMP + INTERVAL '2 hours', 'admin_created')
     RETURNING id`,
    [opts.gameId, opts.formatId, opts.divisionId],
  );
  const matchId = r.rows[0].id;

  // Snapshot ELO for participants from the existing teamElos rows.
  const eA = await getTestPool().query<{ elo: number; mmr: number; matchesPlayed: number }>(
    `SELECT elo, mmr, "matchesPlayed" FROM "teamElos"
     WHERE "teamId" = $1 AND "seasonId" IS NULL`, [opts.teamAId],
  );
  const eB = await getTestPool().query<{ elo: number; mmr: number; matchesPlayed: number }>(
    `SELECT elo, mmr, "matchesPlayed" FROM "teamElos"
     WHERE "teamId" = $1 AND "seasonId" IS NULL`, [opts.teamBId],
  );
  await getTestPool().query(
    `INSERT INTO "matchParticipants" (
       "matchId", side, "teamId", "mmrAtMatch", "eloAtMatch", "matchesPlayedAtMatch"
     )
     VALUES ($1, 'A', $2, $3, $4, $5),
            ($1, 'B', $6, $7, $8, $9)`,
    [
      matchId,
      opts.teamAId, eA.rows[0].mmr, eA.rows[0].elo, eA.rows[0].matchesPlayed,
      opts.teamBId, eB.rows[0].mmr, eB.rows[0].elo, eB.rows[0].matchesPlayed,
    ],
  );
  return matchId;
}

afterAll(async () => {
  await closeTestPool();
});

beforeEach(async () => {
  await truncateTables(
    'refereeCaptainFlags',
    'refereeAssignments',
    'refereeConflicts',
    'refereeCertifications',
    'refereeProfiles',
    'notifications',
    'matchStats',
    'matchSubmissions',
    'matchParticipants',
    'matches',
    'teamElos',
    'teamCreationLog',
    'teamMembers',
    'teams',
    'userRole',
  );
});

// ─── tests ──────────────────────────────────────────────────────────────────

describe('Referee assignments — partial unique index "one active main per match"', () => {
  it('rejects a second main assignment while the first is still in an active state', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const admin = await makeAdmin();
    const teamA = await createTestUser({ gender: 'male' });
    const teamB = await createTestUser({ gender: 'male' });
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id IN ($1, $2)`,
      [teamA.id, teamB.id],
    );
    const { team: tA } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Idx A' }, teamA.id,
    );
    const { team: tB } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Idx B' }, teamB.id,
    );
    const matchId = await makeRefereedMatch({
      gameId, formatId, divisionId, teamAId: tA.id, teamBId: tB.id,
    });
    const ref1 = await makeReferee({ gameId, certifiedByUserId: admin.id });
    const ref2 = await makeReferee({ gameId, certifiedByUserId: admin.id });

    // First main assignment: succeeds.
    await refAssignmentService.assignReferee(matchId, ref1.id, 'main', admin.id);

    // Second main assignment: rejected by service-level pre-check.
    await expect(
      refAssignmentService.assignReferee(matchId, ref2.id, 'main', admin.id),
    ).rejects.toMatchObject({ message: expect.stringContaining('ALREADY_HAS_MAIN_REFEREE') });

    // Direct INSERT bypassing the service should also fail at the partial unique index.
    await expect(
      getTestPool().query(
        `INSERT INTO "refereeAssignments" ("matchId", "refereeUserId", role, "assignedByUserId")
         VALUES ($1, $2, 'main', $3)`,
        [matchId, ref2.id, admin.id],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);

    // After cancelling the first, a new main can be inserted.
    await getTestPool().query(
      `UPDATE "refereeAssignments" SET status = 'cancelled' WHERE "refereeUserId" = $1`,
      [ref1.id],
    );
    await expect(
      refAssignmentService.assignReferee(matchId, ref2.id, 'main', admin.id),
    ).resolves.toBeDefined();
  });
});

describe('Referee auto-promotion atomicity', () => {
  it('flips main→no_show then assistant→main without violating the unique index', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const admin = await makeAdmin();
    const teamA = await createTestUser({ gender: 'male' });
    const teamB = await createTestUser({ gender: 'male' });
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id IN ($1, $2)`,
      [teamA.id, teamB.id],
    );
    const { team: tA } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Promo A' }, teamA.id,
    );
    const { team: tB } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Promo B' }, teamB.id,
    );
    const matchId = await makeRefereedMatch({
      gameId, formatId, divisionId, teamAId: tA.id, teamBId: tB.id,
    });
    const main = await makeReferee({ gameId, certifiedByUserId: admin.id });
    const asst = await makeReferee({ gameId, certifiedByUserId: admin.id });

    const mainAssign = await refAssignmentService.assignReferee(matchId, main.id, 'main', admin.id);
    const asstAssign = await refAssignmentService.assignReferee(matchId, asst.id, 'assistant', admin.id);

    // Move main to 'accepted' (didn't check in), asst to 'checked_in'.
    await refAssignmentService.respondToAssignment(mainAssign.id, true, main.id);
    await refAssignmentService.respondToAssignment(asstAssign.id, true, asst.id);
    await refAssignmentService.checkIn(asstAssign.id, asst.id);

    const out = await refAssignmentService.triggerAutoPromotion(matchId, admin.id);
    expect(out.promoted).toBe(true);
    expect(out.oldMainUserId).toBe(main.id);
    expect(out.newMainUserId).toBe(asst.id);

    const rows = await getTestPool().query<{ refereeUserId: string; role: string; status: string }>(
      `SELECT "refereeUserId", role, status FROM "refereeAssignments" WHERE "matchId" = $1
       ORDER BY "assignedAt"`,
      [matchId],
    );
    const byUser = new Map(rows.rows.map((r) => [r.refereeUserId, r]));
    expect(byUser.get(main.id)?.status).toBe('no_show');
    expect(byUser.get(asst.id)?.role).toBe('main');
    expect(byUser.get(asst.id)?.status).toBe('checked_in');

    // No-show counter incremented + reliability penalty applied.
    const profile = await getTestPool().query<{
      totalNoShows: number; reliabilityScore: string;
    }>(
      `SELECT "totalNoShows", "reliabilityScore" FROM "refereeProfiles" WHERE "userId" = $1`,
      [main.id],
    );
    expect(profile.rows[0].totalNoShows).toBe(1);
    expect(Number.parseFloat(profile.rows[0].reliabilityScore)).toBeLessThan(5);
  });
});

describe('Conflict enforcement at assignment time', () => {
  it('rejects assigning a referee who has declared a team conflict', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const admin = await makeAdmin();
    const teamA = await createTestUser({ gender: 'male' });
    const teamB = await createTestUser({ gender: 'male' });
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id IN ($1, $2)`,
      [teamA.id, teamB.id],
    );
    const { team: tA } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Conf A' }, teamA.id,
    );
    const { team: tB } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'Conf B' }, teamB.id,
    );
    const matchId = await makeRefereedMatch({
      gameId, formatId, divisionId, teamAId: tA.id, teamBId: tB.id,
    });
    const ref = await makeReferee({ gameId, certifiedByUserId: admin.id });
    await refConflictService.declareTeamConflict(ref.id, tA.id, 'related to player');

    await expect(
      refAssignmentService.assignReferee(matchId, ref.id, 'main', admin.id),
    ).rejects.toMatchObject({ message: expect.stringContaining('CONFLICT_OF_INTEREST') });
  });
});

describe('Same-team-frequency limit', () => {
  it('blocks a 3rd assignment to matches involving the same team within the window', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const admin = await makeAdmin();
    const teamA = await createTestUser({ gender: 'male' });
    const teamB = await createTestUser({ gender: 'male' });
    const teamC = await createTestUser({ gender: 'male' });
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id IN ($1, $2, $3)`,
      [teamA.id, teamB.id, teamC.id],
    );
    const { team: tA } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'STF X' }, teamA.id,
    );
    const { team: tB } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'STF Y' }, teamB.id,
    );
    const { team: tC } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'STF Z' }, teamC.id,
    );

    const ref = await makeReferee({ gameId, certifiedByUserId: admin.id });

    // Fabricate 3 prior completed officiating runs against teamX so the 4th
    // attempt fails. (Service reads exact limit from platformConfig — default 3.)
    for (let i = 0; i < 3; i += 1) {
      const opponent = i === 0 ? tB.id : tC.id;
      const priorMatchId = await makeRefereedMatch({
        gameId, formatId, divisionId,
        teamAId: tA.id, teamBId: opponent,
      });
      await getTestPool().query(
        `UPDATE matches SET status = 'completed', "completedAt" = CURRENT_TIMESTAMP - INTERVAL '5 days' WHERE id = $1`,
        [priorMatchId],
      );
      await getTestPool().query(
        `INSERT INTO "refereeAssignments" (
           "matchId", "refereeUserId", role, status, "assignedByUserId", "assignedAt"
         )
         VALUES ($1, $2, 'main', 'completed', $3, CURRENT_TIMESTAMP - INTERVAL '5 days')`,
        [priorMatchId, ref.id, admin.id],
      );
    }

    // 4th attempt: includes teamA, must be rejected.
    const newMatchId = await makeRefereedMatch({
      gameId, formatId, divisionId,
      teamAId: tA.id, teamBId: tC.id,
    });
    await expect(
      refAssignmentService.assignReferee(newMatchId, ref.id, 'main', admin.id),
    ).rejects.toMatchObject({ message: expect.stringContaining('SAME_TEAM_LIMIT_REACHED') });
  });
});

describe('Refereed result submission — end-to-end ELO', () => {
  it('writes referee_recorded stats, completes the match, applies ELO to both teams', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const admin = await makeAdmin();
    const teamA = await createTestUser({ gender: 'male' });
    const teamB = await createTestUser({ gender: 'male' });
    await getTestPool().query(
      `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id IN ($1, $2)`,
      [teamA.id, teamB.id],
    );
    const { team: tA } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'E2E A' }, teamA.id,
    );
    const { team: tB } = await teamService.createTeam(
      { gameId, formatId, divisionId, name: 'E2E B' }, teamB.id,
    );
    const matchId = await makeRefereedMatch({
      gameId, formatId, divisionId, teamAId: tA.id, teamBId: tB.id,
    });

    const ref = await makeReferee({ gameId, certifiedByUserId: admin.id });
    const assign = await refAssignmentService.assignReferee(matchId, ref.id, 'main', admin.id);
    await refAssignmentService.respondToAssignment(assign.id, true, ref.id);
    await refAssignmentService.checkIn(assign.id, ref.id);
    await refAssignmentService.startMatch(matchId, ref.id);

    const eloABefore = await getTestPool().query<{ elo: number }>(
      `SELECT elo FROM "teamElos" WHERE "teamId" = $1 AND "seasonId" IS NULL`, [tA.id],
    );
    const eloBBefore = await getTestPool().query<{ elo: number }>(
      `SELECT elo FROM "teamElos" WHERE "teamId" = $1 AND "seasonId" IS NULL`, [tB.id],
    );

    await refAssignmentService.submitRefereedResult({
      matchId, scoreA: 3, scoreB: 1,
      stats: [
        { side: 'A', statKey: 'goals', statValue: 3, minute: 30, playerId: null },
        { side: 'B', statKey: 'goals', statValue: 1, minute: 80, playerId: null },
      ],
    }, ref.id);

    const matchRow = await getTestPool().query<{ status: string; finalScoreA: number; finalScoreB: number }>(
      `SELECT status, "finalScoreA", "finalScoreB" FROM matches WHERE id = $1`, [matchId],
    );
    expect(matchRow.rows[0].status).toBe('completed');
    expect(matchRow.rows[0].finalScoreA).toBe(3);
    expect(matchRow.rows[0].finalScoreB).toBe(1);

    const stats = await getTestPool().query<{ verificationStatus: string }>(
      `SELECT "verificationStatus" FROM "matchStats" WHERE "matchId" = $1`, [matchId],
    );
    expect(stats.rows.length).toBe(2);
    expect(stats.rows.every((r) => r.verificationStatus === 'referee_recorded')).toBe(true);

    const eloAAfter = await getTestPool().query<{ elo: number }>(
      `SELECT elo FROM "teamElos" WHERE "teamId" = $1 AND "seasonId" IS NULL`, [tA.id],
    );
    const eloBAfter = await getTestPool().query<{ elo: number }>(
      `SELECT elo FROM "teamElos" WHERE "teamId" = $1 AND "seasonId" IS NULL`, [tB.id],
    );
    expect(eloAAfter.rows[0].elo).toBeGreaterThan(eloABefore.rows[0].elo);
    expect(eloBAfter.rows[0].elo).toBeLessThan(eloBBefore.rows[0].elo);

    // Officiating counter on the referee.
    const profile = await getTestPool().query<{ totalMatchesOfficiated: number }>(
      `SELECT "totalMatchesOfficiated" FROM "refereeProfiles" WHERE "userId" = $1`, [ref.id],
    );
    expect(profile.rows[0].totalMatchesOfficiated).toBe(1);

    // Referee assignment marked completed.
    const a = await getTestPool().query<{ status: string }>(
      `SELECT status FROM "refereeAssignments" WHERE id = $1`, [assign.id],
    );
    expect(a.rows[0].status).toBe('completed');
  });
});

describe('Captain flag accumulation', () => {
  it('three flags from different captains across different matches accumulate to totalCaptainFlags=3', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const admin = await makeAdmin();

    // Three distinct (teamA, teamB) pairs across three matches; in each, A's
    // captain flags the same referee.
    const ref = await makeReferee({ gameId, certifiedByUserId: admin.id });

    for (let i = 0; i < 3; i += 1) {
      const aUser = await createTestUser({ gender: 'male' });
      const bUser = await createTestUser({ gender: 'male' });
      await getTestPool().query(
        `UPDATE "user" SET "experienceLevel" = 'intermediate' WHERE id IN ($1, $2)`,
        [aUser.id, bUser.id],
      );
      const { team: tA } = await teamService.createTeam(
        { gameId, formatId, divisionId, name: `Flag A ${i}` }, aUser.id,
      );
      const { team: tB } = await teamService.createTeam(
        { gameId, formatId, divisionId, name: `Flag B ${i}` }, bUser.id,
      );
      const matchId = await makeRefereedMatch({
        gameId, formatId, divisionId, teamAId: tA.id, teamBId: tB.id,
      });
      // Move match to completed and the referee's assignment with it.
      await getTestPool().query(
        `UPDATE matches SET status = 'completed', "completedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
        [matchId],
      );
      await getTestPool().query(
        `INSERT INTO "refereeAssignments" (
           "matchId", "refereeUserId", role, status, "assignedByUserId"
         )
         VALUES ($1, $2, 'main', 'completed', $3)`,
        [matchId, ref.id, admin.id],
      );

      await refAssignmentService.flagReferee(
        matchId, ref.id, aUser.id, 'incorrect_calls', `pass ${i}`,
      );
    }

    const profile = await getTestPool().query<{ totalCaptainFlags: number }>(
      `SELECT "totalCaptainFlags" FROM "refereeProfiles" WHERE "userId" = $1`, [ref.id],
    );
    expect(profile.rows[0].totalCaptainFlags).toBe(3);

    // Threshold = 3 by default, so admin notification should also have fired.
    const notif = await getTestPool().query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE type = 'referee_flag_threshold_reached'`,
    );
    expect(parseInt(notif.rows[0].count, 10)).toBeGreaterThan(0);
  });
});
