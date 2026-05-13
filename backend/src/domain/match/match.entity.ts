export type MatchMode = 'refereed' | 'player_stats' | 'score_only';
export type MatchStakes = 'ranked' | 'friendly';
export type MatchStatus =
  | 'scheduled'
  | 'active'
  | 'awaiting_confirmation'
  | 'completed'
  | 'disputed'
  | 'cancelled'
  | 'voided'
  | 'forfeited';
export type MatchSide = 'A' | 'B';
export type MatchCreationSource = 'queue' | 'qr_invite' | 'admin_created';
export type StatVerificationStatus = 'verified' | 'unverified' | 'referee_recorded';
export type DisputeStatus = 'open' | 'resolved' | 'dismissed';

export interface Match {
  id: string;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  seasonId: string | null;
  matchMode: MatchMode;
  stakes: MatchStakes;
  status: MatchStatus;
  venueId: string | null;
  scheduledAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  finalScoreA: number | null;
  finalScoreB: number | null;
  creationSource: MatchCreationSource;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchParticipant {
  id: string;
  matchId: string;
  side: MatchSide;
  teamId: string | null;
  userId: string | null;
  statKeeperUserId: string | null;
  mmrAtMatch: number;
  eloAtMatch: number;
  matchesPlayedAtMatch: number;
  // Phase 8: post-resolution snapshot, populated by applyMatchEloAndStats.
  // Null on rows that resolved before migration 037 was applied.
  mmrAfterMatch: number | null;
  eloAfterMatch: number | null;
  matchesPlayedAfterMatch: number | null;
}

export interface MatchSubmission {
  id: string;
  matchId: string;
  side: MatchSide;
  submittedByUserId: string;
  scoreA: number;
  scoreB: number;
  submittedAt: Date;
  notes: string | null;
}

export interface MatchStatLog {
  id: string;
  matchId: string;
  loggedByUserId: string;
  side: MatchSide;
  statKey: string;
  statValue: unknown;
  minute: number | null;
  playerId: string | null;
  recordedAt: Date;
}

export interface MatchStat {
  id: string;
  matchId: string;
  side: MatchSide;
  statKey: string;
  statValue: unknown;
  minute: number | null;
  playerId: string | null;
  verificationStatus: StatVerificationStatus;
  createdAt: Date;
}

export interface Dispute {
  id: string;
  matchId: string;
  openedByUserId: string;
  openedBySide: MatchSide;
  reason: string;
  claimedScoreA: number | null;
  claimedScoreB: number | null;
  status: DisputeStatus;
  resolution: string | null;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
