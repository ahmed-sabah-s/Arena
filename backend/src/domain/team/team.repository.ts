import pg from 'pg';
import { query, transaction } from '../../db.js';
import type { CustomClient } from '../../db.js';
import { AppError, NotFoundError } from '../../shared/errors/index.js';
import type {
  Team,
  TeamMember,
  TeamInvite,
  TeamMemberReleaseReason,
  TeamInviteStatus,
} from './team.entity.js';
import type {
  CreateTeamData,
  CreateTeamMemberData,
  CreateTeamInviteData,
  ITeamRepository,
  ITeamMemberRepository,
  ITeamInviteRepository,
  ITeamCreationLogRepository,
} from './team.interface.js';

// Tiny helper: route a query through a transaction client when supplied,
// or fall back to the pool. Keeps the SQL calls themselves identical.
async function exec<T extends pg.QueryResultRow>(
  client: CustomClient | undefined,
  sql: string,
  params: Record<string, unknown>,
): Promise<T[]> {
  if (client) {
    const res = await client.query<T>(sql, params);
    return res.rows;
  }
  return query<T>(sql, params);
}

// ─── ITeamRepository ──────────────────────────────────────────────────────────

export class TeamRepository implements ITeamRepository {
  async create(input: CreateTeamData, client?: CustomClient): Promise<Team> {
    const rows = await exec<Team>(
      client,
      `INSERT INTO teams (
         "gameId", "formatId", "divisionId", "captainId",
         name, "nameAr", slug, city, "primaryColor"
       )
       VALUES (
         :gameId, :formatId, :divisionId, :captainId,
         :name, :nameAr, :slug, :city, :primaryColor
       )
       RETURNING *`,
      {
        gameId: input.gameId,
        formatId: input.formatId,
        divisionId: input.divisionId,
        captainId: input.captainId,
        name: input.name,
        nameAr: input.nameAr ?? null,
        slug: input.slug,
        city: input.city ?? null,
        primaryColor: input.primaryColor ?? null,
      },
    );
    if (!rows[0]) throw new AppError('Failed to create team', 500);
    return rows[0];
  }

  async findById(id: string): Promise<Team | null> {
    const [row] = await query<Team>(`SELECT * FROM teams WHERE id = :id`, { id });
    return row ?? null;
  }

  async findBySlug(gameId: string, slug: string): Promise<Team | null> {
    const [row] = await query<Team>(
      `SELECT * FROM teams WHERE "gameId" = :gameId AND slug = :slug`,
      { gameId, slug },
    );
    return row ?? null;
  }

  async findManyByCaptain(userId: string, gameId?: string): Promise<Team[]> {
    if (gameId) {
      return query<Team>(
        `SELECT * FROM teams WHERE "captainId" = :userId AND "gameId" = :gameId ORDER BY "createdAt" DESC`,
        { userId, gameId },
      );
    }
    return query<Team>(
      `SELECT * FROM teams WHERE "captainId" = :userId ORDER BY "createdAt" DESC`,
      { userId },
    );
  }

  async findActiveByScope(
    gameId: string,
    formatId: string,
    divisionId: string | null,
  ): Promise<Team[]> {
    if (divisionId === null) {
      return query<Team>(
        `SELECT * FROM teams
         WHERE "gameId" = :gameId AND "formatId" = :formatId AND "divisionId" IS NULL
           AND status = 'active'
         ORDER BY "foundedAt" ASC`,
        { gameId, formatId },
      );
    }
    return query<Team>(
      `SELECT * FROM teams
       WHERE "gameId" = :gameId AND "formatId" = :formatId AND "divisionId" = :divisionId
         AND status = 'active'
       ORDER BY "foundedAt" ASC`,
      { gameId, formatId, divisionId },
    );
  }

  private static readonly UPDATABLE = new Set([
    'name', 'nameAr', 'city', 'primaryColor', 'badgeFileId', 'captainId',
  ]);

  async update(id: string, partial: Partial<Team>, client?: CustomClient): Promise<Team> {
    const fields: string[] = [];
    const params: Record<string, unknown> = { id };

    for (const [key, value] of Object.entries(partial)) {
      if (value !== undefined && key !== 'id' && TeamRepository.UPDATABLE.has(key)) {
        fields.push(`"${key}" = :${key}`);
        params[key] = value;
      }
    }
    if (fields.length === 0) {
      const [existing] = await query<Team>(`SELECT * FROM teams WHERE id = :id`, { id });
      if (!existing) throw new NotFoundError('Team');
      return existing;
    }

    const rows = await exec<Team>(
      client,
      `UPDATE teams SET ${fields.join(', ')} WHERE id = :id RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('Team');
    return rows[0];
  }

  async disband(id: string, client: CustomClient): Promise<void> {
    await exec(client,
      `UPDATE teams SET status = 'disbanded', "disbandedAt" = CURRENT_TIMESTAMP WHERE id = :id`,
      { id },
    );
  }

  async setCaptain(teamId: string, newCaptainUserId: string, client: CustomClient): Promise<void> {
    await exec(client,
      `UPDATE teams SET "captainId" = :newCaptainUserId WHERE id = :teamId`,
      { teamId, newCaptainUserId },
    );
  }
}

// ─── ITeamMemberRepository ────────────────────────────────────────────────────

export class TeamMemberRepository implements ITeamMemberRepository {
  async create(input: CreateTeamMemberData, client?: CustomClient): Promise<TeamMember> {
    const rows = await exec<TeamMember>(
      client,
      `INSERT INTO "teamMembers" (
         "teamId", "userId", "gameId", "formatId", "divisionId",
         "isCaptain", position, "shirtNumber"
       )
       VALUES (
         :teamId, :userId, :gameId, :formatId, :divisionId,
         :isCaptain, :position, :shirtNumber
       )
       RETURNING *`,
      {
        teamId: input.teamId,
        userId: input.userId,
        gameId: input.gameId,
        formatId: input.formatId,
        divisionId: input.divisionId,
        isCaptain: input.isCaptain,
        position: input.position ?? null,
        shirtNumber: input.shirtNumber ?? null,
      },
    );
    if (!rows[0]) throw new AppError('Failed to create team member', 500);
    return rows[0];
  }

  async findById(id: string): Promise<TeamMember | null> {
    const [row] = await query<TeamMember>(`SELECT * FROM "teamMembers" WHERE id = :id`, { id });
    return row ?? null;
  }

  async findByTeamAndUser(teamId: string, userId: string): Promise<TeamMember | null> {
    const [row] = await query<TeamMember>(
      `SELECT * FROM "teamMembers"
       WHERE "teamId" = :teamId AND "userId" = :userId AND "releasedAt" IS NULL
       ORDER BY "joinedAt" DESC
       LIMIT 1`,
      { teamId, userId },
    );
    return row ?? null;
  }

  async findActiveMembersByTeam(teamId: string): Promise<TeamMember[]> {
    return query<TeamMember>(
      `SELECT * FROM "teamMembers"
       WHERE "teamId" = :teamId AND "releasedAt" IS NULL
       ORDER BY "isCaptain" DESC, "joinedAt" ASC`,
      { teamId },
    );
  }

  async findActiveByUserAndScope(
    userId: string,
    gameId: string,
    formatId: string,
    divisionId: string | null,
  ): Promise<TeamMember | null> {
    if (divisionId === null) {
      const [row] = await query<TeamMember>(
        `SELECT * FROM "teamMembers"
         WHERE "userId" = :userId AND "gameId" = :gameId AND "formatId" = :formatId
           AND "divisionId" IS NULL AND "releasedAt" IS NULL
         LIMIT 1`,
        { userId, gameId, formatId },
      );
      return row ?? null;
    }
    const [row] = await query<TeamMember>(
      `SELECT * FROM "teamMembers"
       WHERE "userId" = :userId AND "gameId" = :gameId AND "formatId" = :formatId
         AND "divisionId" = :divisionId AND "releasedAt" IS NULL
       LIMIT 1`,
      { userId, gameId, formatId, divisionId },
    );
    return row ?? null;
  }

  async release(id: string, reason: TeamMemberReleaseReason, client: CustomClient): Promise<void> {
    await exec(client,
      `UPDATE "teamMembers"
       SET "releasedAt" = CURRENT_TIMESTAMP, "releaseReason" = :reason, "isCaptain" = false
       WHERE id = :id AND "releasedAt" IS NULL`,
      { id, reason },
    );
  }

  async releaseAllForTeam(
    teamId: string,
    reason: TeamMemberReleaseReason,
    client: CustomClient,
  ): Promise<void> {
    await exec(client,
      `UPDATE "teamMembers"
       SET "releasedAt" = CURRENT_TIMESTAMP, "releaseReason" = :reason, "isCaptain" = false
       WHERE "teamId" = :teamId AND "releasedAt" IS NULL`,
      { teamId, reason },
    );
  }

  async setCaptainFlag(
    teamId: string,
    userId: string,
    isCaptain: boolean,
    client: CustomClient,
  ): Promise<void> {
    await exec(client,
      `UPDATE "teamMembers"
       SET "isCaptain" = :isCaptain
       WHERE "teamId" = :teamId AND "userId" = :userId AND "releasedAt" IS NULL`,
      { teamId, userId, isCaptain },
    );
  }

  private static readonly UPDATABLE = new Set(['position', 'shirtNumber']);

  async update(id: string, partial: Partial<TeamMember>, client?: CustomClient): Promise<TeamMember> {
    const fields: string[] = [];
    const params: Record<string, unknown> = { id };

    for (const [key, value] of Object.entries(partial)) {
      if (value !== undefined && TeamMemberRepository.UPDATABLE.has(key)) {
        fields.push(`"${key}" = :${key}`);
        params[key] = value;
      }
    }
    if (fields.length === 0) {
      const [existing] = await query<TeamMember>(`SELECT * FROM "teamMembers" WHERE id = :id`, { id });
      if (!existing) throw new NotFoundError('TeamMember');
      return existing;
    }
    const rows = await exec<TeamMember>(
      client,
      `UPDATE "teamMembers" SET ${fields.join(', ')} WHERE id = :id RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('TeamMember');
    return rows[0];
  }
}

// ─── ITeamInviteRepository ────────────────────────────────────────────────────

export class TeamInviteRepository implements ITeamInviteRepository {
  async create(input: CreateTeamInviteData, client?: CustomClient): Promise<TeamInvite> {
    const rows = await exec<TeamInvite>(
      client,
      `INSERT INTO "teamInvites" (
         "teamId", "invitedUserId", "invitedByUserId",
         position, "shirtNumber", message, "expiresAt"
       )
       VALUES (
         :teamId, :invitedUserId, :invitedByUserId,
         :position, :shirtNumber, :message, :expiresAt
       )
       RETURNING *`,
      {
        teamId: input.teamId,
        invitedUserId: input.invitedUserId,
        invitedByUserId: input.invitedByUserId,
        position: input.position ?? null,
        shirtNumber: input.shirtNumber ?? null,
        message: input.message ?? null,
        expiresAt: input.expiresAt,
      },
    );
    if (!rows[0]) throw new AppError('Failed to create team invite', 500);
    return rows[0];
  }

  async findById(id: string): Promise<TeamInvite | null> {
    const [row] = await query<TeamInvite>(`SELECT * FROM "teamInvites" WHERE id = :id`, { id });
    return row ?? null;
  }

  async findPendingForUser(userId: string): Promise<TeamInvite[]> {
    return query<TeamInvite>(
      `SELECT * FROM "teamInvites"
       WHERE "invitedUserId" = :userId AND status = 'pending' AND "expiresAt" > CURRENT_TIMESTAMP
       ORDER BY "createdAt" DESC`,
      { userId },
    );
  }

  async findPendingByTeam(teamId: string): Promise<TeamInvite[]> {
    return query<TeamInvite>(
      `SELECT * FROM "teamInvites"
       WHERE "teamId" = :teamId AND status = 'pending'
       ORDER BY "createdAt" DESC`,
      { teamId },
    );
  }

  async findExistingPending(teamId: string, invitedUserId: string): Promise<TeamInvite | null> {
    const [row] = await query<TeamInvite>(
      `SELECT * FROM "teamInvites"
       WHERE "teamId" = :teamId AND "invitedUserId" = :invitedUserId AND status = 'pending'`,
      { teamId, invitedUserId },
    );
    return row ?? null;
  }

  async markStatus(id: string, status: TeamInviteStatus, client: CustomClient): Promise<void> {
    await exec(client,
      `UPDATE "teamInvites"
       SET status = :status, "respondedAt" = CASE WHEN :status IN ('accepted','declined','cancelled')
                                                   THEN CURRENT_TIMESTAMP ELSE "respondedAt" END
       WHERE id = :id`,
      { id, status },
    );
  }

  async cancelAllPendingForTeam(teamId: string, client: CustomClient): Promise<void> {
    await exec(client,
      `UPDATE "teamInvites"
       SET status = 'cancelled', "respondedAt" = CURRENT_TIMESTAMP
       WHERE "teamId" = :teamId AND status = 'pending'`,
      { teamId },
    );
  }
}

// ─── ITeamCreationLogRepository ───────────────────────────────────────────────

export class TeamCreationLogRepository implements ITeamCreationLogRepository {
  async recordCreate(userId: string, gameId: string, teamId: string, client: CustomClient): Promise<void> {
    await exec(client,
      `INSERT INTO "teamCreationLog" ("userId", "gameId", "teamId", action)
       VALUES (:userId, :gameId, :teamId, 'created')`,
      { userId, gameId, teamId },
    );
  }

  async recordDisband(userId: string, gameId: string, teamId: string, client: CustomClient): Promise<void> {
    await exec(client,
      `INSERT INTO "teamCreationLog" ("userId", "gameId", "teamId", action)
       VALUES (:userId, :gameId, :teamId, 'disbanded')`,
      { userId, gameId, teamId },
    );
  }

  async countCreatesInWindow(userId: string, gameId: string, daysAgo: number): Promise<number> {
    const [row] = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM "teamCreationLog"
       WHERE "userId" = :userId AND "gameId" = :gameId AND action = 'created'
         AND "createdAt" > CURRENT_TIMESTAMP - (:days || ' days')::interval`,
      { userId, gameId, days: daysAgo.toString() },
    );
    return parseInt(row?.count ?? '0', 10);
  }

  async findMostRecentDisband(userId: string, gameId: string): Promise<Date | null> {
    const [row] = await query<{ createdAt: Date }>(
      `SELECT "createdAt" FROM "teamCreationLog"
       WHERE "userId" = :userId AND "gameId" = :gameId AND action = 'disbanded'
       ORDER BY "createdAt" DESC LIMIT 1`,
      { userId, gameId },
    );
    return row?.createdAt ?? null;
  }
}

// Re-export the helper for test ergonomics
export { transaction };
