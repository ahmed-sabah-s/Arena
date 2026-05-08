import { transaction, query } from '../../db.js';
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
    private readonly jwtSecret: string,
  ) {}

  async createInvite(input: CreateInviteInput, byUserId: string): Promise<MatchInvite> {
    if (input.matchMode === 'refereed') {
      throw new AppError('NOT_IMPLEMENTED_UNTIL_PHASE_6', 501);
    }
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

      if (invite.stakes === 'friendly') {
        // Friendly invites lock immediately on claim — create the match here.
        // The match service opens its own transaction; we exit ours first by
        // returning. To keep state consistent, we create the match AFTER this
        // tx commits via a separate call. Simpler: return without creating
        // here, and let the caller invoke confirmClaim — but the spec says
        // friendly auto-locks on claim. We approximate by enqueuing a follow-up
        // step done outside the tx (after commit).
        // Approach: store the claim, return special status, and have the router
        // immediately call confirmClaim on friendly stakes.
        return { status: 'awaiting_creator_confirmation' as const, invite: updated };
      }

      // Ranked invites: creator must confirm
      return { status: 'awaiting_creator_confirmation' as const, invite: updated };
    });
  }

  async confirmClaim(inviteId: string, byUserId: string): Promise<{ match: Match; invite: MatchInvite }> {
    const invite = await this.repo.findById(inviteId);
    if (!invite) throw new NotFoundError('MatchInvite');
    if (invite.status !== 'claimed') throw new ConflictError('INVITE_NOT_CLAIMED');
    if (invite.createdByUserId !== byUserId && invite.stakes === 'ranked') {
      throw new AuthorizationError('NOT_INVITE_CREATOR');
    }
    if (!invite.claimedByUserId) throw new ConflictError('INVITE_HAS_NO_CLAIMER');

    const sideA = {
      teamId: invite.creatorTeamId,
      userId: invite.creatorTeamId ? null : invite.createdByUserId,
    };
    const sideB = {
      teamId: invite.claimedByTeamId,
      userId: invite.claimedByTeamId ? null : invite.claimedByUserId,
    };

    const { match } = await this.matchService.createMatchFromInvite({
      inviteId: invite.id,
      gameId: invite.gameId,
      formatId: invite.formatId,
      divisionId: invite.divisionId,
      matchMode: invite.matchMode,
      stakes: invite.stakes,
      venueId: invite.venueId,
      sideA,
      sideB,
    });

    // createMatchFromInvite already updates the invite status to 'claimed' and
    // sets matchId. Stamp creatorConfirmedAt for ranked invites.
    if (invite.stakes === 'ranked') {
      await transaction(async (client) => {
        await this.repo.setCreatorConfirmed(invite.id, match.id, client);
      });
    } else {
      // Friendly: also stamp matchId now that we have one.
      await transaction(async (client) => {
        await this.repo.setCreatorConfirmed(invite.id, match.id, client);
      });
    }

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
