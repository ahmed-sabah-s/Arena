import pg from 'pg';
import { query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import { AppError, NotFoundError } from '../../shared/errors/index.js';
import type { TeamElo, PlayerElo } from './elo.entity.js';
import type {
  CreateTeamEloData,
  CreatePlayerEloData,
  ITeamEloRepository,
  IPlayerEloRepository,
} from './elo.interface.js';

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

// ─── Team ELO ─────────────────────────────────────────────────────────────────

export class TeamEloRepository implements ITeamEloRepository {
  async create(input: CreateTeamEloData, client?: CustomClient): Promise<TeamElo> {
    const rows = await exec<TeamElo>(
      client,
      `INSERT INTO "teamElos" (
         "teamId", "gameId", "formatId", "divisionId", "seasonId",
         elo, mmr, "highestElo", "highestMmr"
       )
       VALUES (
         :teamId, :gameId, :formatId, :divisionId, :seasonId,
         :elo, :mmr, :elo, :mmr
       )
       RETURNING *`,
      { ...input },
    );
    if (!rows[0]) throw new AppError('Failed to create team ELO', 500);
    return rows[0];
  }

  async findById(id: string): Promise<TeamElo | null> {
    const [row] = await query<TeamElo>(`SELECT * FROM "teamElos" WHERE id = :id`, { id });
    return row ?? null;
  }

  async findByTeam(
    teamId: string,
    gameId: string,
    formatId: string,
    divisionId: string | null,
    seasonId: string | null,
  ): Promise<TeamElo | null> {
    // Use IS NOT DISTINCT FROM so NULL matches NULL — same semantics as the
    // partial unique index that enforces uniqueness on this scope.
    const [row] = await query<TeamElo>(
      `SELECT * FROM "teamElos"
       WHERE "teamId" = :teamId
         AND "gameId" = :gameId
         AND "formatId" = :formatId
         AND "divisionId" IS NOT DISTINCT FROM :divisionId
         AND "seasonId" IS NOT DISTINCT FROM :seasonId
       LIMIT 1`,
      { teamId, gameId, formatId, divisionId, seasonId },
    );
    return row ?? null;
  }

  async findManyByTeam(teamId: string): Promise<TeamElo[]> {
    return query<TeamElo>(
      `SELECT * FROM "teamElos" WHERE "teamId" = :teamId ORDER BY "createdAt" DESC`,
      { teamId },
    );
  }

  async findLeaderboard(
    gameId: string,
    formatId: string,
    divisionId: string | null,
    limit: number,
    offset: number,
  ): Promise<TeamElo[]> {
    return query<TeamElo>(
      `SELECT * FROM "teamElos"
       WHERE "gameId" = :gameId
         AND "formatId" = :formatId
         AND "divisionId" IS NOT DISTINCT FROM :divisionId
       ORDER BY elo DESC
       LIMIT :limit OFFSET :offset`,
      { gameId, formatId, divisionId, limit, offset },
    );
  }

  private static readonly UPDATABLE = new Set([
    'elo', 'mmr', 'matchesPlayed', 'matchesWon', 'matchesLost', 'matchesDrawn',
    'calibrationCompleteAt', 'lastMatchAt', 'form', 'highestElo', 'highestMmr',
  ]);

  async update(id: string, partial: Partial<TeamElo>, client: CustomClient): Promise<TeamElo> {
    const fields: string[] = [];
    const params: Record<string, unknown> = { id };
    for (const [key, value] of Object.entries(partial)) {
      if (value !== undefined && TeamEloRepository.UPDATABLE.has(key)) {
        fields.push(`"${key}" = :${key}`);
        // form is a JSONB column; pg won't bind a JS array directly to JSONB.
        params[key] = key === 'form' ? JSON.stringify(value) : value;
      }
    }
    if (fields.length === 0) {
      const existing = await this.findById(id);
      if (!existing) throw new NotFoundError('TeamElo');
      return existing;
    }
    const rows = await exec<TeamElo>(
      client,
      `UPDATE "teamElos" SET ${fields.join(', ')} WHERE id = :id RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('TeamElo');
    return rows[0];
  }
}

// ─── Player ELO ───────────────────────────────────────────────────────────────

export class PlayerEloRepository implements IPlayerEloRepository {
  async create(input: CreatePlayerEloData, client?: CustomClient): Promise<PlayerElo> {
    const rows = await exec<PlayerElo>(
      client,
      `INSERT INTO "playerElos" (
         "userId", "gameId", "formatId", "divisionId", "seasonId",
         elo, mmr, "highestElo", "highestMmr"
       )
       VALUES (
         :userId, :gameId, :formatId, :divisionId, :seasonId,
         :elo, :mmr, :elo, :mmr
       )
       RETURNING *`,
      { ...input },
    );
    if (!rows[0]) throw new AppError('Failed to create player ELO', 500);
    return rows[0];
  }

  async findById(id: string): Promise<PlayerElo | null> {
    const [row] = await query<PlayerElo>(`SELECT * FROM "playerElos" WHERE id = :id`, { id });
    return row ?? null;
  }

  async findByUser(
    userId: string,
    gameId: string,
    formatId: string,
    divisionId: string | null,
    seasonId: string | null,
  ): Promise<PlayerElo | null> {
    const [row] = await query<PlayerElo>(
      `SELECT * FROM "playerElos"
       WHERE "userId" = :userId
         AND "gameId" = :gameId
         AND "formatId" = :formatId
         AND "divisionId" IS NOT DISTINCT FROM :divisionId
         AND "seasonId" IS NOT DISTINCT FROM :seasonId
       LIMIT 1`,
      { userId, gameId, formatId, divisionId, seasonId },
    );
    return row ?? null;
  }

  async findManyByUser(userId: string): Promise<PlayerElo[]> {
    return query<PlayerElo>(
      `SELECT * FROM "playerElos" WHERE "userId" = :userId ORDER BY "createdAt" DESC`,
      { userId },
    );
  }

  async findLeaderboard(
    gameId: string,
    formatId: string,
    divisionId: string | null,
    limit: number,
    offset: number,
  ): Promise<PlayerElo[]> {
    return query<PlayerElo>(
      `SELECT * FROM "playerElos"
       WHERE "gameId" = :gameId
         AND "formatId" = :formatId
         AND "divisionId" IS NOT DISTINCT FROM :divisionId
       ORDER BY elo DESC
       LIMIT :limit OFFSET :offset`,
      { gameId, formatId, divisionId, limit, offset },
    );
  }

  private static readonly UPDATABLE = new Set([
    'elo', 'mmr', 'matchesPlayed', 'matchesWon', 'matchesLost', 'matchesDrawn',
    'calibrationCompleteAt', 'lastMatchAt', 'form', 'highestElo', 'highestMmr',
  ]);

  async update(id: string, partial: Partial<PlayerElo>, client: CustomClient): Promise<PlayerElo> {
    const fields: string[] = [];
    const params: Record<string, unknown> = { id };
    for (const [key, value] of Object.entries(partial)) {
      if (value !== undefined && PlayerEloRepository.UPDATABLE.has(key)) {
        fields.push(`"${key}" = :${key}`);
        // form is a JSONB column; pg won't bind a JS array directly to JSONB.
        params[key] = key === 'form' ? JSON.stringify(value) : value;
      }
    }
    if (fields.length === 0) {
      const existing = await this.findById(id);
      if (!existing) throw new NotFoundError('PlayerElo');
      return existing;
    }
    const rows = await exec<PlayerElo>(
      client,
      `UPDATE "playerElos" SET ${fields.join(', ')} WHERE id = :id RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('PlayerElo');
    return rows[0];
  }
}
