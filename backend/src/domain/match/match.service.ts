import { transaction, query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import {
  AppError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/index.js';
import type {
  Match,
  MatchMode,
  MatchParticipant,
  MatchSide,
  MatchStakes,
} from './match.entity.js';
import type {
  IDisputeRepository,
  IMatchParticipantRepository,
  IMatchRepository,
  IMatchStatLogRepository,
  IMatchStatRepository,
  IMatchSubmissionRepository,
} from './match.interface.js';
import type {
  ITeamEloRepository,
  IPlayerEloRepository,
} from '../elo/elo.interface.js';
import type { TeamElo, PlayerElo } from '../elo/elo.entity.js';
import { applyMatchEloAndStats, type MatchResolution } from './match.elo.js';
import { persistReconciledStats } from './match.reconciliation.js';
import { getConfigInteger } from '../../shared/config/platformConfig/index.js';
import type { NotificationService } from '../notification/notification.service.js';

interface QueueEntryRow {
  id: string;
  teamId: string | null;
  userId: string | null;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  mmrAtQueue: number;
  status: string;
}

interface CreateMatchFromQueueInput {
  entryAId: string;
  entryBId: string;
  matchMode: MatchMode;
  stakes: MatchStakes;
}

interface CreateMatchFromInviteInput {
  inviteId: string;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  matchMode: MatchMode;
  stakes: MatchStakes;
  venueId: string | null;
  /** Side A: invite creator. Either teamId or userId must be set. */
  sideA: { teamId: string | null; userId: string | null };
  /** Side B: claimer. */
  sideB: { teamId: string | null; userId: string | null };
}

export class MatchService {
  constructor(
    private readonly matchRepo: IMatchRepository,
    private readonly participantRepo: IMatchParticipantRepository,
    private readonly submissionRepo: IMatchSubmissionRepository,
    private readonly statLogRepo: IMatchStatLogRepository,
    private readonly statRepo: IMatchStatRepository,
    private readonly disputeRepo: IDisputeRepository,
    private readonly teamEloRepo: ITeamEloRepository,
    private readonly playerEloRepo: IPlayerEloRepository,
    private readonly notificationService: NotificationService,
  ) {}

  // ─── createMatchFromQueueEntries ───────────────────────────────────────────

  async createMatchFromQueueEntries(
    input: CreateMatchFromQueueInput,
  ): Promise<{ match: Match }> {
    if (input.matchMode === 'refereed') {
      throw new AppError('NOT_IMPLEMENTED_UNTIL_PHASE_6', 501);
    }
    return await transaction(async (client) => {
      // Lock both queue entries
      const a = await client.query<QueueEntryRow>(
        `SELECT * FROM "queueEntries" WHERE id = :id FOR UPDATE`,
        { id: input.entryAId },
      );
      const b = await client.query<QueueEntryRow>(
        `SELECT * FROM "queueEntries" WHERE id = :id FOR UPDATE`,
        { id: input.entryBId },
      );
      const eA = a.rows[0];
      const eB = b.rows[0];
      if (!eA || !eB) throw new NotFoundError('QueueEntry');
      // Accept entries in either 'waiting' or 'friendly_offered' status.
      // friendly_offered entries are users who exceeded the ranked-find window
      // and opted into matching anyone — they're still pairable, just transition
      // to the same 'matched' end-state.
      const PAIRABLE_STATUSES = new Set(['waiting', 'friendly_offered']);
      if (!PAIRABLE_STATUSES.has(eA.status) || !PAIRABLE_STATUSES.has(eB.status)) {
        throw new ConflictError('QUEUE_ENTRY_ALREADY_RESOLVED');
      }
      if (
        eA.gameId !== eB.gameId ||
        eA.formatId !== eB.formatId ||
        (eA.divisionId ?? null) !== (eB.divisionId ?? null)
      ) {
        throw new ValidationError('QUEUE_ENTRIES_SCOPE_MISMATCH');
      }

      // Snapshot current ELO state for both participants.
      const sideASnap = await this.snapshotEloForEntry(eA);
      const sideBSnap = await this.snapshotEloForEntry(eB);

      // Insert match
      const match = await this.matchRepo.create(
        {
          gameId: eA.gameId,
          formatId: eA.formatId,
          divisionId: eA.divisionId,
          seasonId: null,
          matchMode: input.matchMode,
          stakes: input.stakes,
          venueId: null,
          scheduledAt: new Date(),
          creationSource: 'queue',
        },
        client,
      );

      // Insert participants with snapshot values
      await this.participantRepo.create(
        {
          matchId: match.id, side: 'A',
          teamId: eA.teamId, userId: eA.userId,
          mmrAtMatch: sideASnap.mmr,
          eloAtMatch: sideASnap.elo,
          matchesPlayedAtMatch: sideASnap.matchesPlayed,
        },
        client,
      );
      await this.participantRepo.create(
        {
          matchId: match.id, side: 'B',
          teamId: eB.teamId, userId: eB.userId,
          mmrAtMatch: sideBSnap.mmr,
          eloAtMatch: sideBSnap.elo,
          matchesPlayedAtMatch: sideBSnap.matchesPlayed,
        },
        client,
      );

      // Update queue entries
      await client.query(
        `UPDATE "queueEntries"
         SET status = 'matched', "matchedWithEntryId" = :otherId,
             "matchId" = :matchId, "matchedAt" = CURRENT_TIMESTAMP
         WHERE id = :id`,
        { id: eA.id, otherId: eB.id, matchId: match.id },
      );
      await client.query(
        `UPDATE "queueEntries"
         SET status = 'matched', "matchedWithEntryId" = :otherId,
             "matchId" = :matchId, "matchedAt" = CURRENT_TIMESTAMP
         WHERE id = :id`,
        { id: eB.id, otherId: eA.id, matchId: match.id },
      );

      // Notify both sides (per-user notifications go to captains for team matches,
      // or the user themselves for individual games).
      await this.notifyMatchFound(match, eA, eB, client);

      return { match };
    });
  }

  // ─── createMatchFromInvite ─────────────────────────────────────────────────

  /**
   * Inserts the match + participants and stamps the invite with `matchId`.
   *
   * Optionally accepts an existing transaction `client` so callers running
   * their own transaction (e.g. MatchInviteService.claimInvite for friendly
   * stakes) can include this work atomically. Without a client, opens its
   * own transaction.
   */
  async createMatchFromInvite(
    input: CreateMatchFromInviteInput,
    client?: CustomClient,
  ): Promise<{ match: Match }> {
    if (input.matchMode === 'refereed') {
      throw new AppError('NOT_IMPLEMENTED_UNTIL_PHASE_6', 501);
    }
    if (client) {
      return this.runCreateMatchFromInvite(input, client);
    }
    return await transaction((c) => this.runCreateMatchFromInvite(input, c));
  }

  private async runCreateMatchFromInvite(
    input: CreateMatchFromInviteInput,
    client: CustomClient,
  ): Promise<{ match: Match }> {
    const sideASnap = await this.snapshotEloForSide(
      input.sideA, input.gameId, input.formatId, input.divisionId, client,
    );
    const sideBSnap = await this.snapshotEloForSide(
      input.sideB, input.gameId, input.formatId, input.divisionId, client,
    );

    const match = await this.matchRepo.create(
      {
        gameId: input.gameId,
        formatId: input.formatId,
        divisionId: input.divisionId,
        seasonId: null,
        matchMode: input.matchMode,
        stakes: input.stakes,
        venueId: input.venueId,
        scheduledAt: new Date(),
        creationSource: 'qr_invite',
      },
      client,
    );

    await this.participantRepo.create(
      {
        matchId: match.id, side: 'A',
        teamId: input.sideA.teamId, userId: input.sideA.userId,
        mmrAtMatch: sideASnap.mmr, eloAtMatch: sideASnap.elo,
        matchesPlayedAtMatch: sideASnap.matchesPlayed,
      },
      client,
    );
    await this.participantRepo.create(
      {
        matchId: match.id, side: 'B',
        teamId: input.sideB.teamId, userId: input.sideB.userId,
        mmrAtMatch: sideBSnap.mmr, eloAtMatch: sideBSnap.elo,
        matchesPlayedAtMatch: sideBSnap.matchesPlayed,
      },
      client,
    );

    // Mark invite claimed (idempotent if already claimed by an outer transaction).
    await client.query(
      `UPDATE "matchInvites"
       SET status = 'claimed', "matchId" = :matchId
       WHERE id = :inviteId`,
      { matchId: match.id, inviteId: input.inviteId },
    );

    return { match };
  }

  // ─── startMatch / designateStatKeeper ─────────────────────────────────────

  async startMatch(matchId: string, byUserId: string): Promise<Match> {
    return await transaction(async (client) => {
      const match = await this.matchRepo.findByIdForUpdate(matchId, client);
      if (!match) throw new NotFoundError('Match');
      if (match.status !== 'scheduled') throw new ConflictError('MATCH_NOT_SCHEDULED');

      await this.assertCallerIsCaptainOrParticipant(matchId, byUserId);

      // For player_stats mode, ensure both sides have a stat keeper. Default to
      // the captain (for team games) if not already designated.
      if (match.matchMode === 'player_stats') {
        const participants = await this.participantRepo.findByMatchId(matchId);
        for (const p of participants) {
          if (!p.statKeeperUserId) {
            const defaultKeeper = await this.defaultStatKeeperForParticipant(p);
            if (defaultKeeper) {
              await this.participantRepo.setStatKeeper(matchId, p.side, defaultKeeper, client);
            }
          }
        }
      }

      return this.matchRepo.setStarted(match.id, client);
    });
  }

  async designateStatKeeper(
    matchId: string,
    statKeeperUserId: string,
    byUserId: string,
  ): Promise<MatchParticipant> {
    return await transaction(async (client) => {
      const match = await this.matchRepo.findByIdForUpdate(matchId, client);
      if (!match) throw new NotFoundError('Match');
      if (match.status !== 'scheduled' && match.status !== 'active') {
        throw new ConflictError('MATCH_NOT_DESIGNATABLE');
      }
      const callerSide = await this.findCaptainSideOrThrow(matchId, byUserId);
      // Verify designee belongs to caller's side
      const participant = await this.participantRepo.findByMatchAndSide(matchId, callerSide);
      if (!participant) throw new NotFoundError('MatchParticipant');
      if (participant.teamId) {
        const member = await query<{ id: string }>(
          `SELECT id FROM "teamMembers"
           WHERE "teamId" = :teamId AND "userId" = :userId AND "releasedAt" IS NULL`,
          { teamId: participant.teamId, userId: statKeeperUserId },
        );
        if (member.length === 0) {
          throw new ValidationError('STAT_KEEPER_NOT_ON_TEAM');
        }
      } else if (participant.userId !== statKeeperUserId) {
        throw new ValidationError('STAT_KEEPER_MUST_BE_PARTICIPANT');
      }

      return this.participantRepo.setStatKeeper(
        matchId, callerSide, statKeeperUserId, client,
      );
    });
  }

  // ─── logMatchStat ─────────────────────────────────────────────────────────

  async logMatchStat(input: {
    matchId: string;
    side: MatchSide;
    statKey: string;
    statValue: unknown;
    minute?: number;
    playerId?: string;
  }, byUserId: string): Promise<void> {
    const match = await this.matchRepo.findById(input.matchId);
    if (!match) throw new NotFoundError('Match');
    if (match.matchMode !== 'player_stats') {
      throw new ValidationError('STATS_ONLY_FOR_PLAYER_STATS_MODE');
    }
    if (match.status !== 'active') {
      throw new ConflictError('MATCH_NOT_ACTIVE_FOR_STAT_LOGGING');
    }

    // Caller must be the designated stat keeper for the supplied side
    const participant = await this.participantRepo.findByMatchAndSide(input.matchId, input.side);
    if (!participant) throw new NotFoundError('MatchParticipant');
    if (participant.statKeeperUserId !== byUserId) {
      throw new AuthorizationError('NOT_DESIGNATED_STAT_KEEPER');
    }

    await this.statLogRepo.create({
      matchId: input.matchId,
      loggedByUserId: byUserId,
      side: input.side,
      statKey: input.statKey,
      statValue: input.statValue,
      minute: input.minute ?? null,
      playerId: input.playerId ?? null,
    });
  }

  // ─── submitMatchResult / confirm / dispute ─────────────────────────────────

  async submitMatchResult(input: {
    matchId: string;
    scoreA: number;
    scoreB: number;
    notes?: string;
  }, byUserId: string): Promise<{ status: 'awaiting_other_side' | 'completed' | 'disputed'; resolution?: MatchResolution }> {
    return await transaction(async (client) => {
      const match = await this.matchRepo.findByIdForUpdate(input.matchId, client);
      if (!match) throw new NotFoundError('Match');
      if (match.matchMode === 'refereed') {
        throw new AppError('NOT_IMPLEMENTED_UNTIL_PHASE_6', 501);
      }
      if (match.status !== 'active' && match.status !== 'awaiting_confirmation') {
        throw new ConflictError('MATCH_NOT_SUBMITTABLE');
      }
      const callerSide = await this.findCaptainSideOrThrow(input.matchId, byUserId, client);

      await this.submissionRepo.upsert(
        {
          matchId: input.matchId,
          side: callerSide,
          submittedByUserId: byUserId,
          scoreA: input.scoreA,
          scoreB: input.scoreB,
          notes: input.notes,
        },
        client,
      );

      const submissions = await this.submissionRepo.findByMatch(input.matchId, client);
      if (submissions.length < 2) {
        await this.matchRepo.updateStatus(match.id, 'awaiting_confirmation', client);
        await this.notifyOtherSide(match, callerSide, 'result_needs_confirmation', client, {
          matchId: match.id, scoreA: input.scoreA, scoreB: input.scoreB,
        });
        return { status: 'awaiting_other_side' };
      }

      const subA = submissions.find((s) => s.side === 'A')!;
      const subB = submissions.find((s) => s.side === 'B')!;
      const agree = subA.scoreA === subB.scoreA && subA.scoreB === subB.scoreB;

      if (!agree) {
        await this.disputeRepo.create(
          {
            matchId: match.id,
            openedByUserId: byUserId,
            openedBySide: callerSide,
            reason: 'Score disagreement between submissions',
            claimedScoreA: input.scoreA,
            claimedScoreB: input.scoreB,
          },
          client,
        );
        await this.matchRepo.updateStatus(match.id, 'disputed', client);
        await this.notifyAdmins('dispute_opened', { matchId: match.id }, client);
        return { status: 'disputed' };
      }

      // Both sides agree → resolve.
      const resolution = await this.resolveAgreedMatch(
        match, subA.scoreA, subA.scoreB, client,
      );
      return { status: 'completed', resolution };
    });
  }

  async confirmOpposingResult(matchId: string, byUserId: string): Promise<{ status: 'completed'; resolution: MatchResolution }> {
    return await transaction(async (client) => {
      const match = await this.matchRepo.findByIdForUpdate(matchId, client);
      if (!match) throw new NotFoundError('Match');
      if (match.status !== 'awaiting_confirmation') {
        throw new ConflictError('MATCH_NOT_AWAITING_CONFIRMATION');
      }
      const callerSide = await this.findCaptainSideOrThrow(matchId, byUserId, client);
      const existing = await this.submissionRepo.findByMatch(matchId, client);
      const opposing = existing.find((s) => s.side !== callerSide);
      if (!opposing) throw new ConflictError('NO_OPPOSING_SUBMISSION');

      // Equivalent to submitting the same scores as the opposing side
      await this.submissionRepo.upsert(
        {
          matchId, side: callerSide, submittedByUserId: byUserId,
          scoreA: opposing.scoreA, scoreB: opposing.scoreB,
        },
        client,
      );

      const resolution = await this.resolveAgreedMatch(
        match, opposing.scoreA, opposing.scoreB, client,
      );
      return { status: 'completed', resolution };
    });
  }

  async disputeResult(input: {
    matchId: string;
    reason: string;
    claimedScoreA?: number;
    claimedScoreB?: number;
  }, byUserId: string): Promise<{ disputed: true }> {
    return await transaction(async (client) => {
      const match = await this.matchRepo.findByIdForUpdate(input.matchId, client);
      if (!match) throw new NotFoundError('Match');
      if (match.status !== 'active' && match.status !== 'awaiting_confirmation') {
        throw new ConflictError('MATCH_NOT_DISPUTABLE');
      }
      const callerSide = await this.findCaptainSideOrThrow(input.matchId, byUserId);
      const existing = await this.disputeRepo.findOpenForMatch(input.matchId);
      if (existing) throw new ConflictError('DISPUTE_ALREADY_OPEN');

      await this.disputeRepo.create(
        {
          matchId: input.matchId,
          openedByUserId: byUserId,
          openedBySide: callerSide,
          reason: input.reason,
          claimedScoreA: input.claimedScoreA,
          claimedScoreB: input.claimedScoreB,
        },
        client,
      );
      await this.matchRepo.updateStatus(match.id, 'disputed', client);
      await this.notifyAdmins('dispute_opened', { matchId: match.id, reason: input.reason }, client);
      return { disputed: true };
    });
  }

  // ─── applyForfeitWindow (admin/cron) ───────────────────────────────────────

  async applyForfeitWindow(): Promise<{ resolved: number; voided: number }> {
    const hours = await import('../../shared/config/platformConfig/index.js').then(
      (m) => m.getConfigInteger('both_confirm_forfeit_window_hours'),
    );
    const stuckMatches = await this.matchRepo.findAwaitingConfirmationOlderThan(hours);
    let resolved = 0;
    let voided = 0;
    for (const match of stuckMatches) {
      // The single-side submission stands. Resolve as if both sides agreed.
      const subs = await this.submissionRepo.findByMatch(match.id);
      const sub = subs[0];
      if (!sub) {
        // No submissions — void the match.
        await transaction(async (client) => {
          await this.matchRepo.updateStatus(match.id, 'voided', client);
        });
        voided += 1;
        continue;
      }
      await transaction(async (client) => {
        const refreshed = await this.matchRepo.findByIdForUpdate(match.id, client);
        if (!refreshed || refreshed.status !== 'awaiting_confirmation') return;
        await this.resolveAgreedMatch(refreshed, sub.scoreA, sub.scoreB, client);
      });
      resolved += 1;
    }
    return { resolved, voided };
  }

  // ─── reads ────────────────────────────────────────────────────────────────

  async getMatch(matchId: string): Promise<{ match: Match; participants: MatchParticipant[] }> {
    const match = await this.matchRepo.findById(matchId);
    if (!match) throw new NotFoundError('Match');
    const participants = await this.participantRepo.findByMatchId(matchId);
    return { match, participants };
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async resolveAgreedMatch(
    match: Match,
    finalScoreA: number,
    finalScoreB: number,
    client: CustomClient,
  ): Promise<MatchResolution> {
    // Stat reconciliation for player_stats mode (idempotent: no-op if no logs).
    if (match.matchMode === 'player_stats') {
      const logs = await this.statLogRepo.findByMatch(match.id);
      const toleranceMinutes = await getConfigInteger('stat_reconciliation_tolerance_minutes');
      await persistReconciledStats(logs, toleranceMinutes, this.statRepo, client);
    }

    const participants = await this.participantRepo.findByMatchId(match.id, client);
    const resolution = await applyMatchEloAndStats(
      match, participants, finalScoreA, finalScoreB, client,
      {
        matchRepo: this.matchRepo,
        teamEloRepo: this.teamEloRepo,
        playerEloRepo: this.playerEloRepo,
      },
    );

    await this.matchRepo.setCompleted(match.id, finalScoreA, finalScoreB, client);

    // Best-effort notifications. Failures don't roll back resolution.
    try {
      await this.notifyMatchCompleted(match, resolution, client);
    } catch (err) {
      console.error('[MatchService] notifyMatchCompleted failed:', err);
    }
    return resolution;
  }

  private async snapshotEloForEntry(
    entry: QueueEntryRow,
  ): Promise<{ elo: number; mmr: number; matchesPlayed: number }> {
    if (entry.teamId) {
      const elo = await this.teamEloRepo.findByTeam(
        entry.teamId, entry.gameId, entry.formatId, entry.divisionId, null,
      );
      if (!elo) throw new ConflictError('TEAM_ELO_NOT_FOUND_AT_QUEUE');
      return { elo: elo.elo, mmr: elo.mmr, matchesPlayed: elo.matchesPlayed };
    }
    if (entry.userId) {
      const elo = await this.playerEloRepo.findByUser(
        entry.userId, entry.gameId, entry.formatId, entry.divisionId, null,
      );
      if (!elo) throw new ConflictError('PLAYER_ELO_NOT_FOUND_AT_QUEUE');
      return { elo: elo.elo, mmr: elo.mmr, matchesPlayed: elo.matchesPlayed };
    }
    throw new ConflictError('QUEUE_ENTRY_HAS_NEITHER_TEAM_NOR_USER');
  }

  private async snapshotEloForSide(
    side: { teamId: string | null; userId: string | null },
    gameId: string, formatId: string, divisionId: string | null,
    _client: CustomClient,
  ): Promise<{ elo: number; mmr: number; matchesPlayed: number }> {
    if (side.teamId) {
      const elo = await this.teamEloRepo.findByTeam(side.teamId, gameId, formatId, divisionId, null);
      if (!elo) throw new ConflictError('TEAM_ELO_NOT_FOUND');
      return { elo: elo.elo, mmr: elo.mmr, matchesPlayed: elo.matchesPlayed };
    }
    if (side.userId) {
      const elo = await this.playerEloRepo.findByUser(side.userId, gameId, formatId, divisionId, null);
      if (!elo) throw new ConflictError('PLAYER_ELO_NOT_FOUND');
      return { elo: elo.elo, mmr: elo.mmr, matchesPlayed: elo.matchesPlayed };
    }
    throw new ConflictError('SIDE_HAS_NEITHER_TEAM_NOR_USER');
  }

  private async assertCallerIsCaptainOrParticipant(
    matchId: string, userId: string,
  ): Promise<MatchSide> {
    return this.findCaptainSideOrThrow(matchId, userId);
  }

  private async findCaptainSideOrThrow(matchId: string, userId: string, client?: CustomClient): Promise<MatchSide> {
    const participants = await this.participantRepo.findByMatchId(matchId, client);
    for (const p of participants) {
      if (p.teamId) {
        let captainRows: Array<{ id: string }>;
        if (client) {
          const res = await client.query<{ id: string }>(
            `SELECT id FROM teams WHERE id = :teamId AND "captainId" = :userId`,
            { teamId: p.teamId, userId },
          );
          captainRows = res.rows;
        } else {
          captainRows = await query<{ id: string }>(
            `SELECT id FROM teams WHERE id = :teamId AND "captainId" = :userId`,
            { teamId: p.teamId, userId },
          );
        }
        if (captainRows.length > 0) return p.side;
      } else if (p.userId === userId) {
        return p.side;
      }
    }
    throw new AuthorizationError('NOT_MATCH_CAPTAIN_OR_PARTICIPANT');
  }

  private async defaultStatKeeperForParticipant(
    p: MatchParticipant,
  ): Promise<string | null> {
    if (p.userId) return p.userId;
    if (p.teamId) {
      const rows = await query<{ captainId: string }>(
        `SELECT "captainId" FROM teams WHERE id = :teamId`,
        { teamId: p.teamId },
      );
      return rows[0]?.captainId ?? null;
    }
    return null;
  }

  // ─── notification helpers ────────────────────────────────────────────────

  private async notifyMatchFound(
    match: Match,
    eA: QueueEntryRow,
    eB: QueueEntryRow,
    client: CustomClient,
  ): Promise<void> {
    const targets = [
      ...(await this.recipientUserIdsFor(eA)),
      ...(await this.recipientUserIdsFor(eB)),
    ];
    for (const userId of targets) {
      await this.notificationService.enqueue(
        {
          userId,
          type: 'match_found',
          payload: { matchId: match.id, scheduledAt: match.scheduledAt },
        },
        client,
      );
    }
  }

  private async notifyOtherSide(
    match: Match, callerSide: MatchSide, type: string,
    client: CustomClient, payload: Record<string, unknown>,
  ): Promise<void> {
    const otherSide: MatchSide = callerSide === 'A' ? 'B' : 'A';
    const participant = await this.participantRepo.findByMatchAndSide(match.id, otherSide);
    if (!participant) return;
    const targets = await this.recipientUserIdsForParticipant(participant);
    for (const userId of targets) {
      await this.notificationService.enqueue(
        { userId, type, payload }, client,
      );
    }
  }

  private async notifyMatchCompleted(
    match: Match, resolution: MatchResolution, client: CustomClient,
  ): Promise<void> {
    const participants = await this.participantRepo.findByMatchId(match.id, client);
    for (const p of participants) {
      const targets = await this.recipientUserIdsForParticipant(p);
      const sideSummary = resolution.sides.find((s) => s.side === p.side)!;
      for (const userId of targets) {
        await this.notificationService.enqueue(
          {
            userId,
            type: 'match_completed',
            payload: {
              matchId: match.id,
              finalScoreA: resolution.finalScoreA,
              finalScoreB: resolution.finalScoreB,
              eloChange: sideSummary.eloChange,
              newElo: sideSummary.newElo,
              isRanked: resolution.isRanked,
            },
          },
          client,
        );
      }
    }
  }

  private async notifyAdmins(
    type: string, payload: Record<string, unknown>, client: CustomClient,
  ): Promise<void> {
    const admins = await query<{ id: string }>(
      `SELECT u.id FROM "user" u
       JOIN "userRole" ur ON ur."userId" = u.id
       JOIN role r ON r.id = ur."roleId"
       WHERE r.name = 'admin'`,
    );
    for (const a of admins) {
      await this.notificationService.enqueue({ userId: a.id, type, payload }, client);
    }
  }

  private async recipientUserIdsFor(entry: QueueEntryRow): Promise<string[]> {
    if (entry.userId) return [entry.userId];
    if (entry.teamId) {
      const rows = await query<{ captainId: string }>(
        `SELECT "captainId" FROM teams WHERE id = :teamId`,
        { teamId: entry.teamId },
      );
      return rows[0] ? [rows[0].captainId] : [];
    }
    return [];
  }

  private async recipientUserIdsForParticipant(p: MatchParticipant): Promise<string[]> {
    if (p.userId) return [p.userId];
    if (p.teamId) {
      const rows = await query<{ captainId: string }>(
        `SELECT "captainId" FROM teams WHERE id = :teamId`,
        { teamId: p.teamId },
      );
      return rows[0] ? [rows[0].captainId] : [];
    }
    return [];
  }
}

// Inject TeamElo / PlayerElo types for local lookups (to keep the public surface narrower).
export type { TeamElo, PlayerElo };
