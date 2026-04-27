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
} from './team.repository.js';
import { TeamService } from './team.service.js';

// IDs from the seeded migration data — these survive every db:test:reset because
// migrations 005-007 insert them with fixed slugs.

async function getGameId(slug: string): Promise<string> {
  const pool = getTestPool();
  const r = await pool.query<{ id: string }>(`SELECT id FROM games WHERE slug = $1`, [slug]);
  return r.rows[0].id;
}
async function getFormatId(gameSlug: string, formatSlug: string): Promise<string> {
  const pool = getTestPool();
  const r = await pool.query<{ id: string }>(
    `SELECT gf.id FROM "gameFormats" gf JOIN games g ON g.id = gf."gameId"
     WHERE g.slug = $1 AND gf.slug = $2`,
    [gameSlug, formatSlug],
  );
  return r.rows[0].id;
}
async function getDivisionId(gameSlug: string, divSlug: string): Promise<string> {
  const pool = getTestPool();
  const r = await pool.query<{ id: string }>(
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
const svc = new TeamService(teamRepo, memberRepo, inviteRepo, logRepo);

afterAll(async () => {
  await closeTestPool();
});

beforeEach(async () => {
  // Do NOT truncate "user": platformConfig.updatedBy has a FK to user(id), and
  // CASCADE would wipe platformConfig along with users. Each test creates its own
  // users via createTestUser() with a random phone, so user-table growth is harmless.
  await truncateTables('teamCreationLog', 'teamInvites', 'teamMembers', 'teams');
});

// ─── 1. partial unique index — one active team per scope ──────────────────────

describe('Invariant: one active team per (user, game, format, division)', () => {
  it('a user can captain at most one active team in football 5v5 male', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'male');
    const u = await createTestUser({ gender: 'male' });

    await svc.createTeam(
      { gameId, formatId, divisionId, name: 'Asad Baghdad' },
      u.id,
    );

    // The second creation must fail at SQL level via the unique partial index.
    // The service-level disband-cooldown won't trigger (no disband happened).
    // But max_teams_per_user_per_game_per_window default is 2, so we get to the actual
    // SQL insert. The partial unique index on teamMembers should reject.
    await expect(
      svc.createTeam(
        { gameId, formatId, divisionId, name: 'Najmat Karrada' },
        u.id,
      ),
    ).rejects.toThrow();
  });

  it('same user can captain a team in a different format (different scope)', async () => {
    const gameId = await getGameId('football');
    const fiveV5 = await getFormatId('football', '5v5');
    const sevenV7 = await getFormatId('football', '7v7');
    const malediv = await getDivisionId('football', 'male');
    const u = await createTestUser({ gender: 'male' });

    await svc.createTeam({ gameId, formatId: fiveV5, divisionId: malediv, name: 'A' }, u.id);
    await svc.createTeam({ gameId, formatId: sevenV7, divisionId: malediv, name: 'B' }, u.id);

    const pool = getTestPool();
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM "teamMembers" WHERE "userId" = $1 AND "releasedAt" IS NULL`,
      [u.id],
    );
    expect(parseInt(r.rows[0].count, 10)).toBe(2);
  });
});

// ─── 2. partial unique index — one active captain per team ────────────────────

describe('Invariant: one active captain per team', () => {
  it('inserting a second active captain row fails with unique violation', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const u1 = await createTestUser({ gender: 'male' });
    const u2 = await createTestUser({ gender: 'male' });

    const { team } = await svc.createTeam(
      { gameId, formatId, divisionId, name: 'Team X' },
      u1.id,
    );

    const pool = getTestPool();
    await expect(
      pool.query(
        `INSERT INTO "teamMembers" ("teamId", "userId", "gameId", "formatId", "divisionId", "isCaptain")
         VALUES ($1, $2, $3, $4, $5, true)`,
        [team.id, u2.id, gameId, formatId, divisionId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});

// ─── 3. captain transfer atomicity ────────────────────────────────────────────

describe('Captain transfer atomicity', () => {
  it('transferCaptaincy swaps flags without violating the one-captain index', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const u1 = await createTestUser({ gender: 'male' });
    const u2 = await createTestUser({ gender: 'male' });

    const { team } = await svc.createTeam(
      { gameId, formatId, divisionId, name: 'Squad' },
      u1.id,
    );
    await memberRepo.create({
      teamId: team.id, userId: u2.id, gameId, formatId, divisionId, isCaptain: false,
    });

    await svc.transferCaptaincy(team.id, u2.id, u1.id);

    const pool = getTestPool();
    const teamRow = await pool.query<{ captainId: string }>(
      `SELECT "captainId" FROM teams WHERE id = $1`, [team.id],
    );
    expect(teamRow.rows[0].captainId).toBe(u2.id);

    const oldCaptain = await pool.query<{ isCaptain: boolean }>(
      `SELECT "isCaptain" FROM "teamMembers" WHERE "teamId" = $1 AND "userId" = $2 AND "releasedAt" IS NULL`,
      [team.id, u1.id],
    );
    const newCaptain = await pool.query<{ isCaptain: boolean }>(
      `SELECT "isCaptain" FROM "teamMembers" WHERE "teamId" = $1 AND "userId" = $2 AND "releasedAt" IS NULL`,
      [team.id, u2.id],
    );
    expect(oldCaptain.rows[0].isCaptain).toBe(false);
    expect(newCaptain.rows[0].isCaptain).toBe(true);
  });
});

// ─── 4. disband cooldown ──────────────────────────────────────────────────────

describe('Disband cooldown', () => {
  it('rejects re-creation immediately after disband; succeeds after backdating', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const u = await createTestUser({ gender: 'male' });

    const { team } = await svc.createTeam(
      { gameId, formatId, divisionId, name: 'Team A' },
      u.id,
    );
    await svc.disbandTeam(team.id, u.id);

    const pool = getTestPool();
    const log = await pool.query<{ action: string }>(
      `SELECT action FROM "teamCreationLog" WHERE "userId" = $1 ORDER BY "createdAt"`,
      [u.id],
    );
    expect(log.rows.map((r) => r.action)).toEqual(['created', 'disbanded']);

    // Cooldown is 30 days by default — immediate re-creation must fail.
    await expect(
      svc.createTeam({ gameId, formatId, divisionId, name: 'Team B' }, u.id),
    ).rejects.toThrow(/CAPTAIN_DISBAND_COOLDOWN_ACTIVE/);

    // Backdate the disband log row so the cooldown is past.
    await pool.query(
      `UPDATE "teamCreationLog"
       SET "createdAt" = CURRENT_TIMESTAMP - INTERVAL '40 days'
       WHERE "userId" = $1 AND action = 'disbanded'`,
      [u.id],
    );

    // Now creation should succeed.
    const result = await svc.createTeam(
      { gameId, formatId, divisionId, name: 'Team B' },
      u.id,
    );
    expect(result.team.name).toBe('Team B');
  });
});

// ─── 5. max teams per window ──────────────────────────────────────────────────

describe('Max teams per user per game per window', () => {
  it('with limit=2, the third create attempt is rejected', async () => {
    const gameId = await getGameId('football');
    const fiveV5 = await getFormatId('football', '5v5');
    const sevenV7 = await getFormatId('football', '7v7');
    const femaledivId = await getDivisionId('football', 'female');
    const mixeddivId = await getDivisionId('football', 'mixed');
    const u = await createTestUser({ gender: 'female' });

    const pool = getTestPool();
    // The default value is already 2, but ensure it for clarity in the test.
    await pool.query(
      `UPDATE "platformConfig" SET value = '2'::jsonb WHERE key = 'max_teams_per_user_per_game_per_window'`,
    );

    // Two teams in different scopes (so partial-unique index passes).
    await svc.createTeam(
      { gameId, formatId: fiveV5, divisionId: femaledivId, name: 'F1' }, u.id,
    );
    await svc.createTeam(
      { gameId, formatId: sevenV7, divisionId: femaledivId, name: 'F2' }, u.id,
    );

    // Third attempt in a third scope — gender allows it, but the per-window count caps us.
    await expect(
      svc.createTeam(
        { gameId, formatId: fiveV5, divisionId: mixeddivId, name: 'F3' }, u.id,
      ),
    ).rejects.toThrow(/MAX_TEAMS_LIMIT_REACHED/);
  });
});

// ─── 6. released members can rejoin a different team in same scope ────────────

describe('Released members can rejoin a different team in same scope', () => {
  it('after leaving team A, user can join team B in same (game, format, division)', async () => {
    const gameId = await getGameId('football');
    const formatId = await getFormatId('football', '5v5');
    const divisionId = await getDivisionId('football', 'mixed');
    const captainA = await createTestUser({ gender: 'male' });
    const captainB = await createTestUser({ gender: 'male' });
    const player = await createTestUser({ gender: 'male' });

    const { team: teamA } = await svc.createTeam(
      { gameId, formatId, divisionId, name: 'A' },
      captainA.id,
    );
    const { team: teamB } = await svc.createTeam(
      { gameId, formatId, divisionId, name: 'B' },
      captainB.id,
    );

    // Player joins A directly via repo
    await memberRepo.create({
      teamId: teamA.id, userId: player.id, gameId, formatId, divisionId, isCaptain: false,
    });

    // Player leaves A
    await svc.leaveTeam(teamA.id, player.id);

    // Player joins B — should succeed because the partial unique index ignores released rows.
    const member = await memberRepo.create({
      teamId: teamB.id, userId: player.id, gameId, formatId, divisionId, isCaptain: false,
    });
    expect(member.teamId).toBe(teamB.id);
  });
});
