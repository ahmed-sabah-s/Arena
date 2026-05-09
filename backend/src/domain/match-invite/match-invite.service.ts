import { transaction, query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import {
  AppError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  isPgError,
} from '../../shared/errors/index.js';
import { getConfigInteger } from '../../shared/config/platformConfig/index.js';
import {
  generateInviteCode,
  signQrPayload,
  verifyQrPayload,
} from './match-invite.qr.js';
import type { MatchInvite } from './match-invite.entity.js';
import type { IMatchInviteRepository } from './match-invite.interface.js';
import type { MatchService } from '../match/match.service.js';
import type { Match, MatchMode, MatchStakes } from '../match/match.entity.js';
import type { NotificationService } from '../notification/notification.service.js';

interface GameRow {
  id: string;
  participantType: 'team' | 'individual';
  isActive: boolean;
}

interface TeamRow {
  id: string;
  captainId: string;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  status: string;
}

export interface CreateInviteInput {
  gameId: string;
  formatId: string;
  divisionId?: string | null;
  creatorTeamId?: string;
  stakes: MatchStakes;
  matchMode: MatchMode;
  venueId?: string;
}

export interface PreviewInviteOutput {
  inviteId: string;
  code: string;
  status: MatchInvite['status'];
  gameId: string;
  formatId: string;
  divisionId: string | null;
  stakes: MatchStakes;
  matchMode: MatchMode;
  expiresAt: Date;
  creatorTeamId: string | null;
  // Public-safe fields only — no payload secrets.
}

export class MatchInviteService {
  constructor(
    private readonly repo: IMatchInviteRepository,
    private readonly matchService: MatchService,
    private readonly notificationService: NotificationService,
    private readonly jwtSecret: string,
  ) {}

  async createInvite(input: CreateInviteInput, byUserId: string): Promise<MatchInvite> {
    const game = await this.fetchGame(input.gameId);
    if (!game) throw new NotFoundError('Game');
    if (!game.isActive) throw new ValidationError('GAME_INACTIVE');

    let creatorTeamId: string | null = null;
    if (game.participantType === 'team') {
      if (!input.creatorTeamId) throw new ValidationError('TEAM_ID_REQUIRED_FOR_TEAM_GAME');
      const team = await this.fetchTeam(input.creatorTeamId);
      if (!team) throw new NotFoundError('Team');
      if (team.captainId !== byUserId) throw new AuthorizationError('NOT_TEAM_CAPTAIN');
      if (team.status !== 'active') throw new ValidationError('TEAM_NOT_ACTIVE');
      if (team.gameId !== input.gameId || team.formatId !== input.formatId) {
        throw new ValidationError('TEAM_SCOPE_MISMATCH');
      }
      creatorTeamId = team.id;
    }

    const expiryMinutes = await getConfigInteger('match_invite_expiry_minutes');
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Try a few collision retries — code space is 32^4 = 1M, collisions are rare.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateInviteCode();
      try {
        // Insert first to take the unique-code lock; sign QR after we know the id.
        // We can't sign before insert because we don't know the id yet. Sign-after-
        // insert means the qrPayload column is briefly empty between insert and the
        // follow-up update. To keep this atomic, we precompute a random id and sign
        // off it. But we use uuid_generate_v4() default — so two-phase: insert with
        // a placeholder, then update qrPayload using the returned id.
        const provisional = await this.repo.create({
          code,
          qrPayload: 'PENDING',
          createdByUserId: byUserId,
          creatorTeamId,
          gameId: input.gameId,
          formatId: input.formatId,
          divisionId: input.divisionId ?? null,
          stakes: input.stakes,
          matchMode: input.matchMode,
          venueId: input.venueId ?? null,
          expiresAt,
        });
        const qrPayload = signQrPayload(provisional.id, this.jwtSecret, expiryMinutes * 60);
        // Update with real qrPayload via raw SQL (no client needed, atomic single statement).
        const [row] = await query<MatchInvite>(
          `UPDATE "matchInvites" SET "qrPayload" = :qrPayload WHERE id = :id RETURNING *`,
          { qrPayload, id: provisional.id },
        );
        if (!row) throw new AppError('Failed to update invite QR payload', 500);
        return row;
      } catch (err: unknown) {
        if (isPgError(err) && err.code === '23505') {
          // Code collision — try again with a new code.
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new AppError('Failed to allocate a unique invite code', 500);
  }

  async previewInvite(input: { code?: string; qrPayload?: string }): Promise<PreviewInviteOutput> {
    const invite = await this.resolveByCodeOrPayload(input);
    if (!invite) throw new NotFoundError('MatchInvite');
    return {
      inviteId: invite.id,
      code: invite.code,
      status: invite.status,
      gameId: invite.gameId,
      formatId: invite.formatId,
      divisionId: invite.divisionId,
      stakes: invite.stakes,
      matchMode: invite.matchMode,
      expiresAt: invite.expiresAt,
      creatorTeamId: invite.creatorTeamId,
    };
  }

  async claimInvite(
    input: { code?: string; qrPayload?: string; claimingTeamId?: string },
    byUserId: string,
  ): Promise<{ status: 'awaiting_creator_confirmation' | 'completed'; match?: Match; invite: MatchInvite }> {
    return await transaction(async (client) => {
      const resolved = await this.resolveByCodeOrPayload(input);
      if (!resolved) throw new NotFoundError('MatchInvite');
      const invite = await this.repo.findByIdForUpdate(resolved.id, client);
      if (!invite) throw new NotFoundError('MatchInvite');
      if (invite.status !== 'open') throw new ConflictError('INVITE_NOT_OPEN');
      if (invite.expiresAt < new Date()) {
        await this.repo.setStatus(invite.id, 'expired', client);
        throw new ConflictError('INVITE_EXPIRED');
      }
      if (invite.createdByUserId === byUserId) {
        throw new ValidationError('CANNOT_CLAIM_OWN_INVITE');
      }

      // Eligibility checks for the claiming side
      const game = await this.fetchGame(invite.gameId);
      if (!game) throw new NotFoundError('Game');

      let claimedByTeamId: string | null = null;
      if (game.participantType === 'team') {
        if (!input.claimingTeamId) throw new ValidationError('CLAIMING_TEAM_ID_REQUIRED');
        const claimingTeam = await this.fetchTeam(input.claimingTeamId);
        if (!claimingTeam) throw new NotFoundError('Team');
        if (claimingTeam.captainId !== byUserId) throw new AuthorizationError('NOT_TEAM_CAPTAIN');
        if (claimingTeam.status !== 'active') throw new ValidationError('TEAM_NOT_ACTIVE');
        if (
          claimingTeam.gameId !== invite.gameId ||
          claimingTeam.formatId !== invite.formatId ||
          claimingTeam.divisionId !== invite.divisionId
        ) {
          throw new ValidationError('CLAIMING_TEAM_SCOPE_MISMATCH');
        }
        if (claimingTeam.id === invite.creatorTeamId) {
          throw new ValidationError('CANNOT_CLAIM_OWN_TEAM_INVITE');
        }
        claimedByTeamId = claimingTeam.id;
      }

      const updated = await this.repo.setClaimed(invite.id, byUserId, claimedByTeamId, client);

      // Friendly score_only / player_stats invites lock immediately on claim
      // (Phase 5.5). Refereed-mode invites always require creator confirmation
      // even when stakes is friendly — referees are a commitment and both
      // sides should agree explicitly.
      if (invite.stakes === 'friendly' && invite.matchMode !== 'refereed') {
        const { match, refreshedInvite } = await this.lockFriendlyMatch(
          updated, byUserId, claimedByTeamId, client,
        );
        return { status: 'completed' as const, match, invite: refreshedInvite };
      }

      // Ranked invites + refereed friendlies: creator must confirm.
      return { status: 'awaiting_creator_confirmation' as const, invite: updated };
    });
  }

  /**
   * Idempotent: friendly invites are auto-confirmed in claimInvite, so calling
   * confirmClaim on an already-confirmed invite returns the existing match
   * instead of erroring. Lets clients call confirmClaim unconditionally
   * without branching on stakes.
   */
  async confirmClaim(inviteId: string, byUserId: string): Promise<{ match: Match; invite: MatchInvite }> {
    const invite = await this.repo.findById(inviteId);
    if (!invite) throw new NotFoundError('MatchInvite');
    if (invite.status !== 'claimed') throw new ConflictError('INVITE_NOT_CLAIMED');
    if (!invite.claimedByUserId) throw new ConflictError('INVITE_HAS_NO_CLAIMER');

    // Idempotent path: invite already confirmed (friendly auto-confirm or a
    // duplicate confirmClaim call). Return the existing match.
    if (invite.creatorConfirmedAt && invite.matchId) {
      const existing = await this.matchService.getMatch(invite.matchId);
      return { match: existing.match, invite };
    }

    if (invite.stakes === 'ranked' && invite.createdByUserId !== byUserId) {
      throw new AuthorizationError('NOT_INVITE_CREATOR');
    }

    const sideA = {
      teamId: invite.creatorTeamId,
      userId: invite.creatorTeamId ? null : invite.createdByUserId,
    };
    const sideB = {
      teamId: invite.claimedByTeamId,
      userId: invite.claimedByTeamId ? null : invite.claimedByUserId,
    };

    const { match } = await transaction(async (client) => {
      const result = await this.matchService.createMatchFromInvite({
        inviteId: invite.id,
        gameId: invite.gameId,
        formatId: invite.formatId,
        divisionId: invite.divisionId,
        matchMode: invite.matchMode,
        stakes: invite.stakes,
        venueId: invite.venueId,
        sideA,
        sideB,
      }, client);
      await this.repo.setCreatorConfirmed(invite.id, result.match.id, client);
      await this.notifyMatchLocked(invite, result.match.id, client);
      return result;
    });

    const refreshed = await this.repo.findById(invite.id);
    return { match, invite: refreshed ?? invite };
  }

  async cancelInvite(inviteId: string, byUserId: string): Promise<{ cancelled: true }> {
    return await transaction(async (client) => {
      const invite = await this.repo.findByIdForUpdate(inviteId, client);
      if (!invite) throw new NotFoundError('MatchInvite');
      if (invite.createdByUserId !== byUserId) {
        throw new AuthorizationError('NOT_INVITE_CREATOR');
      }
      if (invite.status !== 'open' && invite.status !== 'claimed') {
        throw new ConflictError('INVITE_NOT_CANCELLABLE');
      }
      await this.repo.setStatus(invite.id, 'cancelled', client);
      return { cancelled: true } as const;
    });
  }

  async expirePastInvites(): Promise<{ expired: number }> {
    const past = await this.repo.findExpiringPast();
    let expired = 0;
    for (const invite of past) {
      try {
        await transaction(async (client) => {
          const refreshed = await this.repo.findByIdForUpdate(invite.id, client);
          if (!refreshed) return;
          if (refreshed.status === 'open' || refreshed.status === 'claimed') {
            await this.repo.setStatus(refreshed.id, 'expired', client);
            expired += 1;
          }
        });
      } catch (err) {
        console.error('[MatchInviteService] failed to expire invite:', invite.id, err);
      }
    }
    return { expired };
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  /**
   * Atomic friendly-claim flow. Caller has already locked the invite for update
   * and called setClaimed; we extend their transaction with match creation,
   * creator-confirm stamp, and notifications.
   */
  private async lockFriendlyMatch(
    claimed: MatchInvite,
    claimerUserId: string,
    claimerTeamId: string | null,
    client: CustomClient,
  ): Promise<{ match: Match; refreshedInvite: MatchInvite }> {
    const sideA = {
      teamId: claimed.creatorTeamId,
      userId: claimed.creatorTeamId ? null : claimed.createdByUserId,
    };
    const sideB = {
      teamId: claimerTeamId,
      userId: claimerTeamId ? null : claimerUserId,
    };

    const { match } = await this.matchService.createMatchFromInvite({
      inviteId: claimed.id,
      gameId: claimed.gameId,
      formatId: claimed.formatId,
      divisionId: claimed.divisionId,
      matchMode: claimed.matchMode,
      stakes: claimed.stakes,
      venueId: claimed.venueId,
      sideA,
      sideB,
    }, client);

    const refreshedInvite = await this.repo.setCreatorConfirmed(claimed.id, match.id, client);
    await this.notifyMatchLocked(claimed, match.id, client);
    return { match, refreshedInvite };
  }

  /**
   * Send "match_locked" notifications to both creator and claimer of an invite.
   * For team games the stored userIds are the captains, so this naturally
   * targets both captains; for individual games it targets the players directly.
   */
  private async notifyMatchLocked(
    invite: MatchInvite,
    matchId: string,
    client: CustomClient,
  ): Promise<void> {
    const recipients = new Set<string>();
    recipients.add(invite.createdByUserId);
    if (invite.claimedByUserId) recipients.add(invite.claimedByUserId);
    const payload = {
      matchId,
      inviteId: invite.id,
      stakes: invite.stakes,
      matchMode: invite.matchMode,
    };
    for (const userId of recipients) {
      await this.notificationService.enqueue(
        { userId, type: 'match_locked', payload },
        client,
      );
    }
  }

  private async resolveByCodeOrPayload(input: {
    code?: string;
    qrPayload?: string;
  }): Promise<MatchInvite | null> {
    if (input.qrPayload) {
      const decoded = verifyQrPayload(input.qrPayload, this.jwtSecret);
      return this.repo.findById(decoded.iid);
    }
    if (input.code) {
      return this.repo.findByCode(input.code);
    }
    throw new ValidationError('CODE_OR_PAYLOAD_REQUIRED');
  }

  private async fetchGame(id: string): Promise<GameRow | null> {
    const [row] = await query<GameRow>(
      `SELECT id, "participantType", "isActive" FROM games WHERE id = :id`,
      { id },
    );
    return row ?? null;
  }

  private async fetchTeam(id: string): Promise<TeamRow | null> {
    const [row] = await query<TeamRow>(
      `SELECT id, "captainId", "gameId", "formatId", "divisionId", status FROM teams WHERE id = :id`,
      { id },
    );
    return row ?? null;
  }
}
