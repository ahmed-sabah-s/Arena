import { transaction, query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/index.js';
import type {
  IDisputeRepository,
  IMatchParticipantRepository,
  IMatchRepository,
  IMatchStatRepository,
  IMatchSubmissionRepository,
} from '../match/match.interface.js';
import type {
  Dispute,
  Match,
  MatchParticipant,
  MatchStat,
  MatchSubmission,
} from '../match/match.entity.js';
import { applyMatchEloAndStats } from '../match/match.elo.js';
import type { ITeamEloRepository, IPlayerEloRepository } from '../elo/elo.interface.js';
import type { NotificationService } from '../notification/notification.service.js';
import type { AuditLogService } from '../audit/audit.service.js';
import type { DisputeResolution } from './dispute.entity.js';

export interface DisputeContext {
  dispute: Dispute;
  match: Match;
  participants: MatchParticipant[];
  submissions: MatchSubmission[];
  stats: MatchStat[];
}

export interface ResolveDisputeInput {
  resolution: DisputeResolution;
  notes?: string;
  scoreA?: number; // required when resolution === 'admin_decided_score'
  scoreB?: number;
}

export interface DisputeServiceDeps {
  disputeRepo: IDisputeRepository;
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
 * Phase 8 dispute resolution. Phase 5 opens the dispute when match results
 * disagree but provides no resolution path. Five outcomes are supported:
 *
 *   side_a_result_stands     — apply side A's submission, run resolution,
 *                              ELO updates flow normally.
 *   side_b_result_stands     — same for side B.
 *   admin_decided_score      — admin enters explicit (scoreA, scoreB).
 *   match_voided             — no ELO impact, match status → voided.
 *   match_replay_required    — match status → cancelled, both sides
 *                              notified to schedule a replay manually.
 *
 * dismissDispute is for the rare "insufficient information" case where
 * admin can't decide; the dispute is dismissed without changing match
 * state. The match remains in `disputed` status indefinitely.
 *
 * Audit log entries are written AFTER the transaction commits — we want
 * the audit row to land even if a downstream notification fails, but it
 * mustn't claim a state change that didn't actually persist.
 */
export class DisputeService {
  constructor(private readonly deps: DisputeServiceDeps) {}

  async listOpen(byAdminUserId: string, limit = 50): Promise<Dispute[]> {
    await this.assertAdmin(byAdminUserId);
    return this.deps.disputeRepo.listOpen(limit);
  }

  async getDisputeContext(disputeId: string, byAdminUserId: string): Promise<DisputeContext> {
    await this.assertAdmin(byAdminUserId);
    const dispute = await this.deps.disputeRepo.findById(disputeId);
    if (!dispute) throw new NotFoundError('Dispute');
    const match = await this.deps.matchRepo.findById(dispute.matchId);
    if (!match) throw new NotFoundError('Match');
    const participants = await this.deps.participantRepo.findByMatchId(dispute.matchId);
    const submissions = await this.deps.submissionRepo.findByMatch(dispute.matchId);
    const stats = await this.deps.statRepo.findByMatch(dispute.matchId);
    return { dispute, match, participants, submissions, stats };
  }

  async resolveDispute(
    disputeId: string,
    input: ResolveDisputeInput,
    byAdminUserId: string,
  ): Promise<{ dispute: Dispute; match: Match }> {
    await this.assertAdmin(byAdminUserId);

    if (input.resolution === 'admin_decided_score'
      && (input.scoreA == null || input.scoreB == null)) {
      throw new ValidationError('ADMIN_DECIDED_SCORE_REQUIRES_SCORES');
    }

    const beforeDispute = await this.deps.disputeRepo.findById(disputeId);
    if (!beforeDispute) throw new NotFoundError('Dispute');
    const beforeMatch = await this.deps.matchRepo.findById(beforeDispute.matchId);
    if (!beforeMatch) throw new NotFoundError('Match');

    const result = await transaction(async (client) => {
      const dispute = await this.deps.disputeRepo.findByIdForUpdate(disputeId, client);
      if (!dispute) throw new NotFoundError('Dispute');
      if (dispute.status !== 'open') throw new ConflictError('DISPUTE_NOT_OPEN');

      const match = await this.deps.matchRepo.findByIdForUpdate(dispute.matchId, client);
      if (!match) throw new NotFoundError('Match');

      const updatedMatch = await this.applyResolution(input, match, client);

      const resolutionLabel =
        input.resolution === 'admin_decided_score'
          ? `admin_decided_score:${input.scoreA}-${input.scoreB}`
          : input.resolution;

      const resolvedDispute = await this.deps.disputeRepo.setResolved(
        disputeId, resolutionLabel, input.notes ?? null, byAdminUserId, client,
      );

      // Notify both sides of participants — they care about the outcome.
      const participants = await this.deps.participantRepo.findByMatchId(dispute.matchId, client);
      const recipients = await this.collectRecipients(participants, client);
      for (const userId of recipients) {
        await this.deps.notificationService.enqueue({
          userId,
          type: 'dispute_resolved',
          payload: {
            disputeId, matchId: dispute.matchId, resolution: input.resolution,
          },
        }, client);
      }
      return { dispute: resolvedDispute, match: updatedMatch };
    });

    await this.deps.auditLogService.recordAdminAction({
      adminUserId: byAdminUserId,
      action: `dispute.${input.resolution}`,
      resource: 'dispute',
      resourceId: disputeId,
      beforeState: { dispute: beforeDispute, match: beforeMatch },
      afterState: { dispute: result.dispute, match: result.match },
      notes: input.notes,
    });
    return result;
  }

  async dismissDispute(
    disputeId: string,
    notes: string,
    byAdminUserId: string,
  ): Promise<Dispute> {
    await this.assertAdmin(byAdminUserId);
    const before = await this.deps.disputeRepo.findById(disputeId);
    if (!before) throw new NotFoundError('Dispute');

    const after = await transaction(async (client) => {
      const dispute = await this.deps.disputeRepo.findByIdForUpdate(disputeId, client);
      if (!dispute) throw new NotFoundError('Dispute');
      if (dispute.status !== 'open') throw new ConflictError('DISPUTE_NOT_OPEN');
      return this.deps.disputeRepo.setDismissed(disputeId, notes, byAdminUserId, client);
    });

    await this.deps.auditLogService.recordAdminAction({
      adminUserId: byAdminUserId,
      action: 'dispute.dismissed',
      resource: 'dispute',
      resourceId: disputeId,
      beforeState: before,
      afterState: after,
      notes,
    });
    return after;
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async applyResolution(
    input: ResolveDisputeInput,
    match: Match,
    client: CustomClient,
  ): Promise<Match> {
    if (input.resolution === 'match_voided') {
      return this.deps.matchRepo.updateStatus(match.id, 'voided', client);
    }
    if (input.resolution === 'match_replay_required') {
      return this.deps.matchRepo.updateStatus(match.id, 'cancelled', client);
    }

    let scoreA: number;
    let scoreB: number;
    if (input.resolution === 'admin_decided_score') {
      scoreA = input.scoreA!;
      scoreB = input.scoreB!;
    } else {
      const submissions = await this.deps.submissionRepo.findByMatch(match.id, client);
      const which = input.resolution === 'side_a_result_stands' ? 'A' : 'B';
      const sub = submissions.find((s) => s.side === which);
      if (!sub) throw new ConflictError(`SIDE_${which}_HAS_NO_SUBMISSION`);
      scoreA = sub.scoreA;
      scoreB = sub.scoreB;
    }

    const participants = await this.deps.participantRepo.findByMatchId(match.id, client);
    await applyMatchEloAndStats(
      match, participants, scoreA, scoreB, client,
      {
        matchRepo: this.deps.matchRepo,
        teamEloRepo: this.deps.teamEloRepo,
        playerEloRepo: this.deps.playerEloRepo,
      },
    );
    return this.deps.matchRepo.setCompleted(match.id, scoreA, scoreB, client);
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
