import type { MatchMode, MatchStakes } from '../match/match.entity.js';

export type MatchInviteStatus = 'open' | 'claimed' | 'expired' | 'cancelled';

export interface MatchInvite {
  id: string;
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
  status: MatchInviteStatus;
  claimedByUserId: string | null;
  claimedByTeamId: string | null;
  claimedAt: Date | null;
  matchId: string | null;
  creatorConfirmedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
