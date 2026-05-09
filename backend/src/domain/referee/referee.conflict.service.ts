import { query } from '../../db.js';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/index.js';
import type { RefereeConflict } from './referee.entity.js';
import type { IRefereeConflictRepository } from './referee.interface.js';
import type { MatchParticipant } from '../match/match.entity.js';

/**
 * Conflict-of-interest declarations: a referee can declare they shouldn't be
 * assigned to matches involving certain teams or users (e.g., a relative is
 * playing on the team, or there's personal history with a player).
 *
 * Two flavours of conflict are evaluated together at assignment time:
 *  - Explicit conflicts stored in `refereeConflicts` (this domain).
 *  - Implicit conflict: the referee is an active member of either team
 *    participating in the match. That check uses `teamMembers` directly.
 */
export class RefereeConflictService {
  constructor(private readonly repo: IRefereeConflictRepository) {}

  async declareTeamConflict(
    refereeUserId: string,
    teamId: string,
    reason?: string,
  ): Promise<RefereeConflict> {
    try {
      return await this.repo.declare({
        refereeUserId,
        conflictedTeamId: teamId,
        conflictedUserId: null,
        reason: reason ?? null,
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err)) throw new ConflictError('CONFLICT_ALREADY_DECLARED');
      throw err;
    }
  }

  async declareUserConflict(
    refereeUserId: string,
    userId: string,
    reason?: string,
  ): Promise<RefereeConflict> {
    if (userId === refereeUserId) {
      throw new ValidationError('CANNOT_CONFLICT_WITH_SELF');
    }
    try {
      return await this.repo.declare({
        refereeUserId,
        conflictedTeamId: null,
        conflictedUserId: userId,
        reason: reason ?? null,
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err)) throw new ConflictError('CONFLICT_ALREADY_DECLARED');
      throw err;
    }
  }

  async removeConflict(
    conflictId: string,
    byRefereeUserId: string,
  ): Promise<RefereeConflict> {
    const existing = await this.repo.findById(conflictId);
    if (!existing) throw new NotFoundError('RefereeConflict');
    if (existing.refereeUserId !== byRefereeUserId) {
      throw new AuthorizationError('NOT_CONFLICT_OWNER');
    }
    return this.repo.removeConflict(conflictId);
  }

  async listMyConflicts(refereeUserId: string): Promise<RefereeConflict[]> {
    return this.repo.findActiveByReferee(refereeUserId);
  }

  /**
   * Evaluate whether the referee has a disqualifying interest in this match.
   * Returns true on either an explicit conflict OR the implicit "active team
   * member of a participating team" rule. Caller passes already-fetched
   * participants so we don't re-query for them.
   */
  async hasConflictForMatch(
    refereeUserId: string,
    participants: MatchParticipant[],
  ): Promise<boolean> {
    const teamIds = participants.map((p) => p.teamId).filter((x): x is string => Boolean(x));
    const userIds = participants.map((p) => p.userId).filter((x): x is string => Boolean(x));

    if (await this.repo.hasConflict(refereeUserId, teamIds, userIds)) return true;

    if (teamIds.length > 0) {
      const [row] = await query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM "teamMembers"
           WHERE "userId" = :refereeUserId
             AND "teamId" = ANY(:teamIds::uuid[])
             AND "releasedAt" IS NULL
         ) AS exists`,
        { refereeUserId, teamIds },
      );
      if (row?.exists) return true;
    }

    return false;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505',
  );
}
