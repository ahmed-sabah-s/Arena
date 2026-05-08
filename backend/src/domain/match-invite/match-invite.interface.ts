import type { CustomClient } from '../../db.js';
import type { MatchInvite, MatchInviteStatus } from './match-invite.entity.js';
import type { MatchMode, MatchStakes } from '../match/match.entity.js';

export interface CreateMatchInviteData {
  code: string;
  qrPayload: string;
  createdByUserId: string;
  creatorTeamId: string | null;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  stakes: MatchStakes;
  matchMode: MatchMode;
  venueId: string | null;
  expiresAt: Date;
}

export interface IMatchInviteRepository {
  create(input: CreateMatchInviteData): Promise<MatchInvite>;
  findById(id: string): Promise<MatchInvite | null>;
  findByCode(code: string): Promise<MatchInvite | null>;
  findByIdForUpdate(id: string, client: CustomClient): Promise<MatchInvite | null>;
  setStatus(id: string, status: MatchInviteStatus, client: CustomClient): Promise<MatchInvite>;
  setClaimed(
    id: string,
    claimedByUserId: string,
    claimedByTeamId: string | null,
    client: CustomClient,
  ): Promise<MatchInvite>;
  setCreatorConfirmed(id: string, matchId: string, client: CustomClient): Promise<MatchInvite>;
  findExpiringPast(): Promise<MatchInvite[]>;
}
