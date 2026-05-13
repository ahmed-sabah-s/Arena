import { transaction, query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import {
  AppError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/index.js';
import {
  getConfigBoolean,
  getConfigInteger,
  getConfigNumber,
} from '../../shared/config/platformConfig/index.js';
import type {
  RefereeAssignment,
  RefereeAssignmentRole,
  RefereeCaptainFlag,
  RefereeFlagReason,
} from './referee.entity.js';
import type {
  IRefereeAssignmentRepository,
  IRefereeCaptainFlagRepository,
  IRefereeProfileRepository,
} from './referee.interface.js';
import type { Match, MatchSide } from '../match/match.entity.js';
import type {
  IMatchParticipantRepository,
  IMatchRepository,
  IMatchStatRepository,
} from '../match/match.interface.js';
import { applyMatchEloAndStats, type MatchResolution } from '../match/match.elo.js';
import type { ITeamEloRepository, IPlayerEloRepository } from '../elo/elo.interface.js';
import type { NotificationService } from '../notification/notification.service.js';
import type { RefereeProfileService } from './referee.profile.service.js';
import type { RefereeConflictService } from './referee.conflict.service.js';

/** Most assignment-side ops need these dependencies; bundle for readability. */
export interface AssignmentServiceDeps {
  assignmentRepo: IRefereeAssignmentRepository;
  profileRepo: IRefereeProfileRepository;
  flagRepo: IRefereeCaptainFlagRepository;
  matchRepo: IMatchRepository;
  participantRepo: IMatchParticipantRepository;
  matchStatRepo: IMatchStatRepository;
  teamEloRepo: ITeamEloRepository;
  playerEloRepo: IPlayerEloRepository;
  profileService: RefereeProfileService;
  conflictService: RefereeConflictService;
  notificationService: NotificationService;
}

export interface RefereedStatInput {
  side: MatchSide;
  statKey: string;
  statValue: unknown;
  minute?: number | null;
  playerId?: string | null;
}

export interface SubmitRefereedResultInput {
  matchId: string;
  scoreA: number;
  scoreB: number;
  stats: RefereedStatInput[];
}

/**
 * Officiating lifecycle: assign → accept/decline → check in → start match →
 * submit result. Plus the off-the-happy-path ops (auto-promotion, reclaim,
 * captain flags). All time-based transitions (30/15/5 minute windows) are
 * exposed as admin-callable for Phase 6; Phase 8 will wire real schedulers.
 */
export class RefereeAssignmentService {
  constructor(private readonly deps: AssignmentServiceDeps) {}

  // ─── assignment ───────────────────────────────────────────────────────────

  async assignReferee(
    matchId: string,
    refereeUserId: string,
    role: RefereeAssignmentRole,
    byAdminUserId: string,
  ): Promise<RefereeAssignment> {
    await this.assertAdmin(byAdminUserId);

    const match = await this.deps.matchRepo.findById(matchId);
    if (!match) throw new NotFoundError('Match');
    if (match.matchMode !== 'refereed') throw new ValidationError('MATCH_NOT_REFEREED_MODE');
    if (match.status !== 'scheduled') throw new ConflictError('MATCH_NOT_SCHEDULED');

    await this.assertHasRefereeRole(refereeUserId);

    const profile = await this.deps.profileRepo.findByUserId(refereeUserId);
    if (!profile) throw new NotFoundError('RefereeProfile');
    if (!profile.isAcceptingAssignments) {
      throw new ConflictError('REFEREE_NOT_ACCEPTING_ASSIGNMENTS');
    }

    const certified = await this.deps.profileService.isCertifiedFor(refereeUserId, match.gameId);
    if (!certified) throw new ConflictError('REFEREE_NOT_CERTIFIED_FOR_GAME');

    const participants = await this.deps.participantRepo.findByMatchId(matchId);
    if (await this.deps.conflictService.hasConflictForMatch(refereeUserId, participants)) {
      throw new ConflictError('REFEREE_HAS_CONFLICT_OF_INTEREST');
    }

    // Same-team-frequency: count completed officiating against either team in the window.
    const limit = await getConfigInteger('referee_same_team_limit');
    const windowDays = await getConfigInteger('referee_conflict_window_days');
    for (const p of participants) {
      if (!p.teamId) continue;
      const officiated = await this.deps.assignmentRepo.countOfficiatedTeamMatchesInWindow(
        refereeUserId,
        p.teamId,
        windowDays,
      );
      if (officiated >= limit) {
        throw new ConflictError('REFEREE_SAME_TEAM_LIMIT_REACHED');
      }
    }

    if (role === 'main') {
      const existingMain = await this.deps.assignmentRepo.findActiveMainByMatch(matchId);
      if (existingMain) throw new ConflictError('MATCH_ALREADY_HAS_MAIN_REFEREE');
    } else {
      const assistants = await this.deps.assignmentRepo.findActiveAssistantsByMatch(matchId);
      if (assistants.length >= 2) throw new ConflictError('MAX_ASSISTANTS_REACHED');
    }

    const assignment = await this.deps.assignmentRepo.create({
      matchId,
      refereeUserId,
      role,
      assignedByUserId: byAdminUserId,
    });

    await this.deps.notificationService.enqueue({
      userId: refereeUserId,
      type: 'referee_assignment_offered',
      payload: { assignmentId: assignment.id, matchId, role },
    });
    return assignment;
  }

  async respondToAssignment(
    assignmentId: string,
    accept: boolean,
    byRefereeUserId: string,
    declineReason?: string,
  ): Promise<RefereeAssignment> {
    return await transaction(async (client) => {
      const assignment = await this.deps.assignmentRepo.findByIdForUpdate(assignmentId, client);
      if (!assignment) throw new NotFoundError('RefereeAssignment');
      if (assignment.refereeUserId !== byRefereeUserId) {
        throw new AuthorizationError('NOT_ASSIGNMENT_REFEREE');
      }
      if (assignment.status !== 'assigned') {
        throw new ConflictError('ASSIGNMENT_ALREADY_RESPONDED');
      }
      const updated = await this.deps.assignmentRepo.updateStatus(
        assignment.id,
        accept ? 'accepted' : 'declined',
        client,
        {
          respondedAt: new Date(),
          declineReason: accept ? null : declineReason ?? null,
        },
      );

      if (!accept) {
        await this.notifyAdmins('referee_declined_assignment', {
          assignmentId: assignment.id,
          matchId: assignment.matchId,
          refereeUserId: byRefereeUserId,
          reason: declineReason ?? null,
        }, client);
      }
      return updated;
    });
  }

  async triggerCheckInWindow(
    matchId: string,
    byAdminUserId: string,
  ): Promise<{ notified: number }> {
    await this.assertAdmin(byAdminUserId);
    const match = await this.deps.matchRepo.findById(matchId);
    if (!match) throw new NotFoundError('Match');
    if (match.matchMode !== 'refereed') throw new ValidationError('MATCH_NOT_REFEREED_MODE');
    if (match.status !== 'scheduled') throw new ConflictError('MATCH_NOT_SCHEDULED');
    // Phase 6: no time gate. Phase 8 will enforce the 30-min window via cron.
    const all = await this.deps.assignmentRepo.findByMatch(matchId);
    let notified = 0;
    for (const a of all) {
      if (a.status !== 'accepted') continue;
      await this.deps.notificationService.enqueue({
        userId: a.refereeUserId,
        type: 'referee_check_in_request',
        payload: { assignmentId: a.id, matchId },
      });
      notified += 1;
    }
    return { notified };
  }

  async checkIn(assignmentId: string, byRefereeUserId: string): Promise<RefereeAssignment> {
    return await transaction(async (client) => {
      const assignment = await this.deps.assignmentRepo.findByIdForUpdate(assignmentId, client);
      if (!assignment) throw new NotFoundError('RefereeAssignment');
      if (assignment.refereeUserId !== byRefereeUserId) {
        throw new AuthorizationError('NOT_ASSIGNMENT_REFEREE');
      }
      if (assignment.status !== 'accepted') {
        throw new ConflictError('ASSIGNMENT_NOT_ACCEPTED');
      }
      return this.deps.assignmentRepo.updateStatus(
        assignment.id,
        'checked_in',
        client,
        { checkedInAt: new Date() },
      );
    });
  }

  // ─── auto-promotion ───────────────────────────────────────────────────────

  /**
   * If the main hasn't checked in but at least one assistant has, promote the
   * oldest checked-in assistant to main. Apply a reliability penalty (first vs
   * repeat offence) to the no-showing main and increment their no-show count.
   *
   * Order matters: the partial unique index "one active main per match" treats
   * (assigned/accepted/checked_in) as active. We MUST flip the old main to
   * `no_show` before promoting the assistant, or the index trips.
   */
  async triggerAutoPromotion(
    matchId: string,
    byAdminUserId: string,
  ): Promise<{ promoted: boolean; oldMainUserId?: string; newMainUserId?: string }> {
    await this.assertAdmin(byAdminUserId);
    return await transaction(async (client) => {
      const match = await this.deps.matchRepo.findByIdForUpdate(matchId, client);
      if (!match) throw new NotFoundError('Match');
      if (match.matchMode !== 'refereed') throw new ValidationError('MATCH_NOT_REFEREED_MODE');
      if (match.status !== 'scheduled') throw new ConflictError('MATCH_NOT_SCHEDULED');

      const main = await this.deps.assignmentRepo.findActiveMainByMatch(matchId, client);
      if (!main) return { promoted: false };
      if (main.status === 'checked_in') return { promoted: false };

      const assistants = await this.deps.assignmentRepo.findActiveAssistantsByMatch(matchId, client);
      const checkedInAssistant = assistants.find((a) => a.status === 'checked_in');
      if (!checkedInAssistant) return { promoted: false };

      // Step 1: old main → no_show. Free the partial unique slot.
      await this.deps.assignmentRepo.updateStatus(main.id, 'no_show', client);

      // Step 2: assistant → main + checked_in.
      await this.deps.assignmentRepo.promoteToMain(checkedInAssistant.id, main.id, client);

      // Step 3: reliability penalty + no-show counter on the old main.
      const offenseWindow = await getConfigInteger('referee_offense_window_days');
      const noShowsInWindow = await this.deps.assignmentRepo.countNoShowsInWindow(
        main.refereeUserId,
        offenseWindow,
      );
      // The current promotion has already produced one no_show row; it counts
      // toward "this offence" — first offence = exactly 1 in window so far,
      // repeat = 2+. Reading the platform config separately for each penalty.
      const isRepeat = noShowsInWindow > 1;
      const penaltyKey = isRepeat
        ? 'referee_repeat_offense_penalty'
        : 'referee_first_offense_penalty';
      const penalty = await getConfigNumber(penaltyKey);
      await this.deps.profileRepo.applyReliabilityDelta(main.refereeUserId, -penalty, client);
      await this.deps.profileRepo.incrementCounter(main.refereeUserId, 'totalNoShows', client);

      // Notifications: old main + new main + admins
      await this.deps.notificationService.enqueue({
        userId: main.refereeUserId,
        type: 'referee_marked_no_show',
        payload: { matchId, isRepeat, penalty },
      }, client);
      await this.deps.notificationService.enqueue({
        userId: checkedInAssistant.refereeUserId,
        type: 'referee_promoted_to_main',
        payload: { matchId, fromAssignmentId: main.id },
      }, client);
      await this.notifyAdmins('referee_auto_promoted', {
        matchId,
        oldMainUserId: main.refereeUserId,
        newMainUserId: checkedInAssistant.refereeUserId,
      }, client);

      return {
        promoted: true,
        oldMainUserId: main.refereeUserId,
        newMainUserId: checkedInAssistant.refereeUserId,
      };
    });
  }

  /**
   * Reverse a recent auto-promotion — but ONLY if the match hasn't started.
   * Reliability penalty is NOT refunded; the no-show registered. Intentional:
   * we want a real cost for missing the check-in window even if the ref shows
   * up shortly after.
   *
   * Phase 6 doesn't time-gate by `referee_reclaim_grace_minutes` — the admin
   * cron from Phase 8 will close the window.
   */
  async reclaimMainSlot(
    assignmentId: string,
    byRefereeUserId: string,
  ): Promise<RefereeAssignment> {
    return await transaction(async (client) => {
      const noShowAssignment = await this.deps.assignmentRepo.findByIdForUpdate(assignmentId, client);
      if (!noShowAssignment) throw new NotFoundError('RefereeAssignment');
      if (noShowAssignment.refereeUserId !== byRefereeUserId) {
        throw new AuthorizationError('NOT_ASSIGNMENT_REFEREE');
      }
      if (noShowAssignment.status !== 'no_show') {
        throw new ConflictError('ASSIGNMENT_NOT_NO_SHOW');
      }

      const match = await this.deps.matchRepo.findByIdForUpdate(noShowAssignment.matchId, client);
      if (!match) throw new NotFoundError('Match');
      if (match.status !== 'scheduled') throw new ConflictError('MATCH_ALREADY_STARTED');

      // Find the current active main and reverse its promotion.
      const currentMain = await this.deps.assignmentRepo.findActiveMainByMatch(
        noShowAssignment.matchId,
        client,
      );
      if (!currentMain) throw new ConflictError('NO_ACTIVE_MAIN_TO_RECLAIM');
      if (currentMain.promotedFromAssignmentId !== noShowAssignment.id) {
        throw new ConflictError('CURRENT_MAIN_WAS_NOT_PROMOTED_FROM_RECLAIMER');
      }

      // Phase 8: time-gate the reclaim window inline (Phase 6 had deferred
      // this to a sweep job; the cleaner answer is at-call-time). The
      // window is measured from when the auto-promotion swap happened —
      // i.e., the current main's promotedAt. Past the grace, reclaim is
      // refused; the no-show stands.
      const graceMinutes = await getConfigInteger('referee_reclaim_grace_minutes');
      if (!currentMain.promotedAt) {
        throw new ConflictError('NO_PROMOTION_TIMESTAMP');
      }
      const expiresAt = new Date(currentMain.promotedAt.getTime() + graceMinutes * 60_000);
      if (Date.now() > expiresAt.getTime()) {
        throw new ConflictError('RECLAIM_WINDOW_EXPIRED');
      }

      // Step 1: demote current main first. Same partial-unique dance.
      await this.deps.assignmentRepo.demoteToAssistant(currentMain.id, client);
      await this.deps.assignmentRepo.updateStatus(currentMain.id, 'checked_in', client);

      // Step 2: original main returns to checked_in, role main.
      const reclaimed = await client.query<RefereeAssignment>(
        `UPDATE "refereeAssignments"
         SET role = 'main', status = 'checked_in'
         WHERE id = :id
         RETURNING *`,
        { id: noShowAssignment.id },
      );
      const row = reclaimed.rows[0];
      if (!row) throw new AppError('Failed to reclaim main slot', 500);

      await this.deps.notificationService.enqueue({
        userId: byRefereeUserId,
        type: 'referee_reclaimed_main_slot',
        payload: { matchId: noShowAssignment.matchId },
      }, client);
      return row;
    });
  }

  // ─── start / submit ───────────────────────────────────────────────────────

  async startMatch(matchId: string, byRefereeUserId: string): Promise<Match> {
    return await transaction(async (client) => {
      const match = await this.deps.matchRepo.findByIdForUpdate(matchId, client);
      if (!match) throw new NotFoundError('Match');
      if (match.matchMode !== 'refereed') throw new ValidationError('MATCH_NOT_REFEREED_MODE');
      if (match.status !== 'scheduled') throw new ConflictError('MATCH_NOT_SCHEDULED');
      const main = await this.deps.assignmentRepo.findActiveMainByMatch(matchId, client);
      if (!main || main.refereeUserId !== byRefereeUserId) {
        throw new AuthorizationError('NOT_ACTIVE_MAIN_REFEREE');
      }
      if (main.status !== 'checked_in') {
        throw new ConflictError('MAIN_REFEREE_NOT_CHECKED_IN');
      }
      return this.deps.matchRepo.setStarted(match.id, client);
    });
  }

  async submitRefereedResult(
    input: SubmitRefereedResultInput,
    byRefereeUserId: string,
  ): Promise<{ resolution: MatchResolution }> {
    return await transaction(async (client) => {
      const match = await this.deps.matchRepo.findByIdForUpdate(input.matchId, client);
      if (!match) throw new NotFoundError('Match');
      if (match.matchMode !== 'refereed') throw new ValidationError('MATCH_NOT_REFEREED_MODE');
      if (match.status !== 'active') throw new ConflictError('MATCH_NOT_ACTIVE');

      const main = await this.deps.assignmentRepo.findActiveMainByMatch(input.matchId, client);
      if (!main || main.refereeUserId !== byRefereeUserId) {
        throw new AuthorizationError('NOT_ACTIVE_MAIN_REFEREE');
      }

      // Stats are referee-recorded — write directly to matchStats, skip logs.
      for (const stat of input.stats) {
        await this.deps.matchStatRepo.create(
          {
            matchId: match.id,
            side: stat.side,
            statKey: stat.statKey,
            statValue: stat.statValue,
            minute: stat.minute ?? null,
            playerId: stat.playerId ?? null,
            verificationStatus: 'referee_recorded',
          },
          client,
        );
      }

      const participants = await this.deps.participantRepo.findByMatchId(match.id, client);
      const resolution = await applyMatchEloAndStats(
        match,
        participants,
        input.scoreA,
        input.scoreB,
        client,
        {
          matchRepo: this.deps.matchRepo,
          teamEloRepo: this.deps.teamEloRepo,
          playerEloRepo: this.deps.playerEloRepo,
          participantRepo: this.deps.participantRepo,
        },
      );
      await this.deps.matchRepo.setCompleted(match.id, input.scoreA, input.scoreB, client);

      // Mark main + assistants completed (they served the match end-to-end).
      const allAssignments = await this.deps.assignmentRepo.findByMatch(match.id, client);
      for (const a of allAssignments) {
        if (a.status === 'checked_in') {
          await this.deps.assignmentRepo.updateStatus(a.id, 'completed', client);
        }
      }

      // Bump main's officiated count + lastOfficiatedAt.
      await this.deps.profileRepo.incrementCounter(
        byRefereeUserId, 'totalMatchesOfficiated', client,
      );
      await this.deps.profileRepo.setLastOfficiatedAt(byRefereeUserId, new Date(), client);

      // Best-effort participant notifications (failures don't roll back resolution).
      try {
        await this.notifyMatchCompletedByReferee(match, byRefereeUserId, client);
      } catch (err) {
        console.error('[RefereeAssignmentService] notifyMatchCompletedByReferee failed:', err);
      }
      return { resolution };
    });
  }

  // ─── captain flag ─────────────────────────────────────────────────────────

  async flagReferee(
    matchId: string,
    refereeUserId: string,
    byCaptainUserId: string,
    reason: RefereeFlagReason,
    description?: string,
  ): Promise<RefereeCaptainFlag> {
    const match = await this.deps.matchRepo.findById(matchId);
    if (!match) throw new NotFoundError('Match');
    if (match.status !== 'completed' && match.status !== 'disputed') {
      throw new ConflictError('MATCH_NOT_COMPLETED_OR_DISPUTED');
    }

    const participants = await this.deps.participantRepo.findByMatchId(matchId);
    const captainSide = await this.findCaptainSideOrThrow(participants, byCaptainUserId);

    // Verify the flagged ref actually officiated this match.
    const refereeAssignment = await this.deps.assignmentRepo.findActiveAssignmentForReferee(
      matchId, refereeUserId,
    );
    if (!refereeAssignment) throw new NotFoundError('RefereeAssignment');

    return await transaction(async (client) => {
      let flag: RefereeCaptainFlag;
      try {
        flag = await this.deps.flagRepo.create(
          {
            matchId,
            refereeUserId,
            flaggedByUserId: byCaptainUserId,
            flaggedBySide: captainSide,
            reason,
            description: description ?? null,
          },
          client,
        );
      } catch (err: unknown) {
        if (isUniqueViolation(err)) throw new ConflictError('FLAG_ALREADY_EXISTS');
        throw err;
      }
      await this.deps.profileRepo.incrementCounter(refereeUserId, 'totalCaptainFlags', client);

      const threshold = await getConfigInteger('referee_flag_review_threshold');
      const windowDays = await getConfigInteger('referee_flag_window_days');
      const flagsInWindow = await this.deps.flagRepo.countByRefereeInWindow(
        refereeUserId, windowDays, client,
      );
      if (flagsInWindow >= threshold) {
        await this.notifyAdmins('referee_flag_threshold_reached', {
          refereeUserId, flagsInWindow, threshold, windowDays,
        }, client);
      }
      return flag;
    });
  }

  // ─── reads ────────────────────────────────────────────────────────────────

  async getMyAssignments(refereeUserId: string): Promise<RefereeAssignment[]> {
    return await query<RefereeAssignment>(
      `SELECT * FROM "refereeAssignments"
       WHERE "refereeUserId" = :refereeUserId
       ORDER BY "assignedAt" DESC
       LIMIT 100`,
      { refereeUserId },
    );
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  /** Light wrapper to keep behaviour consistent with profile/conflict services. */
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

  private async assertHasRefereeRole(userId: string): Promise<void> {
    const [row] = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM "userRole" ur
         JOIN role r ON r.id = ur."roleId"
         WHERE ur."userId" = :userId AND r.name = 'referee'
       ) AS exists`,
      { userId },
    );
    if (!row?.exists) throw new AuthorizationError('USER_LACKS_REFEREE_ROLE');
  }

  private async findCaptainSideOrThrow(
    participants: ReadonlyArray<{ side: MatchSide; teamId: string | null; userId: string | null }>,
    userId: string,
  ): Promise<MatchSide> {
    for (const p of participants) {
      if (p.teamId) {
        const rows = await query<{ id: string }>(
          `SELECT id FROM teams WHERE id = :teamId AND "captainId" = :userId`,
          { teamId: p.teamId, userId },
        );
        if (rows.length > 0) return p.side;
      } else if (p.userId === userId) {
        return p.side;
      }
    }
    throw new AuthorizationError('NOT_PARTICIPANT_CAPTAIN');
  }

  private async notifyAdmins(
    type: string,
    payload: Record<string, unknown>,
    client: CustomClient,
  ): Promise<void> {
    const admins = await query<{ id: string }>(
      `SELECT u.id FROM "user" u
       JOIN "userRole" ur ON ur."userId" = u.id
       JOIN role r ON r.id = ur."roleId"
       WHERE r.name = 'admin'`,
    );
    for (const a of admins) {
      await this.deps.notificationService.enqueue({ userId: a.id, type, payload }, client);
    }
  }

  private async notifyMatchCompletedByReferee(
    match: Match,
    refereeUserId: string,
    client: CustomClient,
  ): Promise<void> {
    if (await getConfigBoolean('match_completion_notification_enabled').catch(() => true)) {
      const participants = await this.deps.participantRepo.findByMatchId(match.id, client);
      const recipients = new Set<string>();
      for (const p of participants) {
        if (p.userId) recipients.add(p.userId);
        if (p.teamId) {
          const [t] = await query<{ captainId: string }>(
            `SELECT "captainId" FROM teams WHERE id = :teamId`,
            { teamId: p.teamId },
          );
          if (t?.captainId) recipients.add(t.captainId);
        }
      }
      for (const u of recipients) {
        await this.deps.notificationService.enqueue({
          userId: u,
          type: 'match_completed_by_referee',
          payload: { matchId: match.id, refereeUserId },
        }, client);
      }
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505',
  );
}
