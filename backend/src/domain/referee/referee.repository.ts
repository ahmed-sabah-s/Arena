import pg from 'pg';
import { query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import { AppError, NotFoundError } from '../../shared/errors/index.js';
import type {
  RefereeAssignment,
  RefereeAssignmentStatus,
  RefereeCaptainFlag,
  RefereeCertification,
  RefereeConflict,
  RefereeProfile,
} from './referee.entity.js';
import type {
  CreateAssignmentData,
  CreateCaptainFlagData,
  CreateCertificationData,
  DeclareConflictData,
  IRefereeAssignmentRepository,
  IRefereeCaptainFlagRepository,
  IRefereeCertificationRepository,
  IRefereeConflictRepository,
  IRefereeProfileRepository,
  ProfileCounter,
  UpdateRefereeProfileData,
} from './referee.interface.js';

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

// pg returns DECIMAL columns as strings; coerce reliabilityScore to number on read.
function normaliseProfile(row: RefereeProfile & { reliabilityScore: number | string }): RefereeProfile {
  return {
    ...row,
    reliabilityScore: typeof row.reliabilityScore === 'string'
      ? Number.parseFloat(row.reliabilityScore)
      : row.reliabilityScore,
  };
}

// ─── Profile ────────────────────────────────────────────────────────────────

export class RefereeProfileRepository implements IRefereeProfileRepository {
  async create(userId: string, client?: CustomClient): Promise<RefereeProfile> {
    const rows = await exec<RefereeProfile & { reliabilityScore: string }>(
      client,
      `INSERT INTO "refereeProfiles" ("userId") VALUES (:userId) RETURNING *`,
      { userId },
    );
    if (!rows[0]) throw new AppError('Failed to create referee profile', 500);
    return normaliseProfile(rows[0]);
  }

  async findByUserId(userId: string, client?: CustomClient): Promise<RefereeProfile | null> {
    const rows = await exec<RefereeProfile & { reliabilityScore: string }>(
      client,
      `SELECT * FROM "refereeProfiles" WHERE "userId" = :userId`,
      { userId },
    );
    return rows[0] ? normaliseProfile(rows[0]) : null;
  }

  async findByUserIdForUpdate(userId: string, client: CustomClient): Promise<RefereeProfile | null> {
    const res = await client.query<RefereeProfile & { reliabilityScore: string }>(
      `SELECT * FROM "refereeProfiles" WHERE "userId" = :userId FOR UPDATE`,
      { userId },
    );
    return res.rows[0] ? normaliseProfile(res.rows[0]) : null;
  }

  async update(
    userId: string,
    partial: UpdateRefereeProfileData,
    client?: CustomClient,
  ): Promise<RefereeProfile> {
    const sets: string[] = [];
    const params: Record<string, unknown> = { userId };
    if (partial.bio !== undefined) {
      sets.push(`bio = :bio`);
      params.bio = partial.bio;
    }
    if (partial.baseCity !== undefined) {
      sets.push(`"baseCity" = :baseCity`);
      params.baseCity = partial.baseCity;
    }
    if (partial.isAcceptingAssignments !== undefined) {
      sets.push(`"isAcceptingAssignments" = :isAcceptingAssignments`);
      params.isAcceptingAssignments = partial.isAcceptingAssignments;
    }
    if (sets.length === 0) {
      const existing = await this.findByUserId(userId, client);
      if (!existing) throw new NotFoundError('RefereeProfile');
      return existing;
    }
    const rows = await exec<RefereeProfile & { reliabilityScore: string }>(
      client,
      `UPDATE "refereeProfiles" SET ${sets.join(', ')} WHERE "userId" = :userId RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('RefereeProfile');
    return normaliseProfile(rows[0]);
  }

  async incrementCounter(
    userId: string,
    counter: ProfileCounter,
    client: CustomClient,
  ): Promise<void> {
    const column = `"${counter}"`;
    await client.query(
      `UPDATE "refereeProfiles" SET ${column} = ${column} + 1 WHERE "userId" = :userId`,
      { userId },
    );
  }

  async applyReliabilityDelta(
    userId: string,
    delta: number,
    client: CustomClient,
  ): Promise<RefereeProfile> {
    // Clamp to [0, 5] at the SQL layer so we never violate the CHECK.
    const res = await client.query<RefereeProfile & { reliabilityScore: string }>(
      `UPDATE "refereeProfiles"
       SET "reliabilityScore" = LEAST(5, GREATEST(0, "reliabilityScore" + :delta))
       WHERE "userId" = :userId
       RETURNING *`,
      { delta, userId },
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundError('RefereeProfile');
    return normaliseProfile(row);
  }

  async setLastOfficiatedAt(userId: string, when: Date, client: CustomClient): Promise<void> {
    await client.query(
      `UPDATE "refereeProfiles" SET "lastOfficiatedAt" = :when WHERE "userId" = :userId`,
      { when, userId },
    );
  }
}

// ─── Certification ──────────────────────────────────────────────────────────

export class RefereeCertificationRepository implements IRefereeCertificationRepository {
  async create(
    input: CreateCertificationData,
    client?: CustomClient,
  ): Promise<RefereeCertification> {
    const rows = await exec<RefereeCertification>(
      client,
      `INSERT INTO "refereeCertifications" ("userId", "gameId", "certifiedByUserId", notes)
       VALUES (:userId, :gameId, :certifiedByUserId, :notes)
       RETURNING *`,
      {
        userId: input.userId,
        gameId: input.gameId,
        certifiedByUserId: input.certifiedByUserId,
        notes: input.notes ?? null,
      },
    );
    if (!rows[0]) throw new AppError('Failed to create certification', 500);
    return rows[0];
  }

  async findActiveByUser(userId: string): Promise<RefereeCertification[]> {
    return query<RefereeCertification>(
      `SELECT * FROM "refereeCertifications"
       WHERE "userId" = :userId AND "revokedAt" IS NULL
       ORDER BY "certifiedAt" DESC`,
      { userId },
    );
  }

  async findActiveByGame(gameId: string): Promise<RefereeCertification[]> {
    return query<RefereeCertification>(
      `SELECT * FROM "refereeCertifications"
       WHERE "gameId" = :gameId AND "revokedAt" IS NULL
       ORDER BY "certifiedAt" DESC`,
      { gameId },
    );
  }

  async findActiveByUserAndGame(
    userId: string,
    gameId: string,
  ): Promise<RefereeCertification | null> {
    const [row] = await query<RefereeCertification>(
      `SELECT * FROM "refereeCertifications"
       WHERE "userId" = :userId AND "gameId" = :gameId AND "revokedAt" IS NULL
       LIMIT 1`,
      { userId, gameId },
    );
    return row ?? null;
  }

  async revoke(
    id: string,
    byUserId: string,
    reason: string,
    client?: CustomClient,
  ): Promise<RefereeCertification> {
    const rows = await exec<RefereeCertification>(
      client,
      `UPDATE "refereeCertifications"
       SET "revokedAt" = CURRENT_TIMESTAMP,
           "revokedByUserId" = :byUserId,
           "revocationReason" = :reason
       WHERE id = :id AND "revokedAt" IS NULL
       RETURNING *`,
      { id, byUserId, reason },
    );
    if (!rows[0]) throw new NotFoundError('RefereeCertification');
    return rows[0];
  }

  async userIsCertifiedFor(userId: string, gameId: string): Promise<boolean> {
    const [row] = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM "refereeCertifications"
         WHERE "userId" = :userId AND "gameId" = :gameId AND "revokedAt" IS NULL
       ) AS exists`,
      { userId, gameId },
    );
    return Boolean(row?.exists);
  }
}

// ─── Conflict ───────────────────────────────────────────────────────────────

export class RefereeConflictRepository implements IRefereeConflictRepository {
  async declare(
    input: DeclareConflictData,
    client?: CustomClient,
  ): Promise<RefereeConflict> {
    const rows = await exec<RefereeConflict>(
      client,
      `INSERT INTO "refereeConflicts" (
         "refereeUserId", "conflictedTeamId", "conflictedUserId", reason
       )
       VALUES (:refereeUserId, :conflictedTeamId, :conflictedUserId, :reason)
       RETURNING *`,
      {
        refereeUserId: input.refereeUserId,
        conflictedTeamId: input.conflictedTeamId,
        conflictedUserId: input.conflictedUserId,
        reason: input.reason,
      },
    );
    if (!rows[0]) throw new AppError('Failed to declare conflict', 500);
    return rows[0];
  }

  async findById(id: string): Promise<RefereeConflict | null> {
    const [row] = await query<RefereeConflict>(
      `SELECT * FROM "refereeConflicts" WHERE id = :id`,
      { id },
    );
    return row ?? null;
  }

  async findActiveByReferee(refereeUserId: string): Promise<RefereeConflict[]> {
    return query<RefereeConflict>(
      `SELECT * FROM "refereeConflicts"
       WHERE "refereeUserId" = :refereeUserId AND "removedAt" IS NULL
       ORDER BY "declaredAt" DESC`,
      { refereeUserId },
    );
  }

  async removeConflict(id: string, client?: CustomClient): Promise<RefereeConflict> {
    const rows = await exec<RefereeConflict>(
      client,
      `UPDATE "refereeConflicts"
       SET "removedAt" = CURRENT_TIMESTAMP
       WHERE id = :id AND "removedAt" IS NULL
       RETURNING *`,
      { id },
    );
    if (!rows[0]) throw new NotFoundError('RefereeConflict');
    return rows[0];
  }

  async hasConflict(
    refereeUserId: string,
    teamIds: string[],
    userIds: string[],
  ): Promise<boolean> {
    if (teamIds.length === 0 && userIds.length === 0) return false;
    // Pass empty arrays explicitly so the ANY(...) clauses don't error on null.
    const [row] = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM "refereeConflicts"
         WHERE "refereeUserId" = :refereeUserId
           AND "removedAt" IS NULL
           AND (
             "conflictedTeamId" = ANY(:teamIds::uuid[])
             OR "conflictedUserId" = ANY(:userIds::uuid[])
           )
       ) AS exists`,
      { refereeUserId, teamIds, userIds },
    );
    return Boolean(row?.exists);
  }
}

// ─── Assignment ─────────────────────────────────────────────────────────────

export class RefereeAssignmentRepository implements IRefereeAssignmentRepository {
  async create(
    input: CreateAssignmentData,
    client?: CustomClient,
  ): Promise<RefereeAssignment> {
    const rows = await exec<RefereeAssignment>(
      client,
      `INSERT INTO "refereeAssignments" (
         "matchId", "refereeUserId", role, "assignedByUserId"
       )
       VALUES (:matchId, :refereeUserId, :role, :assignedByUserId)
       RETURNING *`,
      { ...input },
    );
    if (!rows[0]) throw new AppError('Failed to create referee assignment', 500);
    return rows[0];
  }

  async findById(id: string, client?: CustomClient): Promise<RefereeAssignment | null> {
    const rows = await exec<RefereeAssignment>(
      client,
      `SELECT * FROM "refereeAssignments" WHERE id = :id`,
      { id },
    );
    return rows[0] ?? null;
  }

  async findByIdForUpdate(id: string, client: CustomClient): Promise<RefereeAssignment | null> {
    const res = await client.query<RefereeAssignment>(
      `SELECT * FROM "refereeAssignments" WHERE id = :id FOR UPDATE`,
      { id },
    );
    return res.rows[0] ?? null;
  }

  async findByMatch(matchId: string, client?: CustomClient): Promise<RefereeAssignment[]> {
    return exec<RefereeAssignment>(
      client,
      `SELECT * FROM "refereeAssignments"
       WHERE "matchId" = :matchId
       ORDER BY "assignedAt" ASC`,
      { matchId },
    );
  }

  async findActiveMainByMatch(
    matchId: string,
    client?: CustomClient,
  ): Promise<RefereeAssignment | null> {
    const rows = await exec<RefereeAssignment>(
      client,
      `SELECT * FROM "refereeAssignments"
       WHERE "matchId" = :matchId
         AND role = 'main'
         AND status IN ('assigned', 'accepted', 'checked_in')
       LIMIT 1`,
      { matchId },
    );
    return rows[0] ?? null;
  }

  async findActiveAssistantsByMatch(
    matchId: string,
    client?: CustomClient,
  ): Promise<RefereeAssignment[]> {
    return exec<RefereeAssignment>(
      client,
      `SELECT * FROM "refereeAssignments"
       WHERE "matchId" = :matchId
         AND role = 'assistant'
         AND status IN ('assigned', 'accepted', 'checked_in')
       ORDER BY "assignedAt" ASC`,
      { matchId },
    );
  }

  async findActiveAssignmentForReferee(
    matchId: string,
    refereeUserId: string,
    client?: CustomClient,
  ): Promise<RefereeAssignment | null> {
    const rows = await exec<RefereeAssignment>(
      client,
      `SELECT * FROM "refereeAssignments"
       WHERE "matchId" = :matchId
         AND "refereeUserId" = :refereeUserId
         AND status NOT IN ('declined', 'cancelled')
       ORDER BY "assignedAt" DESC
       LIMIT 1`,
      { matchId, refereeUserId },
    );
    return rows[0] ?? null;
  }

  async updateStatus(
    id: string,
    status: RefereeAssignmentStatus,
    client: CustomClient,
    extra?: { respondedAt?: Date; checkedInAt?: Date; declineReason?: string | null },
  ): Promise<RefereeAssignment> {
    const sets: string[] = [`status = :status`];
    const params: Record<string, unknown> = { id, status };
    if (extra?.respondedAt) {
      sets.push(`"respondedAt" = :respondedAt`);
      params.respondedAt = extra.respondedAt;
    }
    if (extra?.checkedInAt) {
      sets.push(`"checkedInAt" = :checkedInAt`);
      params.checkedInAt = extra.checkedInAt;
    }
    if (extra?.declineReason !== undefined) {
      sets.push(`"declineReason" = :declineReason`);
      params.declineReason = extra.declineReason;
    }
    const res = await client.query<RefereeAssignment>(
      `UPDATE "refereeAssignments" SET ${sets.join(', ')} WHERE id = :id RETURNING *`,
      params,
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundError('RefereeAssignment');
    return row;
  }

  async promoteToMain(
    id: string,
    promotedFromAssignmentId: string,
    client: CustomClient,
  ): Promise<RefereeAssignment> {
    const res = await client.query<RefereeAssignment>(
      `UPDATE "refereeAssignments"
       SET role = 'main',
           status = 'checked_in',
           "promotedAt" = CURRENT_TIMESTAMP,
           "promotedFromAssignmentId" = :promotedFromAssignmentId
       WHERE id = :id
       RETURNING *`,
      { id, promotedFromAssignmentId },
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundError('RefereeAssignment');
    return row;
  }

  async demoteToAssistant(id: string, client: CustomClient): Promise<RefereeAssignment> {
    const res = await client.query<RefereeAssignment>(
      `UPDATE "refereeAssignments"
       SET role = 'assistant',
           "promotedAt" = NULL,
           "promotedFromAssignmentId" = NULL
       WHERE id = :id
       RETURNING *`,
      { id },
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundError('RefereeAssignment');
    return row;
  }

  async countOfficiatedTeamMatchesInWindow(
    refereeUserId: string,
    teamId: string,
    sinceDays: number,
  ): Promise<number> {
    // A match counts if (a) the assignment is `completed` (referee saw it through),
    // and (b) the matchParticipants row for this match has the team on either side,
    // and (c) the assignment was made within the lookback window.
    const [row] = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM "refereeAssignments" ra
       JOIN "matchParticipants" mp ON mp."matchId" = ra."matchId"
       WHERE ra."refereeUserId" = :refereeUserId
         AND ra.status = 'completed'
         AND mp."teamId" = :teamId
         AND ra."assignedAt" >= CURRENT_TIMESTAMP - (:sinceDays || ' days')::interval`,
      { refereeUserId, teamId, sinceDays },
    );
    return Number.parseInt(row?.count ?? '0', 10);
  }

  async countNoShowsInWindow(refereeUserId: string, sinceDays: number): Promise<number> {
    const [row] = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM "refereeAssignments"
       WHERE "refereeUserId" = :refereeUserId
         AND status = 'no_show'
         AND "createdAt" >= CURRENT_TIMESTAMP - (:sinceDays || ' days')::interval`,
      { refereeUserId, sinceDays },
    );
    return Number.parseInt(row?.count ?? '0', 10);
  }
}

// ─── Captain Flag ───────────────────────────────────────────────────────────

export class RefereeCaptainFlagRepository implements IRefereeCaptainFlagRepository {
  async create(
    input: CreateCaptainFlagData,
    client?: CustomClient,
  ): Promise<RefereeCaptainFlag> {
    const rows = await exec<RefereeCaptainFlag>(
      client,
      `INSERT INTO "refereeCaptainFlags" (
         "matchId", "refereeUserId", "flaggedByUserId", "flaggedBySide", reason, description
       )
       VALUES (:matchId, :refereeUserId, :flaggedByUserId, :flaggedBySide, :reason, :description)
       RETURNING *`,
      { ...input },
    );
    if (!rows[0]) throw new AppError('Failed to create captain flag', 500);
    return rows[0];
  }

  async findByReferee(refereeUserId: string): Promise<RefereeCaptainFlag[]> {
    return query<RefereeCaptainFlag>(
      `SELECT * FROM "refereeCaptainFlags"
       WHERE "refereeUserId" = :refereeUserId
       ORDER BY "createdAt" DESC`,
      { refereeUserId },
    );
  }

  async findOpenByMatch(matchId: string): Promise<RefereeCaptainFlag[]> {
    return query<RefereeCaptainFlag>(
      `SELECT * FROM "refereeCaptainFlags"
       WHERE "matchId" = :matchId AND status = 'open'
       ORDER BY "createdAt" DESC`,
      { matchId },
    );
  }

  async countByRefereeInWindow(
    refereeUserId: string,
    sinceDays: number,
    client?: CustomClient,
  ): Promise<number> {
    // Optional client lets the assignment service count *including the
    // just-inserted flag* from inside its insertion transaction. Without it,
    // the count uses a separate connection and only sees committed rows.
    const rows = await exec<{ count: string }>(
      client,
      `SELECT COUNT(*) AS count
       FROM "refereeCaptainFlags"
       WHERE "refereeUserId" = :refereeUserId
         AND "createdAt" >= CURRENT_TIMESTAMP - (:sinceDays || ' days')::interval`,
      { refereeUserId, sinceDays },
    );
    return Number.parseInt(rows[0]?.count ?? '0', 10);
  }
}
