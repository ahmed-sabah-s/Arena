import { transaction, query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors/index.js';
import type {
  IMatchParticipantRepository,
  IMatchRepository,
  IMatchSubmissionRepository,
  IMatchStatRepository,
} from '../match/match.interface.js';
import type { Match, MatchParticipant } from '../match/match.entity.js';
import { applyMatchEloAndStats } from '../match/match.elo.js';
import type { ITeamEloRepository, IPlayerEloRepository } from '../elo/elo.interface.js';
import type { TeamElo, PlayerElo } from '../elo/elo.entity.js';
import type { NotificationService } from '../notification/notification.service.js';
import type { AuditLogService } from '../audit/audit.service.js';

export interface AdminMatchServiceDeps {
  matchRepo: IMatchRepository;
  participantRepo: IMatchParticipantRepository;
  submissionRepo: IMatchSubmissionRepository;
  statRepo: IMatchStatRepository;
  teamEloRepo: ITeamEloRepository;
  playerEloRepo: IPlayerEloRepository;
  notificationService: NotificationService;
  auditLogService: AuditLogService;
}

/**
 * Admin operational surface for matches: manual cancellation and result
 * override. The override path is the load-bearing one — admin can correct
 * a match's recorded result even after subsequent matches have already
 * adjusted the participants' ELO. We reverse THIS match's contribution by
 * subtracting (eloAfterMatch - eloAtMatch) from the current ELO, then
 * apply the new override and capture fresh after-states.
 *
 * The reversal only works for matches with non-null `*AfterMatch` columns
 * — i.e., matches resolved after migration 037 was applied. Older matches
 * predate the column and the reversal can't be computed safely; the
 * service refuses with `MATCH_PRE_AFTER_STATE_CANNOT_OVERRIDE`. Admins
 * who need to fix old matches can resolve via dispute resolution
 * instead.
 */
export class AdminMatchService {
  constructor(private readonly deps: AdminMatchServiceDeps) {}

  async cancelMatch(matchId: string, reason: string, byAdminUserId: string): Promise<Match> {
    await this.assertAdmin(byAdminUserId);
    const before = await this.deps.matchRepo.findById(matchId);
    if (!before) throw new NotFoundError('Match');
    if (before.status === 'cancelled' || before.status === 'voided' || before.status === 'completed') {
      throw new ConflictError(`MATCH_NOT_CANCELLABLE_FROM_${before.status.toUpperCase()}`);
    }

    const after = await transaction(async (client) => {
      const updated = await this.deps.matchRepo.updateStatus(matchId, 'cancelled', client);

      // Cascade-cancel any active venue booking bound to this match. The
      // booking service has its own cancel flow but we duplicate the
      // minimum here so admin can drive the whole thing in one tx — and
      // unbind matches.venueId so a future replay doesn't inherit it.
      const cancelledBookings = await client.query<{ id: string; requestedByUserId: string }>(
        `UPDATE "venueBookings"
         SET status = 'cancelled',
             "cancelledAt" = CURRENT_TIMESTAMP,
             "cancelledByUserId" = :byAdminUserId,
             "cancelReason" = :reason
         WHERE "matchId" = :matchId
           AND status IN ('requested', 'confirmed')
         RETURNING id, "requestedByUserId"`,
        { matchId, byAdminUserId, reason: `match_cancelled_by_admin: ${reason}` },
      );
      await client.query(
        `UPDATE matches SET "venueId" = NULL WHERE id = :matchId`,
        { matchId },
      );

      // Notify match participants + booking parties.
      const participants = await this.deps.participantRepo.findByMatchId(matchId, client);
      const recipients = await this.collectRecipients(participants, client);
      for (const userId of recipients) {
        await this.deps.notificationService.enqueue({
          userId, type: 'match_cancelled_by_admin',
          payload: { matchId, reason },
        }, client);
      }
      for (const b of cancelledBookings.rows) {
        await this.deps.notificationService.enqueue({
          userId: b.requestedByUserId,
          type: 'venue_booking_cancelled',
          payload: { bookingId: b.id, reason: 'match_cancelled_by_admin' },
        }, client);
      }
      return updated;
    });

    await this.deps.auditLogService.recordAdminAction({
      adminUserId: byAdminUserId,
      action: 'match.cancel',
      resource: 'match',
      resourceId: matchId,
      beforeState: before,
      afterState: after,
      notes: reason,
    });
    return after;
  }

  /**
   * Override a completed match's result. Reverses this match's ELO
   * contribution from each participant's current ELO row, then applies
   * the override scores via the normal applyMatchEloAndStats path which
   * captures fresh after-states. Refuses if the match is in 'disputed'
   * status (admin should use dispute resolution instead) or if the
   * after-states are null (pre-migration-037 match).
   */
  async overrideResult(
    matchId: string,
    scoreA: number,
    scoreB: number,
    reason: string,
    byAdminUserId: string,
  ): Promise<Match> {
    await this.assertAdmin(byAdminUserId);
    const before = await this.deps.matchRepo.findById(matchId);
    if (!before) throw new NotFoundError('Match');
    if (before.status === 'disputed') {
      throw new ConflictError('MATCH_DISPUTED_USE_DISPUTE_RESOLUTION');
    }
    if (before.status !== 'completed') {
      throw new ConflictError(`MATCH_NOT_OVERRIDABLE_FROM_${before.status.toUpperCase()}`);
    }

    const after = await transaction(async (client) => {
      const match = await this.deps.matchRepo.findByIdForUpdate(matchId, client);
      if (!match) throw new NotFoundError('Match');

      const participants = await this.deps.participantRepo.findByMatchId(matchId, client);
      // Refuse if any participant lacks an after-state — we can't reverse
      // safely without it.
      for (const p of participants) {
        if (p.eloAfterMatch == null || p.mmrAfterMatch == null || p.matchesPlayedAfterMatch == null) {
          throw new ConflictError('MATCH_PRE_AFTER_STATE_CANNOT_OVERRIDE');
        }
      }

      // Reverse THIS match's contribution from each participant's ELO row.
      for (const p of participants) {
        const eloDelta = p.eloAfterMatch! - p.eloAtMatch;
        const mmrDelta = p.mmrAfterMatch! - p.mmrAtMatch;
        const matchesDelta = p.matchesPlayedAfterMatch! - p.matchesPlayedAtMatch;
        await this.reverseEloOnParticipant(p, eloDelta, mmrDelta, matchesDelta, match, client);
      }

      // Now apply the override as a fresh resolution. The post-state
      // capture inside applyMatchEloAndStats overwrites the columns we
      // just relied on for reversal — fine, that's the whole point.
      await applyMatchEloAndStats(
        match, participants, scoreA, scoreB, client,
        {
          matchRepo: this.deps.matchRepo,
          teamEloRepo: this.deps.teamEloRepo,
          playerEloRepo: this.deps.playerEloRepo,
          participantRepo: this.deps.participantRepo,
        },
      );
      const updated = await this.deps.matchRepo.setCompleted(matchId, scoreA, scoreB, client);

      // Notify both sides.
      const recipients = await this.collectRecipients(participants, client);
      for (const userId of recipients) {
        await this.deps.notificationService.enqueue({
          userId, type: 'match_overridden',
          payload: {
            matchId, scoreA, scoreB,
            previousScoreA: before.finalScoreA,
            previousScoreB: before.finalScoreB,
            reason,
          },
        }, client);
      }
      return updated;
    });

    await this.deps.auditLogService.recordAdminAction({
      adminUserId: byAdminUserId,
      action: 'match.override_result',
      resource: 'match',
      resourceId: matchId,
      beforeState: before,
      afterState: after,
      notes: reason,
    });
    return after;
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  /**
   * Subtract THIS match's deltas from the participant's current
   * teamElos / playerElos row. Doesn't touch form / wins / losses /
   * draws — those are append-only history for reporting. The visible
   * adjustment is purely on elo / mmr / matchesPlayed so the override's
   * fresh resolution can re-add the correct shaped contribution on top.
   */
  private async reverseEloOnParticipant(
    p: MatchParticipant,
    eloDelta: number,
    mmrDelta: number,
    matchesDelta: number,
    match: Match,
    client: CustomClient,
  ): Promise<void> {
    if (p.teamId) {
      const elo = await this.deps.teamEloRepo.findByTeam(
        p.teamId, match.gameId, match.formatId, match.divisionId, match.seasonId,
      );
      if (!elo) return;
      await this.applyTeamReversal(elo, eloDelta, mmrDelta, matchesDelta, client);
    } else if (p.userId) {
      const elo = await this.deps.playerEloRepo.findByUser(
        p.userId, match.gameId, match.formatId, match.divisionId, match.seasonId,
      );
      if (!elo) return;
      await this.applyPlayerReversal(elo, eloDelta, mmrDelta, matchesDelta, client);
    }
  }

  private async applyTeamReversal(
    elo: TeamElo,
    eloDelta: number,
    mmrDelta: number,
    matchesDelta: number,
    client: CustomClient,
  ): Promise<void> {
    await client.query(
      `UPDATE "teamElos"
       SET elo = elo - :eloDelta,
           mmr = mmr - :mmrDelta,
           "matchesPlayed" = GREATEST(0, "matchesPlayed" - :matchesDelta)
       WHERE id = :id`,
      { id: elo.id, eloDelta, mmrDelta, matchesDelta },
    );
  }

  private async applyPlayerReversal(
    elo: PlayerElo,
    eloDelta: number,
    mmrDelta: number,
    matchesDelta: number,
    client: CustomClient,
  ): Promise<void> {
    await client.query(
      `UPDATE "playerElos"
       SET elo = elo - :eloDelta,
           mmr = mmr - :mmrDelta,
           "matchesPlayed" = GREATEST(0, "matchesPlayed" - :matchesDelta)
       WHERE id = :id`,
      { id: elo.id, eloDelta, mmrDelta, matchesDelta },
    );
  }

  private async collectRecipients(
    participants: MatchParticipant[],
    client: CustomClient,
  ): Promise<Set<string>> {
    const recipients = new Set<string>();
    for (const p of participants) {
      if (p.userId) recipients.add(p.userId);
      if (p.teamId) {
        const res = await client.query<{ captainId: string }>(
          `SELECT "captainId" FROM teams WHERE id = :id`,
          { id: p.teamId },
        );
        const captain = res.rows[0]?.captainId;
        if (captain) recipients.add(captain);
      }
    }
    return recipients;
  }

  private async assertAdmin(userId: string): Promise<void> {
    const [row] = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM "userRole" ur
         JOIN role r ON r.id = ur."roleId"
         WHERE ur."userId" = :userId AND r.name = 'admin'
       ) AS exists`,
      { userId },
    );
    if (!row?.exists) throw new AuthorizationError('NOT_ADMIN');
  }
}

